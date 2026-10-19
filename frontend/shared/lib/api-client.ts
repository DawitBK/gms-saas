'use client';

import axios, { AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { resolveApiBaseUrl } from '@shared/lib/api-base-url';
import { buildLoginRedirectPath, getCurrentAppPath } from '@shared/lib/auth-redirect';
import { useAuthStore } from '@state/auth.store';
import { toast } from 'sonner';
import { LICENSE_ERROR_MESSAGES, isLicenseErrorCode } from '@shared/lib/license';

export const apiClient = axios.create({
  baseURL: resolveApiBaseUrl(),
  withCredentials: true,
});

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
};

const readCookie = (name: string) => {
  if (typeof document === 'undefined') {
    return null;
  }

  const match = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
};

let refreshRequest: Promise<string> | null = null;

/**
 * Serialise refresh across TABS, not just within one.
 *
 * `refreshSession` rotates: it calls rotateSession(), which overwrites
 * `token_id` and `refresh_token_hash`, so the refresh token presented is dead
 * the instant the response is written. The cookie is shared by every tab on
 * the origin, so two tabs refreshing concurrently both read the same cookie,
 * one wins, and the loser presents a hash that no longer matches any row and
 * is signed out — from a page it had every right to be on.
 *
 * That race predates P1-21 (any two tabs hitting a 401 in the same instant
 * could hit it), but making the token memory-only means a reload no longer
 * arrives holding one, so refreshes now cluster at page load — exactly when a
 * session-restore opens several tabs at once. Serialising here turns the
 * collision into a queue: the second tab runs after the first has committed,
 * re-reads the cookie the first one just set, and refreshes from the current
 * token instead of a rotated-away one.
 *
 * Web Locks is origin-scoped and released automatically if the tab dies
 * mid-flight. Where it is unavailable the call still works — it just falls
 * back to the old unsynchronised behaviour rather than failing closed.
 */
const withCrossTabRefreshLock = async <T>(run: () => Promise<T>): Promise<T> => {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks?.request) {
    return run();
  }

  return locks.request('gms-token-refresh', run) as Promise<T>;
};

const applyAuthHeaders = (config: InternalAxiosRequestConfig) => {
  const { accessToken, selectedRole } = useAuthStore.getState();
  const headers =
    config.headers instanceof AxiosHeaders ? config.headers : new AxiosHeaders(config.headers ?? {});

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  if (selectedRole) {
    headers.set('X-Selected-Role', selectedRole);
  }

  // CSRF Protection
  const csrfToken = readCookie('gms_csrf_token');
  if (csrfToken) {
    headers.set('X-CSRF-Token', csrfToken);
  }

  config.headers = headers;
  return config;
};

const refreshAccessToken = async () => {
  if (!refreshRequest) {
    refreshRequest = withCrossTabRefreshLock(async () => {
      const response = await apiClient.post('/auth/refresh');

      const payload = response.data.data as {
        accessToken: string;
        user: { id: number; roles?: string[]; office_id?: number };
      };

      const { selectedRole, userId: previousUserId } = useAuthStore.getState();

      // FIX: the refresh cookie is shared across every tab with no per-tab
      // binding. If another tab logged in as a different user, this tab's
      // next 401-triggered refresh would silently adopt that identity mid
      // session — same screen, wrong person's token from here on. Refuse to
      // swap in place; force a hard reload so the tab re-initializes clean
      // under whichever identity the shared cookie now belongs to.
      if (previousUserId != null && previousUserId !== payload.user.id) {
        useAuthStore.getState().clearSession();
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
        throw new Error('Session identity changed in another tab');
      }

      useAuthStore.getState().setSession({
        accessToken: payload.accessToken,
        userId: payload.user.id,
        roles: payload.user.roles ?? [],
        officeId: payload.user.office_id,
      });

      if (selectedRole && (payload.user.roles ?? []).includes(selectedRole)) {
        useAuthStore.getState().setSelectedRole(selectedRole);
      }

      return payload.accessToken;
    }).finally(() => {
      refreshRequest = null;
    });
  }

  return refreshRequest;
};

/**
 * Re-obtain the in-memory access token after a reload (P1-21).
 *
 * The token is no longer persisted, so a freshly loaded tab has identity
 * context (`authenticated`, roles, officeId — see auth.store.ts) but nothing
 * to authenticate with. The httpOnly `gms_refresh_token` cookie is the proof
 * that survives, and this trades it for a live token.
 *
 * Called once at app start, before anything that needs a token in hand rather
 * than a retry-on-401 — the socket handshake above all, which authenticates
 * once at connect and has no interceptor to recover it.
 *
 * Returns null rather than throwing when there is no usable session: a failure
 * here means "not signed in", which is an ordinary state at app start, not an
 * error. The session is cleared so the UI stops claiming otherwise.
 */
export const bootstrapAccessToken = async (): Promise<string | null> => {
  const { authenticated, accessToken } = useAuthStore.getState();

  if (accessToken) return accessToken;
  if (!authenticated) return null;

  try {
    return await refreshAccessToken();
  } catch {
    useAuthStore.getState().clearSession();
    return null;
  }
};

apiClient.interceptors.request.use((config) => {
  return applyAuthHeaders(config);
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Standardize error message extraction
    const backendError = error?.response?.data?.error;
    if (backendError) {
      // If we have a structured backend error, use its message
      error.message = backendError.message;
      if (backendError.details && Array.isArray(backendError.details)) {
        // Append field-level details if they exist
        const details = backendError.details
          .map((d: any) => `${d.path}: ${d.message}`)
          .join(', ');
        if (details) error.message = `${backendError.message} (${details})`;
      }
    } else if (error?.response?.data?.message) {
      error.message = error.response.data.message;
    }

    const errorCode = error?.response?.data?.error?.code;
    if (errorCode === 'RATE_LIMIT_EXCEEDED') {
      toast.error('Too many requests. Please wait a moment and try again.', {
        id: 'rate-limit-error',
      });
    } else if (errorCode === 'MAINTENANCE_MODE') {
      toast.error('System is currently undergoing maintenance. Please try again later.', {
        id: 'maintenance-error',
      });
    } else if (isLicenseErrorCode(errorCode)) {
      // Licence refusals (403): say plainly what happened instead of a bare "Forbidden", and let any
      // screen that shows error.message read the same words. A disabled module is only announced for
      // an action (a background GET poll for a hidden module must stay silent).
      error.message = LICENSE_ERROR_MESSAGES[errorCode];
      const method = String(error?.config?.method ?? 'get').toLowerCase();
      if (errorCode !== 'LICENSE_MODULE_DISABLED' || method !== 'get') {
        toast.error(LICENSE_ERROR_MESSAGES[errorCode], { id: `license-${errorCode}` });
      }
    }

    const status = error?.response?.status;
    const requestConfig = error?.config as RetryableRequestConfig | undefined;
    const requestUrl = String(requestConfig?.url ?? '');
    const isAuthAttempt =
      requestUrl.includes('/auth/login') ||
      requestUrl.includes('/auth/register') ||
      requestUrl.includes('/auth/refresh') ||
      requestUrl.includes('/auth/verify-password');

    if (status === 401 && requestConfig && !requestConfig._retry && !isAuthAttempt) {
      requestConfig._retry = true;

      try {
        const nextAccessToken = await refreshAccessToken();
        const headers =
          requestConfig.headers instanceof AxiosHeaders
            ? requestConfig.headers
            : new AxiosHeaders(requestConfig.headers ?? {});
        headers.set('Authorization', `Bearer ${nextAccessToken}`);
        requestConfig.headers = headers;
        return apiClient(requestConfig);
      } catch {
        useAuthStore.getState().clearSession();
      }
    } else if (status === 401 && !isAuthAttempt) {
      useAuthStore.getState().clearSession();

      if (typeof window !== 'undefined') {
        const currentPath = getCurrentAppPath();
        const bp = process.env.NEXT_PUBLIC_BASE_PATH || '';
        // Strip basePath for reliable path comparison
        const rawPathname = window.location.pathname;
        const appPathname = bp && rawPathname.startsWith(bp)
          ? rawPathname.substring(bp.length)
          : rawPathname;
        const isAlreadyPublic =
          appPathname.startsWith('/login') || appPathname.startsWith('/select-role');

        if (!isAlreadyPublic) {
          // window.location.replace bypasses Next.js basePath — prepend manually
          const redirectPath = buildLoginRedirectPath(currentPath);
          window.location.replace(`${bp}${redirectPath}`);
        }
      }
    }

    return Promise.reject(error);
  }
);

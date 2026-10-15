/**
 * Outbound: GMS calling INTO SSO's per-user role-grant API (directive §6.3 —
 * SSO is the role system-of-record; GMS's admin UI writes through it instead
 * of only writing its own local `user_roles` table). Opposite direction from
 * `internal-sso.routes.ts`, which accepts SSO calling into GMS.
 */

import { appConfig } from '../../config/app.config';

export class SsoRolesApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'SsoRolesApiError';
    this.status = status;
  }
}

function baseUrl(): string {
  const configured = appConfig.sso.apiBase;
  if (!configured) {
    throw new SsoRolesApiError('SSO_API_BASE is not configured', 503);
  }
  return configured.replace(/\/+$/, '');
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!appConfig.sso.rolesApiKey) {
    throw new SsoRolesApiError('SSO_ROLES_API_KEY is not configured — GMS cannot write through to SSO', 503);
  }

  const url = `${baseUrl()}${path}`;
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 8_000);
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        'content-type': 'application/json',
        'x-internal-api-key': appConfig.sso.rolesApiKey,
        ...(init?.headers ?? {}),
      },
      signal: abort.signal,
    });
  } catch (err) {
    throw new SsoRolesApiError(`Could not reach SSO at ${url}: ${(err as Error).message}`, 503);
  } finally {
    clearTimeout(timeout);
  }

  const body = (await res.json().catch(() => null)) as {
    success?: boolean;
    data?: T;
    error?: { message?: string };
  } | null;

  if (!res.ok || body?.success === false) {
    throw new SsoRolesApiError(body?.error?.message ?? `SSO roles API request failed with status ${res.status}`, res.status);
  }

  return (body?.data ?? (body as unknown)) as T;
}

/** Current SSO-side grant for one user (empty array = no explicit grant). */
export async function getSsoGrantedRoles(email: string): Promise<string[]> {
  const result = await request<{ roles: string[] }>(`/api/v1/internal/gms/users/${encodeURIComponent(email.toLowerCase())}/roles`, {
    method: 'GET',
  });
  return result.roles;
}

/** Replace this user's entire GMS role-grant set in SSO (full-replace, matching setUserRoles' own semantics). */
export async function setSsoGrantedRoles(email: string, roles: string[], grantedBy: string): Promise<string[]> {
  const result = await request<{ roles: string[] }>(`/api/v1/internal/gms/users/${encodeURIComponent(email.toLowerCase())}/roles`, {
    method: 'PUT',
    body: JSON.stringify({ roles, grantedBy }),
  });
  return result.roles;
}

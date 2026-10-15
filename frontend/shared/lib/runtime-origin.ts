const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const isLoopbackHostname = (value: string) => LOOPBACK_HOSTNAMES.has(value.toLowerCase());

const isLoopbackUrl = (value: string) => {
  try {
    return isLoopbackHostname(new URL(value).hostname);
  } catch {
    return false;
  }
};

const isLocalDevBrowser = () => {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') {
    return false;
  }

  return isLoopbackHostname(window.location.hostname);
};

// Dev builds bake NEXT_PUBLIC_SOCKET_URL/NEXT_PUBLIC_APP_URL to plain localhost at
// `next dev` startup. When loaded through a non-loopback same-origin dev proxy (e.g.
// the SSO gateway at gms.localtest.me:4200, which proxies /socket.io back to this
// backend so the browser never needs cross-origin websockets at all), that baked-in
// value points at the wrong origin. Prefer the real runtime origin in that case —
// same pattern as `resolveApiBaseUrl` in `api-base-url.ts`.
const isNonLoopbackDevBrowserWithLoopbackExplicit = (explicit: string) =>
  process.env.NODE_ENV !== 'production' &&
  typeof window !== 'undefined' &&
  !isLoopbackHostname(window.location.hostname) &&
  isLoopbackUrl(explicit);

export const resolveSocketUrl = () => {
  if (isLocalDevBrowser()) {
    return `http://${window.location.hostname}:7200`;
  }

  const explicit = process.env.NEXT_PUBLIC_SOCKET_URL ?? '';
  if (explicit && isNonLoopbackDevBrowserWithLoopbackExplicit(explicit)) {
    return window.location.origin;
  }

  return trimTrailingSlash(explicit);
};

export const resolveAppUrl = () => {
  if (isLocalDevBrowser()) {
    return `http://${window.location.hostname}:7201`;
  }

  const explicit = process.env.NEXT_PUBLIC_APP_URL ?? '';
  if (explicit && isNonLoopbackDevBrowserWithLoopbackExplicit(explicit)) {
    return window.location.origin;
  }

  return trimTrailingSlash(explicit);
};

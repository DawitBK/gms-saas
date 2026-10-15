type ResolveApiBaseUrlOptions = {
  requestOrigin?: string;
};

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');
const basePath = trimTrailingSlash(process.env.NEXT_PUBLIC_BASE_PATH ?? '');
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

const isLoopbackHostname = (value: string) => LOOPBACK_HOSTNAMES.has(value.toLowerCase());

const isLoopbackUrl = (value: string) => {
  try {
    return isLoopbackHostname(new URL(value).hostname);
  } catch {
    return false;
  }
};

const shouldForceLocalDevApi = () => {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') {
    return false;
  }

  return isLoopbackHostname(window.location.hostname);
};

export const resolveApiBaseUrl = (options: ResolveApiBaseUrlOptions = {}) => {
  if (shouldForceLocalDevApi()) {
    return `http://${window.location.hostname}:7200/api/v1`;
  }

  const explicit =
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.API_BASE_URL;

  // A dev build's NEXT_PUBLIC_API_BASE_URL is baked in at `next dev` startup and is
  // plain-localhost (see frontend/.env.development). When the page is instead loaded
  // through a same-origin dev proxy on a non-loopback host (e.g. the SSO gateway at
  // gms.localtest.me:4200, which proxies /api/v1 back to this backend so the browser
  // never needs CORS at all), that baked-in value points at the wrong origin and every
  // XHR becomes cross-origin against a backend whose CORS allowlist doesn't include the
  // proxy host. Prefer the real runtime origin whenever this mismatch is detected, same
  // pattern already used by `shared/lib/qr-links.ts`'s resolveAppBaseUrl.
  if (
    explicit &&
    typeof window !== 'undefined' &&
    process.env.NODE_ENV !== 'production' &&
    isLoopbackUrl(explicit) &&
    !isLoopbackHostname(window.location.hostname)
  ) {
    return `${trimTrailingSlash(window.location.origin)}/api/v1`;
  }

  if (explicit) {
    return trimTrailingSlash(explicit);
  }

  if (typeof window !== 'undefined') {
    if (process.env.NODE_ENV !== 'production') {
      return 'http://127.0.0.1:7200/api/v1';
    }

    // No basePath prefix here: GMS's API stays unprefixed at /api/v1 even in
    // production (root CLAUDE.md — "GMS's own /api/v1 stays unprefixed, it's
    // already live and proven, don't touch its routing"), unlike the
    // frontend pages themselves, which do sit under /gms. Dead today since
    // .env.production always sets NEXT_PUBLIC_API_BASE_URL explicitly, but
    // `${basePath}/api/v1` here would nest under /gms/api/v1 if that var
    // were ever dropped.
    return '/api/v1';
  }

  if (options.requestOrigin) {
    return `${trimTrailingSlash(options.requestOrigin)}${basePath}/api/v1`;
  }

  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[GMS] API URL is defaulting to loopback in production. Ensure NEXT_PUBLIC_API_BASE_URL is set correctly during build.'
    );
  }

  return 'http://127.0.0.1:7200/api/v1';
};

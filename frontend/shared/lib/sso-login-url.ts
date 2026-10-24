// Entry point for "Sign in with Example Corp SSO" on the GMS login page.
//
// Unlike resolveApiBaseUrl/resolveSocketUrl/resolveAppUrl in api-base-url.ts and
// runtime-origin.ts, this URL is NOT same-origin-adjusted for the SSO gateway
// (gms.localtest.me:4200): the gateway only proxies /__sso, /api/v1, and
// /socket.io back to GMS itself (see the gateway in the SSO backend) — it does
// not host the SSO frontend's /bridge routes. So this always points at the
// separate SSO frontend origin (port 7301 in dev; the SSO frontend's server),
// whether GMS itself is being viewed directly at :7201 or through the gateway.
//
// The target route is /bridge/gms/start on the SSO frontend (proxied through to
// the SSO backend — see the SSO backend's bridge router, `router.get('/gms/start', ...)`).
// That route kicks off an OIDC authorization_code+PKCE round trip against the SSO
// backend's own /authorize endpoint: if the browser has no SSO session yet, the
// user is prompted to sign in there first; either way, the flow ends at
// /bridge/gms/callback, which mints a GMS session and redirects into the
// same-origin gateway's /__sso handoff, which seeds the GMS SPA's session and
// lands the user on their role's landing route.
const DEV_DEFAULT = "http://localhost:7301/bridge/gms/start";

export const resolveSsoLoginUrl = () => {
  const explicit = process.env.NEXT_PUBLIC_SSO_LOGIN_URL;
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }

  return DEV_DEFAULT;
};

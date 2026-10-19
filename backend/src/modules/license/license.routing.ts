/**
 * Which part of the API a request belongs to, for the licence gate. PURE (no I/O, no config).
 *
 * Paths here are relative to the `/api/v1` router (what `req.path` is inside it), lower-cased, decoded
 * and with trailing slashes removed, so `//Visits/` and `/%76isits` cannot slip past a classifier that
 * Express's own (case-insensitive, non-strict) routing would still match.
 */
import type { GmsLicenseModule } from './license.catalog';

export function normalizeLicensePath(rawPath: string): string {
  let decoded = rawPath;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    decoded = rawPath;
  }
  const collapsed = decoded.toLowerCase().replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  return collapsed === '' ? '/' : collapsed;
}

/**
 * Route group -> gateable module (contract section 7). Everything not listed is CORE and never gated:
 * auth, internal/sso, users, offices, departments, services, operations, license, health, metrics.
 *
 * `/visits/:id/messages` lives on the visits router but is the messages feature, so it belongs to
 * `notifications` (contract: "notifications (notifications, messages)").
 */
const MESSAGES_UNDER_VISITS = /^\/visits\/[^/]+\/messages$/;

const FIRST_SEGMENT_MODULE: Record<string, GmsLicenseModule> = {
  visits: 'visits',
  approvals: 'visits',
  guests: 'visits',
  hosts: 'visits',
  availability: 'scheduling',
  checkin: 'checkin',
  credentials: 'credentials',
  notifications: 'notifications',
  ocr: 'ocr',
};

export function moduleForPath(normalizedPath: string): GmsLicenseModule | null {
  if (MESSAGES_UNDER_VISITS.test(normalizedPath)) return 'notifications';
  const segments = normalizedPath.split('/').filter(Boolean);
  const [first, second] = segments;
  if (!first) return null;
  // The UniFi door webhooks are the check-in module's machine entry point.
  if (first === 'integrations' && second === 'unifi') return 'checkin';
  return FIRST_SEGMENT_MODULE[first] ?? null;
}

/**
 * Requests that still work while LICENSE_REQUIRED is true and the system is unlicensed (section 9): health,
 * the licence status and install routes, sign-in (login, its second factor, refresh, logout, `me`) and the
 * SSO bridge / native SSO sign-in under /internal/sso. Exact paths (so `/auth/login/x` is not exempt) and any
 * method. `/metrics` and `/health` are registered before the guard and never reach it; `/health` is listed so
 * the list stays true if that order ever changes. Static assets are not served by this API at all.
 */
export const LICENSE_REQUIRED_EXEMPT: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  { pattern: /^\/health$/, why: 'health' },
  { pattern: /^\/license\/status$/, why: 'licence status' },
  { pattern: /^\/license\/install$/, why: 'licence install' },
  { pattern: /^\/auth\/login$/, why: 'sign-in' },
  { pattern: /^\/auth\/verify-2fa$/, why: 'second factor at sign-in' },
  { pattern: /^\/auth\/refresh$/, why: 'session refresh' },
  { pattern: /^\/auth\/logout$/, why: 'sign-out' },
  { pattern: /^\/auth\/me$/, why: 'current session' },
  { pattern: /^\/internal\/sso(\/.*)?$/, why: 'SSO token bridge and native SSO sign-in' },
];

export const isLicenseRequiredExempt = (normalizedPath: string): boolean =>
  LICENSE_REQUIRED_EXEMPT.some((entry) => entry.pattern.test(normalizedPath));

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const isSafeMethod = (method: string): boolean => SAFE_METHODS.has(method.toUpperCase());

/**
 * The read-only guard's allowlist: unsafe-method requests that must keep working while the licence is
 * `expired` (contract section 6). Each entry has a test in license.guard.test.ts. Exact paths only.
 *
 * Sign-in/out and the account-security calls a signed-in person needs; the SSO bridge and the native
 * "Sign in with SSO" session minting; and POSTs that are really queries. NOT here on purpose:
 * `/auth/register`, `/auth/verify`, `/auth/resend-verification`, `/auth/update-registration-email`
 * (they create or activate accounts), and the UniFi webhook (it writes check-ins).
 */
export const READ_ONLY_ALLOWLIST: ReadonlyArray<{ methods: readonly string[] | '*'; pattern: RegExp; why: string }> = [
  { methods: ['POST'], pattern: /^\/auth\/login$/, why: 'sign-in' },
  { methods: ['POST'], pattern: /^\/auth\/logout$/, why: 'sign-out' },
  { methods: ['POST'], pattern: /^\/auth\/refresh$/, why: 'session refresh' },
  { methods: ['POST'], pattern: /^\/auth\/verify-2fa$/, why: 'second factor at sign-in' },
  { methods: ['POST'], pattern: /^\/auth\/forgot-password$/, why: 'password reset request' },
  { methods: ['POST'], pattern: /^\/auth\/reset-password$/, why: 'password reset' },
  { methods: ['POST'], pattern: /^\/auth\/change-password$/, why: 'a person changing their own password' },
  { methods: ['POST'], pattern: /^\/auth\/toggle-2fa$/, why: 'a person switching their own 2FA' },
  { methods: ['POST'], pattern: /^\/auth\/verify-password$/, why: 'password re-confirmation (a query)' },
  { methods: '*', pattern: /^\/internal\/sso(\/.*)?$/, why: 'SSO token bridge and native SSO sign-in' },
  { methods: ['POST'], pattern: /^\/ocr\/scan$/, why: 'OCR extraction (a query; stores nothing)' },
];

export function isReadOnlyAllowlisted(method: string, normalizedPath: string): boolean {
  const upper = method.toUpperCase();
  return READ_ONLY_ALLOWLIST.some(
    (entry) => (entry.methods === '*' || entry.methods.includes(upper)) && entry.pattern.test(normalizedPath),
  );
}

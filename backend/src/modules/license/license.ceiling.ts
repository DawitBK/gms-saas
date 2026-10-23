/**
 * The "SSO ends on this date" note (docs/operations/PLATFORM-LICENSING.md section 10; owner decision 2026-10-21).
 *
 * A client that holds an OFFLINE licence (signed on the owner's computer, verified against the pinned LICENSE_TRUST_PUBLIC_KEYS) cannot be re-signed by
 * SSO to follow SSO's own expiry: that would put the private licence key on the server. Instead SSO publishes a small note signed with its ordinary OIDC
 * key; this system verifies it against SSO's JWKS and ends at the EARLIER of its own licence date and the note's date.
 *
 * Safe without the owner's key because the note can only SHORTEN a licence: `applyCeiling` never moves an end date later, so a forged or replayed note
 * cannot grant time (the client's own offline-signed date is the hard backstop). Like the licence token it has no `exp` and carries no secret.
 *
 * Keep this file in step with DMS's modules/license/licenseCeiling.ts (the two are copies of one rule, adapted to each codebase).
 */
import crypto from 'crypto';
import { LicenseTokenError, type Jwk, type LicenseClaims } from './license.token';

export const CEILING_TOKEN_TYP = 'kcms-license-ceiling+jwt';
export const CEILING_AUDIENCE = 'license:ceiling';

export interface CeilingClaims {
  iss: string;
  ver: number;
  iat: number | null;
  customer: string;
  /** null = SSO's licence never expires: no limit. */
  expiresAt: Date | null;
  graceDays: number;
  warnDays: number;
  jti: string | null;
}

export interface CeilingVerifyOptions {
  /** The issuer the note must carry (SSO's own). */
  expectedIssuer: string;
  keys: Jwk[];
}

const b64urlToBuffer = (value: string): Buffer => Buffer.from(value, 'base64url');

function parsePart(part: string, what: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(b64urlToBuffer(part).toString('utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw new LicenseTokenError(`SSO expiry note ${what} is not a JSON object`, 'malformed');
}

const isDays = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 365;

export function verifyCeilingToken(token: string, options: CeilingVerifyOptions): CeilingClaims {
  if (typeof token !== 'string' || token.length === 0 || token.length > 16_384) throw new LicenseTokenError('SSO expiry note is missing or too large', 'malformed');
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) throw new LicenseTokenError('SSO expiry note is not a compact JWS', 'malformed');
  const [headerPart, payloadPart, signaturePart] = parts;
  const header = parsePart(headerPart, 'header');
  if (header.alg !== 'RS256') throw new LicenseTokenError('SSO expiry note alg must be RS256', 'bad_claims');
  if (header.typ !== CEILING_TOKEN_TYP) throw new LicenseTokenError(`SSO expiry note typ must be ${CEILING_TOKEN_TYP}`, 'bad_claims');
  if (typeof header.kid !== 'string' || !header.kid) throw new LicenseTokenError('SSO expiry note has no kid', 'malformed');

  const jwk = options.keys.find((key) => key.kid === header.kid && key.kty === 'RSA');
  if (!jwk) throw new LicenseTokenError(`no RSA key with kid ${header.kid} in SSO's JWKS`, 'unknown_kid');
  let signatureOk = false;
  try {
    const publicKey = crypto.createPublicKey({ key: jwk as unknown as import('crypto').JsonWebKeyInput['key'], format: 'jwk' });
    signatureOk = crypto.verify('RSA-SHA256', Buffer.from(`${headerPart}.${payloadPart}`, 'utf8'), publicKey, b64urlToBuffer(signaturePart));
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) throw new LicenseTokenError('SSO expiry note signature does not verify', 'bad_signature');

  const payload = parsePart(payloadPart, 'payload');
  if (typeof payload.iss !== 'string' || payload.iss.replace(/\/+$/, '') !== options.expectedIssuer.replace(/\/+$/, '')) {
    throw new LicenseTokenError('SSO expiry note issuer mismatch', 'bad_claims');
  }
  const aud = payload.aud;
  if (!(Array.isArray(aud) ? aud.includes(CEILING_AUDIENCE) : aud === CEILING_AUDIENCE)) throw new LicenseTokenError('SSO expiry note audience mismatch', 'bad_claims');
  if (payload.sys !== 'sso') throw new LicenseTokenError('SSO expiry note system mismatch', 'bad_claims');
  if (typeof payload.ver !== 'number' || !Number.isInteger(payload.ver) || payload.ver < 0) throw new LicenseTokenError('SSO expiry note ver is invalid', 'bad_claims');
  let expiresAt: Date | null = null;
  if (payload.expiresAt !== null && payload.expiresAt !== undefined) {
    if (typeof payload.expiresAt !== 'string') throw new LicenseTokenError('SSO expiry note expiresAt is invalid', 'bad_claims');
    expiresAt = new Date(payload.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) throw new LicenseTokenError('SSO expiry note expiresAt is not a date', 'bad_claims');
  }
  if (!isDays(payload.graceDays)) throw new LicenseTokenError('SSO expiry note graceDays is invalid', 'bad_claims');
  if (!isDays(payload.warnDays)) throw new LicenseTokenError('SSO expiry note warnDays is invalid', 'bad_claims');
  return {
    iss: payload.iss,
    ver: payload.ver,
    iat: typeof payload.iat === 'number' ? payload.iat : null,
    customer: typeof payload.customer === 'string' ? payload.customer : '',
    expiresAt,
    graceDays: payload.graceDays,
    warnDays: payload.warnDays,
    jti: typeof payload.jti === 'string' ? payload.jti : null,
  };
}

export type LimitedBy = 'licence' | 'sso';

const DAY_MS = 86_400_000;

/**
 * The licence as enforced: its own dates, unless SSO ends first, in which case SSO's date and warning days apply (as on the mirror, where SSO re-signs the
 * client token), with SSO's grace days capped so the system never stays usable past the instant its own licence's grace period ends: the note only shortens.
 *
 * A licence that may ALSO run standalone (`modes` includes `standalone`) is not tied to SSO and keeps its own dates (owner decision 2026-10-21); only a
 * licence valid solely behind SSO ends with SSO.
 */
export function applyCeiling(claims: LicenseClaims, ceiling: CeilingClaims | null): { claims: LicenseClaims; limitedBy: LimitedBy } {
  const own = { claims, limitedBy: 'licence' as const };
  if (!ceiling || ceiling.expiresAt === null) return own;
  if ((claims.modes ?? ['sso']).includes('standalone')) return own;
  const ownEnd = claims.expiresAt ? claims.expiresAt.getTime() : Number.POSITIVE_INFINITY;
  if (!(ceiling.expiresAt.getTime() < ownEnd)) return own;
  const room = Math.floor((ownEnd + claims.graceDays * DAY_MS - ceiling.expiresAt.getTime()) / DAY_MS);
  return {
    claims: { ...claims, expiresAt: ceiling.expiresAt, graceDays: Math.min(ceiling.graceDays, room), warnDays: ceiling.warnDays },
    limitedBy: 'sso',
  };
}

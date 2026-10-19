/**
 * Licence token verification (docs/operations/PLATFORM-LICENSING.md section 4).
 *
 * A compact RS256 JWS signed by SSO's OIDC signing key. Node's own crypto is enough: the RSA JWK from
 * SSO's JWKS goes straight into `createPublicKey({ key, format: 'jwk' })`; no new dependency.
 *
 * There is deliberately NO `exp` check. The licence's own dates are the expiry, and a consumer that
 * rejected a token for its age would lock itself out the moment SSO went quiet (principle 2).
 *
 * Anything that fails here means "reject this token and keep the previous good one", never "block".
 */
import crypto from 'crypto';

export const LICENSE_TOKEN_TYP = 'kcms-license+jwt';

export interface Jwk {
  kty?: string;
  kid?: string;
  n?: string;
  e?: string;
  alg?: string;
  use?: string;
  [key: string]: unknown;
}

export interface LicenseClaims {
  iss: string;
  aud: string;
  sys: string;
  ver: number;
  iat: number | null;
  customer: string;
  /** null = perpetual */
  expiresAt: Date | null;
  graceDays: number;
  warnDays: number;
  /** null = unlimited */
  maxUsers: number | null;
  /** null = all gateable modules enabled */
  modules: string[] | null;
  /**
   * Deployment modes this licence covers (section 9). Absent or empty in the token means `['sso']`;
   * `verifyLicenseToken` always fills it in. Optional in the type only so older fixtures still compile.
   */
  modes?: LicenseMode[];
  /** Unique id of this issued token (audit); null when the token has none. */
  jti?: string | null;
}

export type LicenseMode = 'sso' | 'standalone';
export const LICENSE_MODES: readonly LicenseMode[] = ['sso', 'standalone'];

export class LicenseTokenError extends Error {
  constructor(
    message: string,
    /** 'unknown_kid' tells the caller a JWKS refetch is worth trying once. */
    readonly reason: 'malformed' | 'unknown_kid' | 'bad_signature' | 'bad_claims',
  ) {
    super(message);
    this.name = 'LicenseTokenError';
  }
}

const b64urlToBuffer = (value: string): Buffer => Buffer.from(value, 'base64url');

function parseJsonPart(part: string, what: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(b64urlToBuffer(part).toString('utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw new LicenseTokenError(`licence token ${what} is not a JSON object`, 'malformed');
}

/** Reads the header only (to learn the `kid`) without trusting anything in it. */
export function peekTokenKid(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = parseJsonPart(parts[0], 'header');
    return typeof header.kid === 'string' ? header.kid : null;
  } catch {
    return null;
  }
}

const isIntInRange = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

export interface VerifyOptions {
  system: string;
  /**
   * The issuer the token must carry. `null` means "do not check it": used with pinned
   * LICENSE_TRUST_PUBLIC_KEYS, where the signing key itself is the authority (section 9), so SSO's
   * discovery document is neither needed nor trusted.
   */
  expectedIssuer: string | null;
  keys: Jwk[];
}

export function verifyLicenseToken(token: string, options: VerifyOptions): LicenseClaims {
  if (typeof token !== 'string' || token.length === 0 || token.length > 16_384) {
    throw new LicenseTokenError('licence token is missing or too large', 'malformed');
  }
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) {
    throw new LicenseTokenError('licence token is not a compact JWS', 'malformed');
  }
  const [headerPart, payloadPart, signaturePart] = parts;
  const header = parseJsonPart(headerPart, 'header');

  if (header.alg !== 'RS256') throw new LicenseTokenError('licence token alg must be RS256', 'bad_claims');
  if (header.typ !== LICENSE_TOKEN_TYP) throw new LicenseTokenError(`licence token typ must be ${LICENSE_TOKEN_TYP}`, 'bad_claims');
  if (typeof header.kid !== 'string' || !header.kid) throw new LicenseTokenError('licence token has no kid', 'malformed');

  const jwk = options.keys.find((key) => key.kid === header.kid && key.kty === 'RSA');
  if (!jwk) throw new LicenseTokenError(`no RSA key with kid ${header.kid} in the JWKS`, 'unknown_kid');

  let signatureOk = false;
  try {
    const publicKey = crypto.createPublicKey({ key: jwk as unknown as import('crypto').JsonWebKeyInput['key'], format: 'jwk' });
    signatureOk = crypto.verify(
      'RSA-SHA256',
      Buffer.from(`${headerPart}.${payloadPart}`, 'utf8'),
      publicKey,
      b64urlToBuffer(signaturePart),
    );
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) throw new LicenseTokenError('licence token signature does not verify', 'bad_signature');

  const payload = parseJsonPart(payloadPart, 'payload');

  if (options.expectedIssuer !== null && payload.iss !== options.expectedIssuer) {
    throw new LicenseTokenError('licence token issuer mismatch', 'bad_claims');
  }
  const aud = payload.aud;
  const audOk = Array.isArray(aud) ? aud.includes(`license:${options.system}`) : aud === `license:${options.system}`;
  if (!audOk) throw new LicenseTokenError('licence token audience mismatch', 'bad_claims');
  if (payload.sys !== options.system) throw new LicenseTokenError('licence token system mismatch', 'bad_claims');

  if (typeof payload.ver !== 'number' || !Number.isInteger(payload.ver) || payload.ver < 0) {
    throw new LicenseTokenError('licence token ver is invalid', 'bad_claims');
  }

  let expiresAt: Date | null = null;
  if (payload.expiresAt !== null && payload.expiresAt !== undefined) {
    if (typeof payload.expiresAt !== 'string') throw new LicenseTokenError('licence token expiresAt is invalid', 'bad_claims');
    const parsed = new Date(payload.expiresAt);
    if (Number.isNaN(parsed.getTime())) throw new LicenseTokenError('licence token expiresAt is not a date', 'bad_claims');
    expiresAt = parsed;
  }

  if (!isIntInRange(payload.graceDays, 0, 365)) throw new LicenseTokenError('licence token graceDays is invalid', 'bad_claims');
  if (!isIntInRange(payload.warnDays, 0, 365)) throw new LicenseTokenError('licence token warnDays is invalid', 'bad_claims');

  let maxUsers: number | null = null;
  if (payload.maxUsers !== null && payload.maxUsers !== undefined) {
    if (!isIntInRange(payload.maxUsers, 1, Number.MAX_SAFE_INTEGER)) {
      throw new LicenseTokenError('licence token maxUsers is invalid', 'bad_claims');
    }
    maxUsers = payload.maxUsers;
  }

  let modules: string[] | null = null;
  if (payload.modules !== null && payload.modules !== undefined) {
    if (!Array.isArray(payload.modules) || payload.modules.some((m) => typeof m !== 'string')) {
      throw new LicenseTokenError('licence token modules is invalid', 'bad_claims');
    }
    modules = payload.modules as string[];
  }

  // `modes`: absent or empty means ['sso'] (section 9). Anything but the two known values is refused.
  let modes: LicenseMode[] = ['sso'];
  if (payload.modes !== null && payload.modes !== undefined) {
    if (!Array.isArray(payload.modes) || payload.modes.some((m) => !LICENSE_MODES.includes(m as LicenseMode))) {
      throw new LicenseTokenError('licence token modes is invalid', 'bad_claims');
    }
    if (payload.modes.length > 0) modes = [...new Set(payload.modes as LicenseMode[])];
  }

  if (payload.jti !== undefined && payload.jti !== null && typeof payload.jti !== 'string') {
    throw new LicenseTokenError('licence token jti is invalid', 'bad_claims');
  }

  return {
    iss: typeof payload.iss === 'string' ? payload.iss : '',
    aud: `license:${options.system}`,
    sys: payload.sys as string,
    ver: payload.ver,
    iat: typeof payload.iat === 'number' ? payload.iat : null,
    customer: typeof payload.customer === 'string' ? payload.customer : '',
    expiresAt,
    graceDays: payload.graceDays,
    warnDays: payload.warnDays,
    maxUsers,
    modules,
    modes,
    jti: typeof payload.jti === 'string' ? payload.jti : null,
  };
}

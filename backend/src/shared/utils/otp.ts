import crypto from 'node:crypto';
import { constantTimeEquals } from './constant-time';

/**
 * Six-digit one-time codes for 2FA login, registration verification, and
 * password reset.
 *
 * WHY THIS EXISTS AS A HELPER: the same expression —
 * `Math.floor(100000 + Math.random() * 900000).toString()` — was copy-pasted at
 * five call sites in auth.service.ts. Two problems with it:
 *
 *  1. `Math.random()` is NOT a cryptographic RNG. V8 implements it with
 *     xorshift128+, whose internal state is recoverable from a modest number of
 *     observed outputs — and an attacker can harvest outputs at will by
 *     requesting password-reset codes for accounts they control. Once the state
 *     is known, the next code issued to ANY account is predictable. These codes
 *     are single-factor credentials for account recovery, so they need
 *     `crypto`, not `Math`.
 *
 *  2. `100000 + random * 900000` can never produce a code below 100000, which
 *     silently discards 10% of the keyspace (000000–099999) and leaks that
 *     every code starts with 1–9.
 *
 * `crypto.randomInt` is CSPRNG-backed and rejection-samples internally, so the
 * distribution over the full 000000–999999 range is uniform with no modulo
 * bias. Zero-padding preserves the full range as a fixed-width 6-digit string.
 */
export function generateOtp(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * The key the stored OTP digests are derived under.
 *
 * Deliberately derived from JWT_SECRET rather than introduced as its own
 * required environment variable. A new mandatory secret is a deployment
 * footgun: miss it on the live server and every OTP verification starts
 * failing with no obvious cause, on the three routes (registration
 * verification, password reset, 2FA) that people use when they are ALREADY
 * locked out and cannot self-serve. JWT_SECRET is validated as present and
 * >= 32 characters in production by env.schema.ts, so deriving from it means
 * this cannot be half-configured. OTP_PEPPER overrides it for anyone who
 * wants the two rotated independently.
 *
 * HKDF with a distinct `info` label keeps this key cryptographically separate
 * from the token-signing use of the same secret: recovering one tells an
 * attacker nothing about the other.
 */
function otpPepper(): Buffer {
  if (cachedPepper) return cachedPepper;
  const base = process.env.OTP_PEPPER || process.env.JWT_SECRET || '';
  if (!base) {
    // Only reachable in a test or tooling context that never loaded config.
    // Failing closed here would break those; a fixed development-only key
    // keeps them working while production cannot reach this branch, because
    // env.schema.ts refuses to boot without JWT_SECRET.
    cachedPepper = Buffer.from('gms-development-otp-pepper-not-for-production', 'utf8');
    return cachedPepper;
  }
  cachedPepper = Buffer.from(
    crypto.hkdfSync('sha256', Buffer.from(base, 'utf8'), Buffer.alloc(0), Buffer.from('gms:otp:v1', 'utf8'), 32),
  );
  return cachedPepper;
}
let cachedPepper: Buffer | null = null;

/** A stored value in the post-2026-09-04 hashed form. */
const HASHED_OTP_PATTERN = /^[0-9a-f]{64}$/;

/**
 * What actually goes in `users.registration_otp` / `reset_password_otp` /
 * `two_factor_otp`.
 *
 * These columns held the six-digit code in plaintext. Anything that reads the
 * users table — a database dump, a backup file, a read-only reporting
 * connection, a SQL injection anywhere in the application, or an operator
 * running `SELECT * FROM users` — could read a live credential and use it. For
 * `registration_otp` that is not a step toward account takeover, it IS the
 * takeover: a correct code auto-issues a session (see
 * AuthService.verifyRegistration). For `reset_password_otp` it is a password
 * reset on any account in the building.
 *
 * The hash is KEYED, not a bare digest, and that is the whole design. The
 * keyspace is 10^6 — a plain SHA-256 column would be exhaustively reversed by
 * anyone holding the dump in well under a second, leaving it no better than
 * plaintext. HMAC under a server-held pepper means the dump alone is useless;
 * the attacker needs the application secret as well, which is a different
 * compromise in a different place.
 *
 * `userId` is bound into the input so a digest lifted from one row cannot be
 * replayed against another — relevant if someone can write the column but not
 * read the pepper.
 */
export function hashOtp(otp: string, userId: number | string): string {
  return crypto
    .createHmac('sha256', otpPepper())
    .update(`${userId}:${otp}`, 'utf8')
    .digest('hex');
}

/**
 * Constant-time comparison for a submitted OTP against the stored value.
 *
 * The call sites previously used `stored !== submitted`, which has two defects
 * beyond the timing side-channel:
 *
 *  - It is not length-safe for `timingSafeEqual`, hence the explicit length
 *    check here before comparing.
 *  - Critically, `!==` is TRUE-for-mismatch only when both sides are strings.
 *    When the stored column was NULL (no code outstanding) and the client sent
 *    `{"otp": null}` — which the reset and 2FA routes accepted, having no
 *    validation schema at all — `null !== null` evaluated FALSE and the check
 *    PASSED. The request was then stopped only incidentally, by
 *    `new Date(null).getTime()` happening to be 0 and tripping the expiry
 *    branch. `new Date(undefined).getTime()` is NaN, and `Date.now() - NaN >
 *    ttl` is false, so that accidental backstop does not hold for every shape
 *    of missing value.
 *
 * Requiring both sides to be non-empty strings of equal length closes that off
 * at the primitive rather than relying on each call site to remember.
 *
 * DUAL MODE, and this is what makes the switch to hashed storage deployable
 * without a migration or a maintenance window. A stored value that looks like
 * a 64-character hex digest is compared as a hash; anything else is compared
 * as legacy plaintext. So on the deploy:
 *
 *  - codes already issued and sitting in gmsprod keep verifying normally until
 *    they expire on their own (10-30 minutes), rather than every person
 *    mid-registration or mid-password-reset at the moment of the restart
 *    finding their code silently rejected;
 *  - every code issued after the restart is written hashed;
 *  - no UPDATE runs against the live users table at all.
 *
 * The legacy branch is dead once the longest OTP TTL has elapsed after
 * deployment. It is safe to delete on any later release; it is left in because
 * removing it buys nothing and re-adding it under pressure would be painful.
 */
export function otpMatches(stored: unknown, submitted: unknown, userId?: number | string): boolean {
  if (typeof stored !== 'string' || typeof submitted !== 'string') return false;
  if (stored.length === 0 || submitted.length === 0) return false;

  if (HASHED_OTP_PATTERN.test(stored)) {
    if (userId === undefined || userId === null) return false;
    return constantTimeEquals(hashOtp(submitted, userId), stored);
  }

  // Legacy plaintext row issued before 2026-09-04. See above.
  if (stored.length !== submitted.length) return false;
  return crypto.timingSafeEqual(Buffer.from(stored, 'utf8'), Buffer.from(submitted, 'utf8'));
}

/** Shape a submitted OTP must have before it is worth comparing at all. */
export const OTP_PATTERN = /^\d{6}$/;

/**
 * True when an OTP challenge is genuinely outstanding and unexpired.
 *
 * Centralises the expiry check so a null/undefined/unparseable timestamp is
 * treated as "no valid challenge" rather than falling through. The previous
 * inline form, `Date.now() - new Date(ts).getTime() > TTL`, silently evaluates
 * to `false` (i.e. "not expired, proceed") when `ts` is undefined, because any
 * comparison against NaN is false.
 */
export function otpChallengeIsLive(issuedAt: unknown, ttlMs: number): boolean {
  if (!issuedAt) return false;
  const ms = new Date(issuedAt as string | number | Date).getTime();
  if (!Number.isFinite(ms)) return false;
  return Date.now() - ms <= ttlMs;
}

/* ------------------------------------------------------------------------ *
 * Sealing a code for the outbox / queue hand-off
 * ------------------------------------------------------------------------ *
 *
 * The users table holds only a keyed digest (hashOtp above), but the e-mail
 * that carries the code is sent by a worker that runs later, and the only way
 * to hand it the code was to put the plaintext in the job payload — which the
 * outbox persists in `outbox_events.payload` (and BullMQ keeps in Redis). A
 * PROCESSED row stayed in that table forever with a live-looking credential in
 * it; a six-digit code with a 10-30 minute life is a password-reset or
 * registration takeover for as long as it is valid.
 *
 * Two layers, both needed:
 *
 *  1. SEAL at enqueue time: the payload carries `otp_sealed` (AES-256-GCM under
 *     a key HKDF-derived from the same secret as the digest, with its own
 *     `info` label, bound to the account id) instead of `otp`. A database dump,
 *     a read-only reporting connection or an operator running
 *     `SELECT payload FROM outbox_events` sees ciphertext. The worker opens it
 *     with `openSealedOtp`, so a retry can still send the code until the job
 *     is dispatched.
 *  2. REDACT at dispatch time: outbox.repository.ts deletes `otp` and
 *     `otp_sealed` from the stored payload once the row is PROCESSED or
 *     DEAD_LETTER, so nothing is retained afterwards even in sealed form.
 *
 * `resolveJobOtp` also accepts a legacy plaintext `otp`, because rows queued by
 * the previous build may still be waiting when this one starts.
 */

/** Payload keys that carry a one-time code. Redaction removes exactly these. */
export const OTP_PAYLOAD_KEYS = ['otp', 'otp_sealed'] as const;

let cachedSealKey: Buffer | null = null;
function otpSealKey(): Buffer {
  if (cachedSealKey) return cachedSealKey;
  const base = process.env.OTP_PEPPER || process.env.JWT_SECRET || 'gms-development-otp-pepper-not-for-production';
  cachedSealKey = Buffer.from(
    crypto.hkdfSync('sha256', Buffer.from(base, 'utf8'), Buffer.alloc(0), Buffer.from('gms:otp-queue-seal:v1', 'utf8'), 32),
  );
  return cachedSealKey;
}

const sealAad = (userId: number | string) => Buffer.from(`gms:otp-queue:${userId}`, 'utf8');

/** Encrypt a code for a queue payload. Output: `v1.<base64url(iv|tag|ciphertext)>`. */
export function sealOtp(otp: string, userId: number | string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', otpSealKey(), iv);
  cipher.setAAD(sealAad(userId));
  const ct = Buffer.concat([cipher.update(otp, 'utf8'), cipher.final()]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64url')}`;
}

/** Decrypt a sealed code; null when the value is malformed, tampered with, for another user, or the key changed. */
export function openSealedOtp(sealed: unknown, userId: number | string): string | null {
  if (typeof sealed !== 'string' || !sealed.startsWith('v1.')) return null;
  try {
    const raw = Buffer.from(sealed.slice(3), 'base64url');
    if (raw.length < 12 + 16 + 1) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', otpSealKey(), raw.subarray(0, 12));
    decipher.setAAD(sealAad(userId));
    decipher.setAuthTag(raw.subarray(12, 28));
    const otp = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
    return OTP_PATTERN.test(otp) ? otp : null;
  } catch {
    return null;
  }
}

/**
 * A copy of a job payload with the one-time code removed and an `otp_redacted`
 * marker added (the same shape the outbox's SQL redaction leaves). Returns the
 * input untouched when it carries no code. Used wherever a payload is copied
 * somewhere that outlives the job (the dead-letter queue, a scrubbed BullMQ job).
 */
export function redactOtpFields<T>(data: T): T {
  if (!data || typeof data !== 'object') return data;
  const record = data as Record<string, unknown>;
  if (!OTP_PAYLOAD_KEYS.some((key) => key in record)) return data;
  const copy: Record<string, unknown> = { ...record };
  for (const key of OTP_PAYLOAD_KEYS) delete copy[key];
  copy.otp_redacted = true;
  return copy as T;
}

/** The payload every OTP e-mail job is queued with: the code is sealed, never plaintext. */
export function otpEmailJobPayload<T extends string>(
  userId: number | string,
  otp: string,
  template: T,
): { guestId: number | string; otp_sealed: string; template: T } {
  return { guestId: userId, otp_sealed: sealOtp(otp, userId), template };
}

/**
 * The code a worker should send for a job payload, or null when there is none
 * (already redacted, tampered, or sealed under a key that has since changed).
 */
export function resolveJobOtp(data: { guestId?: number | string; otp?: unknown; otp_sealed?: unknown }): string | null {
  if (data.otp_sealed !== undefined && data.guestId !== undefined) {
    return openSealedOtp(data.otp_sealed, data.guestId);
  }
  // Legacy plaintext payload queued by the build before sealing.
  return typeof data.otp === 'string' && OTP_PATTERN.test(data.otp) ? data.otp : null;
}

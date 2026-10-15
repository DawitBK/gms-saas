import crypto from 'node:crypto';

/**
 * Compare two secrets without leaking anything through timing — including
 * their LENGTH.
 *
 * `crypto.timingSafeEqual` throws when the two buffers differ in length, so
 * every call site in this codebase guarded it with an explicit length check:
 *
 *     if (a.length !== b.length || !timingSafeEqual(a, b)) { ... }
 *
 * That guard short-circuits. When it fires, the function returns before any
 * byte comparison happens, and the response comes back measurably sooner than
 * one that reached `timingSafeEqual`. An attacker who can submit candidate
 * values therefore learns the length of the expected value for free.
 *
 * A previous pass dismissed this as theoretical on the grounds that the
 * compared values are fixed-width HMAC digests, whose length the attacker
 * already knows. That reasoning is correct for the HMAC sites and WRONG for
 * `unifi-webhook.service.ts`'s legacy-secret branch, which compares the
 * configured `UNIFI_ACCESS_WEBHOOK_SECRET` — an operator-chosen string of
 * unknown length — against a fully attacker-controlled header. There, the
 * short-circuit is an oracle for the secret's exact length, recoverable in a
 * few hundred unauthenticated requests, which turns an open-ended brute force
 * into a bounded one. The distinction was too easy to lose track of per call
 * site, so the primitive removes it instead.
 *
 * Hashing both operands first makes them unconditionally 32 bytes, so the
 * length check can never fail and never short-circuits. SHA-256 is used purely
 * as a length equaliser here, not as a password hash: it is applied to values
 * that are already high-entropy secrets, and both operands go through it, so a
 * collision would have to be found against an unknown target.
 *
 * `internal-sso.routes.ts` arrived at the same construction independently for
 * the internal API key (and DMS's `shared/internalAuth.ts` before it); this is
 * that helper promoted to one shared definition rather than a fourth copy.
 */
export function constantTimeEquals(
  provided: string | Buffer | null | undefined,
  expected: string | Buffer | null | undefined,
): boolean {
  // A missing operand is never a match. Both sides are still hashed below in
  // the normal path, so this branch costs nothing an attacker can use: it is
  // reachable only when the caller failed to supply a value at all, which the
  // caller already knows.
  if (provided === null || provided === undefined) return false;
  if (expected === null || expected === undefined) return false;

  const a = crypto
    .createHash('sha256')
    .update(Buffer.isBuffer(provided) ? provided : Buffer.from(provided, 'utf8'))
    .digest();
  const b = crypto
    .createHash('sha256')
    .update(Buffer.isBuffer(expected) ? expected : Buffer.from(expected, 'utf8'))
    .digest();

  return crypto.timingSafeEqual(a, b);
}

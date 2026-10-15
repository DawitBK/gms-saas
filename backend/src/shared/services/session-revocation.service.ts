import { QueryTypes } from 'sequelize';
import { redisClient, isRedisAvailable } from '../../infrastructure/cache/redis.client';
import { logger } from '../../core/logger/logger';
import { appConfig } from '../../config/app.config';
import { sequelize } from '../../infrastructure/database/sequelize';
import { withRetry } from './retry.service';

/**
 * Cutoff TTL for the Redis copy: must outlive the longest-lived refresh token, or
 * a revoked user's already-issued tokens outlast the record that revokes them.
 *
 * Derived from the configured refresh lifetime now, plus a day of margin, rather
 * than the previous hardcoded 60 days. The old comment was honest that it did not
 * parse `appConfig.jwt.refreshExpiresIn` and was "a fixed conservative upper
 * bound" — but conservative only in one direction: a JWT_REFRESH_EXPIRES_IN of
 * more than 60 days silently outlived its own revocation, which is the exact
 * failure the constant exists to prevent. Parsing it removes the assumption.
 *
 * The durable Postgres row (user_revocation_cutoffs) has no TTL at all, so even
 * if this bound were wrong the revocation itself is not lost.
 */
function parseDurationSeconds(value: string, fallbackSeconds: number): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)?$/.exec(String(value).trim());
  if (!match) return fallbackSeconds;
  const amount = Number(match[1]);
  switch (match[2]) {
    case 'ms': return Math.ceil(amount / 1000);
    case 's': case undefined: return amount;
    case 'm': return amount * 60;
    case 'h': return amount * 3600;
    case 'd': return amount * 86400;
    default: return fallbackSeconds;
  }
}

const SIXTY_DAYS_SECONDS = 60 * 24 * 60 * 60;
const CUTOFF_TTL_SECONDS =
  parseDurationSeconds(String(appConfig.jwt.refreshExpiresIn ?? ''), SIXTY_DAYS_SECONDS) + 86_400;

/**
 * FIX: there was no way to kill a user's session at all. Access-token
 * verification (auth.middleware.ts) checks only the JWT signature and
 * expiry — no database or cache lookup. Suspending a user, changing their
 * roles, or offboarding them had zero effect on any token already issued to
 * them; it kept working, at its old roles/permissions, for the full token
 * lifetime. This gives real revocation: a Redis cutoff timestamp per user,
 * checked on every authenticated request — any token issued (iat) at or
 * before the cutoff is rejected regardless of its own expiry.
 *
 * PLATFORM-GAP-021 fix: this used to fail open unconditionally whenever
 * Redis was unreachable — a deactivated/offboarded user's already-issued
 * tokens would silently stay valid for their full remaining lifetime during
 * any Redis outage. DMS's equivalent check (shared/auth.ts, revocationEnforced())
 * fails closed in production, only failing open in dev — same asymmetry
 * applied here: GMS has no separate "staging" NODE_ENV value, so
 * appConfig.isProduction is the direct equivalent.
 */
export class RevocationCheckUnavailableError extends Error {
  constructor() {
    super('Session revocation check is unavailable — Redis is unreachable');
    this.name = 'RevocationCheckUnavailableError';
  }
}

function revocationEnforced(): boolean {
  return appConfig.isProduction;
}

function cutoffKey(userId: number): string {
  return `gms:auth:revoked_user:${userId}`;
}

/**
 * Revoke every token already issued to a user (P1-13).
 *
 * Durable row first, Redis second. That order is the whole point: the previous
 * implementation wrote only to Redis and, when Redis was down, logged a warning
 * and RETURNED AS IF IT HAD SUCCEEDED. The read path fails closed in production,
 * so during an outage the user did appear locked out — but the revocation itself
 * was never recorded anywhere, nothing retried it, and the moment Redis came back
 * the offboarded user's tokens were valid again. Callers
 * (users/user.service.ts, operations/operations.service.ts) had no way to know
 * their revocation had evaporated.
 *
 * Now: if the durable write fails, this THROWS — matching DMS's
 * revokeAllUserSessions, which already gets this right. A caller offboarding a
 * user must find out that it did not happen. A Redis mirror failure after a
 * successful durable write is only logged, because isSessionRevoked falls back to
 * the table and the revocation is therefore already in force.
 *
 * The cutoff only ever moves forward (GREATEST): a concurrent or replayed
 * revocation must never widen the window of still-acceptable tokens.
 */
export async function revokeUserSessions(userId: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  await sequelize.query(
    `INSERT INTO user_revocation_cutoffs (user_id, cutoff_at, created_at, updated_at)
     VALUES (:userId, :now, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id) DO UPDATE
       SET cutoff_at = GREATEST(user_revocation_cutoffs.cutoff_at, EXCLUDED.cutoff_at),
           updated_at = CURRENT_TIMESTAMP`,
    { replacements: { userId, now }, type: QueryTypes.INSERT },
  );

  /**
   * The cutoff alone does not end a session. It is consulted in exactly one
   * place — `auth.middleware.ts`, on the ACCESS-token path. `refreshSession`,
   * `logout` and `verifySession` never look at it; they check the
   * `auth_sessions` table, which nothing here used to touch.
   *
   * So the account-recovery story did not work. A victim whose refresh cookie
   * had been stolen resets their password; `resetPassword` writes a cutoff and
   * reports success. The attacker calls `POST /auth/refresh`: the
   * `auth_sessions` row is still active, `user.status` is still ACTIVE
   * (a password reset does not change it), and a brand-new access token is
   * minted whose `iat` is AFTER the cutoff — so it also sails through the one
   * check that does exist, on every subsequent request. Each refresh extends
   * the session another seven days. The attacker outlives the recovery
   * indefinitely, and the victim has been told they are safe.
   *
   * Revoking the rows is what actually closes it, and it belongs here rather
   * than at each call site: every caller that revokes — password reset,
   * password change, deactivation, role change, offboarding, SSO-driven
   * disable — needs both halves, and one that only remembered the cutoff was
   * the bug. Raw SQL rather than the AuthSession model to keep this shared
   * service free of a dependency on the auth module (which already depends on
   * this file).
   *
   * Deliberately after the cutoff write and before the Redis mirror: if this
   * throws, the caller is told the revocation failed, which is correct — a
   * half-done revocation must not be reported as success.
   */
  await sequelize.query(
    `UPDATE auth_sessions
        SET revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = :userId AND revoked_at IS NULL`,
    { replacements: { userId }, type: QueryTypes.UPDATE },
  );

  if (!redisClient || !isRedisAvailable()) {
    logger.warn(
      { userId },
      'Redis unavailable — revocation cutoff persisted to user_revocation_cutoffs only; isSessionRevoked will read it from there',
    );
    return;
  }

  try {
    /**
     * Bounded, for the reason isSessionRevoked's own lookup is bounded: redisClient
     * is shared with BullMQ, which requires `maxRetriesPerRequest: null` (infinite
     * patience) on the client itself. A bare `await redisClient.set(...)` against a
     * stalled or unreachable server therefore never settles and never throws — it
     * just hangs, taking the caller (an admin deactivating a user) with it, with
     * the client's status still reporting 'ready'.
     *
     * This is the mirror, not the record: the durable row above has already
     * committed, so giving up after 1.5s costs a slower auth path until Redis
     * recovers, and nothing else.
     */
    await withRetry(() => redisClient!.set(cutoffKey(userId), String(now), 'EX', CUTOFF_TTL_SECONDS), {
      action: 'session-revocation cutoff write',
      module: 'session-revocation',
      maxAttempts: 1,
      timeoutMs: 1500,
    });
  } catch (err) {
    // Not fatal: the durable row above is already authoritative and the read path
    // falls back to it. Logged at error because auth is now taking a DB round-trip
    // per request until Redis recovers.
    logger.error({ userId, err }, 'revocation cutoff persisted but the Redis mirror failed — auth will fall back to Postgres');
  }
}

/**
 * Durable fallback read. Only reached when Redis is unavailable or errored, so
 * the normal request path still costs exactly one Redis GET.
 */
async function durableCutoff(userId: number): Promise<number | null> {
  const rows = await sequelize.query<{ cutoff_at: string }>(
    'SELECT cutoff_at FROM user_revocation_cutoffs WHERE user_id = :userId',
    { replacements: { userId }, type: QueryTypes.SELECT },
  );
  const raw = rows[0]?.cutoff_at;
  return raw === undefined ? null : Number(raw);
}

export async function isSessionRevoked(userId: number, issuedAt: number): Promise<boolean> {
  if (!redisClient || !isRedisAvailable()) {
    /**
     * P1-13: read the durable table instead of 503-ing every authenticated
     * request. Before this, a Redis outage in production made GMS entirely
     * unusable — correct in the "don't fail open" sense, but a total outage as
     * the cost of a cache being down. The cutoffs live in Postgres now, so the
     * check can still be answered accurately; only the speed changes.
     *
     * If Postgres is ALSO unreachable there is genuinely no way to answer, and
     * that is when failing closed in production is the right call.
     */
    try {
      const cutoff = await durableCutoff(userId);
      logger.warn({ userId }, 'Redis unavailable — session revocation resolved from user_revocation_cutoffs');
      if (cutoff === null) return false;
      return issuedAt <= cutoff;
    } catch (dbErr) {
      if (revocationEnforced()) {
        logger.error({ userId, dbErr }, 'Redis AND Postgres unavailable; rejecting authenticated request because revocation cannot be checked');
        throw new RevocationCheckUnavailableError();
      }
      logger.warn({ userId, dbErr }, 'Redis and Postgres unavailable — session revocation check skipped (fail-open, non-production only)');
      return false;
    }
  }

  try {
    // redisClient is shared with BullMQ, which needs maxRetriesPerRequest:
    // null (infinite patience) on the client itself — so a network stall
    // here would otherwise hang this GET forever with status still 'ready',
    // never reaching this catch block at all. Bound just this call instead
    // of touching the shared client's config.
    const cutoff = await withRetry(() => redisClient!.get(cutoffKey(userId)), {
      action: 'session-revocation cutoff lookup',
      module: 'session-revocation',
      maxAttempts: 1,
      timeoutMs: 1500,
    });
    if (!cutoff) return false;
    return issuedAt <= Number(cutoff);
  } catch (err) {
    // Same durable fallback as the "Redis not connected" branch above: a failed
    // or timed-out GET is not a reason to reject a request whose answer is
    // sitting in Postgres.
    try {
      const cutoff = await durableCutoff(userId);
      logger.warn({ userId, err }, 'Redis revocation lookup failed — resolved from user_revocation_cutoffs');
      if (cutoff === null) return false;
      return issuedAt <= cutoff;
    } catch (dbErr) {
      if (revocationEnforced()) {
        logger.error({ userId, err, dbErr }, 'Redis and Postgres revocation lookups both failed; rejecting authenticated request');
        throw new RevocationCheckUnavailableError();
      }
      logger.warn({ userId, err, dbErr }, 'Redis and Postgres revocation lookups both failed — skipping check (fail-open, non-production only)');
      return false;
    }
  }
}

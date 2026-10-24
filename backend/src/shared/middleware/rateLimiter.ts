import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request } from 'express';
import { RedisStore } from 'rate-limit-redis';
import { appConfig } from '../../config/app.config';
import { redisRateLimitClient } from '../../infrastructure/cache/redis.client';
import { logger } from '../../core/logger/logger';

const createStore = (prefix: string) => {
  // Deliberately NOT the main `redisClient` (see redisRateLimitClient's own
  // comment in redis.client.ts): that one is maxRetriesPerRequest: null for
  // BullMQ, which means a command on it never rejects while Redis is down —
  // it queues forever. That turned globalLimiter (mounted on every request)
  // into an indefinite hang during a Redis outage instead of the fast
  // in-memory fallback below. redisRateLimitClient fails fast instead.
  const client = redisRateLimitClient;
  if (!client) return undefined;
  try {
    return new RedisStore({
      // Pass the ioredis `call` method directly — this client rejects
      // quickly (bounded retries, no offline queue) when Redis is
      // unreachable, so the per-limiter `passOnStoreError: true` is the
      // correct safety net for Redis downtime. DO NOT add an
      // isRedisAvailable() guard here: RedisStore calls sendCommand once at
      // construction time (loadIncrementScript) and Node treats an
      // unhandled rejected promise thrown inside a constructor as a fatal
      // crash, which is exactly what was happening before this comment —
      // main.ts's process-level unhandledRejection handler is what actually
      // keeps that safe now, not a pre-check here.
      sendCommand: (...args: string[]) => (client as any).call(...args),
      prefix: `rl:${prefix}:`,
    });
  } catch (err) {
    logger.warn(
      { err, module: 'rateLimiter' },
      'RedisStore construction failed — falling back to per-process in-memory rate limit store.',
    );
    return undefined;
  }
};


/**
 * Whether to bypass rate limiting entirely for a request.
 *
 * `skip` in express-rate-limit does not raise the ceiling -- it removes the
 * limiter from the request completely. So these two env vars were an off switch
 * for EVERY limiter below (global, auth, critical-action, per-user), with no
 * environment guard: a machine-wide `DISABLE_RATE_LIMIT=true` -- exactly the
 * ambient-env-var failure mode known from DATABASE_URL --
 * would silently disable all brute-force protection in production.
 *
 * Neither var is set in any committed env file today (SIMULATION_LIVE_MODE
 * appears only in .env.development, its intended use), so this was a latent
 * footgun rather than a live hole. Gating on !isProduction keeps dev turbo mode
 * working and makes the production case unreachable by accident.
 *
 * To widen limits in production, raise RATE_LIMIT_*_MAX -- that is the
 * supported knob, and .env.production already tunes it (AUTH_MAX=10/min).
 */
const skipIfSimulation = () => {
  if (process.env.NODE_ENV === 'test') return true;
  if (appConfig.isProduction) return false;
  return (
    process.env.SIMULATION_LIVE_MODE === 'true' ||
    process.env.DISABLE_RATE_LIMIT === 'true'
  );
};

// Boot-time visibility: if a bypass var is set in production, say so once
// rather than leaving the (now ignored) intent invisible.
if (
  appConfig.isProduction &&
  (process.env.SIMULATION_LIVE_MODE === 'true' || process.env.DISABLE_RATE_LIMIT === 'true')
) {
  logger.error(
    { module: 'rateLimiter' },
    'SIMULATION_LIVE_MODE / DISABLE_RATE_LIMIT are set but IGNORED in production - rate limiting stays enabled. Use RATE_LIMIT_*_MAX to tune limits instead.',
  );
}

// Redis absent means every limiter silently degrades to a per-process in-memory
// counter, which is not a shared limit at all. Worth one line at boot.
if (!redisRateLimitClient) {
  logger.warn(
    { module: 'rateLimiter' },
    'Redis unavailable - rate limiters are using per-process in-memory stores; limits are not shared across processes.',
  );
}

export const userAwareKeyGenerator = (req: Request) =>
  String(req.user?.id ?? ipKeyGenerator(req.ip ?? ''));

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: appConfig.rateLimit.globalMax,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  skip: skipIfSimulation,
  store: createStore('global'),
  handler: (req, res) => {
    logger.warn({
      msg: 'Global IP rate limit exceeded',
      ip: req.ip,
      path: req.originalUrl,
      userAgent: req.headers['user-agent'],
    });
    res.status(429).json({
      success: false,
      error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests globally.' },
    });
  },
});

export const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: appConfig.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  skip: skipIfSimulation,
  store: createStore('auth'),
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many login attempts. Cool down.' } }
});

export const criticalActionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: appConfig.rateLimit.criticalMax,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  skip: skipIfSimulation,
  store: createStore('critical'),
  keyGenerator: userAwareKeyGenerator,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many sensitive operations. Try again shortly.' } }
});

export const authenticatedUserLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: appConfig.rateLimit.userMax,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  skip: skipIfSimulation,
  store: createStore('user'),
  keyGenerator: userAwareKeyGenerator,
  handler: (req, res) => {
    logger.warn({
      msg: 'Per-user rate limit exceeded',
      userId: req.user?.id,
      ip: req.ip,
      path: req.originalUrl,
      userAgent: req.headers['user-agent'],
    });
    res.status(429).json({
      success: false,
      error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Slow down.' },
    });
  },
});

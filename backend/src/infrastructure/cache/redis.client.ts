import Redis from 'ioredis';
import { env } from '../../config';
import { logger } from '../../core/logger/logger';

/**
 * Enterprise Redis Client
 * Centralized connection pool for caching, PubSub (EventBus), and BullMQ.
 */
const shouldEnableRedis = Boolean(env.REDIS_URL);

export const redisClient = shouldEnableRedis ? new Redis(env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError(err) {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      return true;
    }
    return false;
  }
}) : null;

if (redisClient) {
  redisClient.on('connect', () => {
    logger.info({ module: 'redis' }, 'Connecting to Redis...');
  });

  redisClient.on('ready', () => {
    logger.info({ module: 'redis' }, 'Connected to Redis and ready for operations');
  });

  redisClient.on('error', (err) => {
    logger.error({ err, module: 'redis' }, 'Redis connection error');
  });

  redisClient.on('reconnecting', () => {
    logger.warn({ module: 'redis' }, 'Reconnecting to Redis...');
  });
}

// Utility for runtime checks
export const isRedisAvailable = () => {
  if (!redisClient) return false;
  return redisClient.status === 'ready' || redisClient.status === 'connect';
};

/**
 * A SEPARATE connection, deliberately not sharing `redisClient` above.
 *
 * `redisClient` is `maxRetriesPerRequest: null` because BullMQ's blocking
 * commands genuinely require that (a bounded value breaks BullMQ outright) —
 * but that setting also means a command on that client NEVER rejects while
 * Redis is unreachable, it queues forever. rateLimiter.ts's `globalLimiter`
 * runs on every request (`app.use(globalLimiter)`); when it shared
 * `redisClient`, a Redis outage turned every request into an indefinite hang
 * instead of the fast in-memory fallback its own `passOnStoreError: true`
 * was written to provide — measured 2026-09-21 as an 8s+ hang on GMS's
 * internal SSO bridge endpoint while Docker's Redis container was down,
 * which the CALLER's timeout eventually surfaced as a confusing "GMS
 * internal API did not respond" error with no indication Redis was the
 * cause.
 *
 * `enableOfflineQueue: false` looked like the fix but isn't: rate-limit-
 * redis's RedisStore fires its first command (loadIncrementScript) from
 * inside its OWN constructor, synchronously, the instant rateLimiter.ts is
 * imported — before this client's very first connection has necessarily
 * finished handshaking. With offline queueing off, that command has nowhere
 * to wait and rejects immediately; that rejection surfaces as an unhandled
 * promise rejection during MODULE IMPORT, before main.ts's process-level
 * handler is even registered, and crashes the whole process at boot
 * (reproduced 2026-09-21: "Stream isn't writeable and enableOfflineQueue
 * options is false", process exit 1, before the server ever bound a port).
 * That is exactly the crash the surviving comment in rateLimiter.ts already
 * warned about, from the other direction.
 *
 * The setting that actually wants both properties is a BOUNDED
 * maxRetriesPerRequest with offline queueing left on (ioredis's default):
 * a command still queues and waits out a normal, brief reconnect (so the
 * very first command at boot isn't racing the initial handshake), but once
 * Redis has been unreachable for more than a few retries, ioredis rejects
 * the queued command instead of holding it forever. That's what lets
 * `passOnStoreError: true` do what it already claims to.
 */
export const redisRateLimitClient = shouldEnableRedis
  ? new Redis(env.REDIS_URL!, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        return Math.min(times * 50, 300);
      },
    })
  : null;

if (redisRateLimitClient) {
  redisRateLimitClient.on('error', (err) => {
    logger.error({ err, module: 'redis-ratelimit' }, 'Rate-limit Redis connection error');
  });
}

if (process.env.NODE_ENV === 'test') {
  const target = globalThis as typeof globalThis & { __gmsTestCleanup?: { disconnectRedis?: () => void } };
  target.__gmsTestCleanup = {
    ...target.__gmsTestCleanup,
    // Both connections — src/tests/setup.ts's afterAll is what actually runs
    // on every test suite (it quits each client directly), but this hook is
    // kept in step with it so a caller reaching for it later gets both, not
    // just the one that existed before redisRateLimitClient was added.
    disconnectRedis: () => {
      redisClient?.disconnect();
      redisRateLimitClient?.disconnect();
    },
  };
}

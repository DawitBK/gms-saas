import { afterAll, beforeEach, jest } from '@jest/globals';
import { closeWorkers } from '../infrastructure/queue/workers/registry';
import { closeQueues } from '../infrastructure/queue/queue';
import { redisClient, redisRateLimitClient } from '../infrastructure/cache/redis.client';
import { closeDB } from '../infrastructure/database/sequelize';

const blockedFetch = jest.fn(async (input: RequestInfo | URL) => {
  throw new Error(`Unexpected network call during test: ${String(input)}`);
}) as typeof fetch;

beforeEach(() => {
  global.fetch = blockedFetch;
  (blockedFetch as unknown as jest.Mock).mockClear();
});

afterAll(async () => {
  // Initialize and close the lifecycle owners in the same Jest environment.
  // Closing queues before gracefully quitting the shared Redis client prevents
  // BullMQ from attempting a reconnect during shutdown.
  await closeWorkers();
  await closeQueues();
  if (redisClient && redisClient.status !== 'end') await redisClient.quit();
  // redisRateLimitClient (infrastructure/cache/redis.client.ts) is a SEPARATE
  // connection from redisClient above — added 2026-09-21 so rateLimiter.ts's
  // globalLimiter fails fast instead of hanging during a Redis outage (see
  // that file's own header comment). Any test that imports rateLimiter.ts
  // (directly or transitively) opens this connection at module load; missing
  // it here left it open after the suite finished, and Jest's forced
  // teardown surfaced that as "Unhandled error: Connection is closed" —
  // reported as 3 whole suites "failed to run" despite every actual
  // assertion in them passing (caught live 2026-09-21 re-running this suite
  // after the client split landed).
  if (redisRateLimitClient && redisRateLimitClient.status !== 'end') await redisRateLimitClient.quit();
  await closeDB();
});

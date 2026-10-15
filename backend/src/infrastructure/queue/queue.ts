import { Queue } from 'bullmq';
import { redisClient } from '../cache/redis.client';
import { logger } from '../../core/logger/logger';

export const QUEUE_NAMES = {
  EMAIL_NOTIFICATION: 'EMAILS',
  SMS_NOTIFICATION: 'SMS',
  VISIT_REMINDER: 'REMINDERS',
  EXPIRATIONS: 'EXPIRATIONS',
  ACCESS_PROVISIONING: 'ACCESS_PROVISIONING',
  DEAD_LETTER: 'DEAD_LETTER',
  SLA_ENFORCEMENT: 'SLA_ENFORCEMENT',
  SLA_ESCALATION: 'SLA_ESCALATION',
  RECEPTION_SLA_ENFORCEMENT: 'RECEPTION_SLA_ENFORCEMENT',
  NO_SHOW: 'NO_SHOW',
  IDENTITY_VERIFICATION: 'IDENTITY_VERIFICATION',
} as const;

export const queues: Record<string, Queue> = {};
// BullMQ owns a dedicated Redis connection for each queue. Reusing the
// application client made graceful shutdown race active queue commands and
// left Jest with intermittent "Connection is closed" unhandled errors.
const queueConnections: ReturnType<NonNullable<typeof redisClient>['duplicate']>[] = [];

const bullMqPrefix = process.env.NODE_ENV === 'test' ? 'gms_test' : undefined;

if (redisClient) {
  try {
    Object.values(QUEUE_NAMES).forEach(qName => {
      const connection = redisClient!.duplicate();
      queueConnections.push(connection);
      queues[qName] = new Queue(qName, {
        connection,
        ...(bullMqPrefix ? { prefix: bullMqPrefix } : {}),
        defaultJobOptions: {
          // FIX: outbox-driven jobs are enqueued with a jobId derived from the
          // outbox row's own (already-unique) id (see dispatchQueueJob in
          // dispatchers.ts) so a stale-reclaimed outbox row can't re-enqueue
          // the same side effect twice - BullMQ's Queue.add treats a jobId
          // that still exists as a no-op. That dedup only works while the
          // job's record still exists in Redis, so completed jobs must not be
          // removed immediately: keep them around comfortably longer than
          // STALE_PROCESSING_MS (5 minutes, see outbox.repository.ts) before
          // BullMQ prunes them, otherwise a reclaim that lands after the
          // original job already completed-and-was-removed would sail
          // straight past the dedup check and re-run the side effect anyway.
          removeOnComplete: { age: 60 * 60, count: 5000 },
          removeOnFail: false,
        }
      });
    });
    logger.info({ count: Object.keys(queues).length }, '📬 BullMQ queues initialized.');
  } catch (err) {
    logger.error({ err }, 'Failed to initialize BullMQ queues');
  }
}

export const enqueueJob = async (queueName: string, jobName: string, payload: any, options: any = {}) => {
  if (queues[queueName]) {
    try {
      await queues[queueName].add(jobName, payload, {
        // Aligned with DMS's outbox retry policy (infrastructure/queue/outbox.ts):
        // 3 total attempts, exponential backoff starting at 30s. The exact curve
        // differs (BullMQ's native exponential type doubles each attempt - 30s/
        // 60s/120s - vs DMS's hand-rolled poller, which quadruples - 30s/120s/
        // 480s, capped at 1h) since one is a Redis-backed job queue and the other
        // a DB-polling loop, but both now start from the same delay and attempt
        // count rather than GMS's previous 2s start, which retried far faster
        // than DMS for the same class of transient failure.
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        ...options
      });
      return true;
    } catch (err) {
       logger.error({ err, queueName, jobName }, 'Queue job submission failed');
       return false;
    }
  }
  return false;
};

export const enqueueDeadLetter = async (queueName: string, jobName: string, payload: any) => {
  await enqueueJob(QUEUE_NAMES.DEAD_LETTER, `${queueName}:${jobName}`, payload, {
    attempts: 1,
    removeOnComplete: false,
    removeOnFail: false,
  });
};

export const closeQueues = async () => {
  await Promise.all(
    Object.values(queues).map(async (queue) => {
      try {
        await queue.close();
      } catch (err) {
        logger.error({ err, queue: queue.name }, 'Error closing BullMQ queue');
      }
    })
  );

  Object.keys(queues).forEach((queueName) => {
    delete queues[queueName];
  });

  await Promise.all(
    queueConnections.splice(0).map(async (connection) => {
      if (connection.status !== 'end') await connection.quit();
    }),
  );
};

if (process.env.NODE_ENV === 'test') {
  const target = globalThis as typeof globalThis & { __gmsTestCleanup?: { closeQueues?: () => Promise<void> } };
  target.__gmsTestCleanup = { ...target.__gmsTestCleanup, closeQueues };
}

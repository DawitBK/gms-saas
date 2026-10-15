import { Worker } from 'bullmq';
import { redisClient } from '../../cache/redis.client';
import { logger } from '../../../core/logger/logger';
import { QUEUE_NAMES } from '../queue';
import { processSlaEnforcementJob } from './sla.processor';
import { registerWorker } from './registry';
import { trackJob } from './worker-observability';

/**
 * Host-response SLA escalation.
 *
 * This worker, `noshow.worker` and `reception-sla.worker` were the only three
 * without a `trackJob` wrapper or a `failed` handler — every other worker in
 * this directory has both. Their processors' primary job IS the state
 * transition (escalate an unanswered visit, mark a no-show, rebook after a
 * reception SLA breach), so when one threw, BullMQ retried three times and
 * then dropped it into its internal failed set with no log line, no Sentry
 * capture and no dead-letter row. Three of the most time-sensitive,
 * guest-facing enforcement paths in the product, failing invisibly: a guest
 * waits in reception, nothing escalates, and the only evidence is a job in a
 * Redis set nobody queries.
 */
export function createSlaWorker() {
    if (!redisClient) return null;

  const worker = new Worker(
    QUEUE_NAMES.SLA_ENFORCEMENT,
    async (job) => {
      const visitId = Number(job.data.visitId);
      logger.info({ visitId }, 'SLA Worker: Processing host response SLA check');
      await trackJob(QUEUE_NAMES.SLA_ENFORCEMENT, job, () => processSlaEnforcementJob(visitId));
    },
    {
      connection: redisClient!,
      concurrency: 5,
    }
  );

  registerWorker(worker);

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, visitId: job?.data?.visitId, err },
      'SLA enforcement job failed — a visit awaiting host response may not have escalated',
    );
  });

  logger.info({ queue: QUEUE_NAMES.SLA_ENFORCEMENT }, 'Worker started successfully');
  return worker;
}




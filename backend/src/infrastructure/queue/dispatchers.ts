import { appConfig } from '../../config/app.config';
import { logger } from '../../core/logger/logger';
import { enqueueJob, queues, QUEUE_NAMES } from './queue';

/**
 * Universal Queue dispatcher pushing to Redis with backoff.
 * If Redis is unavailable, it falls back to inline execution of worker logic.
 *
 * NOTE: Worker logic is dynamically imported to avoid circular dependencies.
 *
 * FIX: outboxEventId (the OutboxEvent row's own primary key - already unique
 * and 1:1 with the intended side effect) is passed through as BullMQ's
 * jobId. If the outbox processor crashes/loses its lock after this call
 * succeeds but before the outbox row is marked processed, the row gets
 * reclaimed and re-dispatched (see STALE_PROCESSING_MS in
 * outbox.repository.ts); without a stable jobId that re-dispatch would add a
 * brand-new BullMQ job and duplicate the side effect (a second "visit
 * approved" email, a second UniFi credential-provisioning attempt, etc).
 * With a stable jobId, BullMQ's Queue.add is a no-op if a job with that id
 * still exists.
 *
 * NOTE: the inline fallback path below (Redis unavailable) does NOT go
 * through BullMQ at all, so jobId-based dedup cannot apply there. It is not
 * idempotent-by-construction against outbox-level retries either: if the
 * outbox row is reclaimed while Redis is still down, the side effect (email
 * send, credential provisioning, etc) is executed inline again. This is a
 * known, narrower residual gap (Redis-down window only) left as-is per the
 * scope of this fix - closing it would require per-worker idempotency checks
 * (e.g. "was this credential already provisioned"), not a queueing change.
 */
export const dispatchQueueJob = async (
  queueName: string,
  jobName: string,
  payload: Record<string, unknown>,
  outboxEventId?: number | string
) => {
  const { isRedisAvailable } = require('../cache/redis.client');

  if (queues[queueName] && isRedisAvailable()) {
    try {
      // BullMQ reserves ':' for its own Redis key format, so it cannot appear
      // in a custom job id. Outbox primary keys are numeric, but use a
      // hyphenated prefix explicitly to keep this safe for string ids too.
      const queued = outboxEventId !== undefined
        ? await enqueueJob(queueName, jobName, payload, { jobId: `outbox-${String(outboxEventId).replace(/:/g, '-')}` })
        : await enqueueJob(queueName, jobName, payload);

      if (queued) return;

      // enqueueJob intentionally returns false after logging a queue error.
      // Treat that as a failure here rather than marking the outbox event
      // processed; falling through executes the existing inline safety net.
      logger.warn({ queueName, jobName }, 'Redis-backed queue rejected the job; falling back to inline job execution');
    } catch (error) {
      // If Redis is configured but temporarily unavailable, keep the business workflow moving.
      logger.warn(
        { err: error, queueName, jobName, production: appConfig.isProduction },
        'Redis-backed queue dispatch failed; falling back to inline job execution'
      );
    }
  }

  // Inline execution is the last-resort safety net when queue infrastructure is absent or degraded.
  logger.warn(
    { queueName, jobName, production: appConfig.isProduction },
    'Redis queue unavailable or disabled, executing worker logic inline'
  );

  try {
    switch (queueName) {
      case QUEUE_NAMES.EMAIL_NOTIFICATION: {
        const { processEmailJobData } = require('./workers/email.worker');
        await processEmailJobData(jobName, payload as any);
        return;
      }
      case QUEUE_NAMES.SMS_NOTIFICATION: {
        const { processSmsJobData } = require('./workers/sms.worker');
        await processSmsJobData(jobName, payload as any);
        return;
      }
      case QUEUE_NAMES.VISIT_REMINDER: {
        const { processReminderJobData } = require('./workers/reminder.worker');
        await processReminderJobData(payload as any);
        return;
      }
      case QUEUE_NAMES.EXPIRATIONS: {
        const { processExpiryJobData } = require('./workers/expiry.worker');
        await processExpiryJobData(payload as any);
        return;
      }
      case QUEUE_NAMES.ACCESS_PROVISIONING: {
        const { processCredentialJobData } = require('./workers/credential.worker');
        await processCredentialJobData(payload as any);
        return;
      }
      case QUEUE_NAMES.NO_SHOW: {
        const { processNoShowJob } = require('./workers/noshow.processor');
        await processNoShowJob(Number(payload.visitId || payload.entity_id));
        return;
      }
      case QUEUE_NAMES.SLA_ENFORCEMENT: {
        const { processSlaEnforcementJob } = require('./workers/sla.processor');
        await processSlaEnforcementJob(Number(payload.visitId || payload.entity_id));
        return;
      }
      case QUEUE_NAMES.RECEPTION_SLA_ENFORCEMENT: {
        const { processReceptionSlaJob } = require('./workers/reception-sla.processor');
        await processReceptionSlaJob(Number(payload.visitId || payload.entity_id));
        return;
      }
      // case QUEUE_NAMES.IDENTITY_VERIFICATION: {
      //   const { processIdentityJobData } = require('./workers/identity.worker');
      //   await processIdentityJobData(payload as any);
      //   return;
      // }
      default:
        logger.warn({ queueName, jobName }, 'No inline dispatcher is available for this queue');
    }
  } catch (err) {
    logger.error({ err, queueName, jobName }, 'Inline job execution failed');
    throw err;
  }
};

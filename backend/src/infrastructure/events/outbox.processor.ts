import { logger } from '../../core/logger/logger';
import { EventBus } from './eventBus';
import { claimPendingOutbox, markOutboxProcessed, markOutboxFailed } from './outbox.repository';
import { dispatchQueueJob } from '../queue/dispatchers';

/**
 * Called via a Cron or setImmediate loop to process pending outbox events.
 */
export const processPendingEvents = async () => {
  try {
    const rows = await claimPendingOutbox();

    for (const row of rows) {
      try {
        if (row.channel === 'EVENT_BUS') {
          EventBus.emitEvent(row.payload as any);
        } else if (row.channel === 'QUEUE_JOB') {
          // FIX: pass the outbox row's own id through as BullMQ's jobId (see
          // dispatchQueueJob in dispatchers.ts) so a reclaimed/retried row
          // can't re-enqueue the same side effect twice.
          await dispatchQueueJob(String(row.queue_name), String(row.job_name), row.payload, row.id);
        } else {
          throw new Error(`Unsupported outbox channel: ${row.channel}`);
        }

        await markOutboxProcessed(Number(row.id));
      } catch (error: any) {
        await markOutboxFailed(
          Number(row.id),
          Number(row.attempt_count ?? 1),
          error instanceof Error ? error.message : 'Unknown outbox processing error',
          Number(row.max_attempts ?? 10)
        );
        logger.error(
          {
            err: error,
            outboxId: row.id,
            channel: row.channel,
            eventType: row.event_type,
            queueName: row.queue_name,
            jobName: row.job_name,
          },
          'Outbox event processing failed'
        );
      }
    }
  } catch (err) {
    logger.error({ err }, 'Outbox Processor faltered during sweep');
  }
};

// Backward-compatible static-like namespace for callers using `OutboxProcessor.processPendingEvents()`
export const OutboxProcessor = { processPendingEvents };

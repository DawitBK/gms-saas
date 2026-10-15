import { Worker } from 'bullmq';
import { redisClient } from '../../cache/redis.client';
import { logger } from '../../../core/logger/logger';
import { QUEUE_NAMES } from '../queue';
import { processNoShowJob } from './noshow.processor';
import { registerWorker } from './registry';
import { trackJob } from './worker-observability';

/** See the note in sla.worker.ts — same missing observability, same fix. */
export function createNoShowWorker() {
    if (!redisClient) return null;

  const worker = new Worker(
    QUEUE_NAMES.NO_SHOW,
    async (job) => {
      const visitId = Number(job.data.visitId);
      logger.info({ visitId }, 'NoShow Worker: Processing no-show check');
      await trackJob(QUEUE_NAMES.NO_SHOW, job, () => processNoShowJob(visitId));
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
      'No-show check failed — the visit may still be holding a slot and a credential it should have lost',
    );
  });

  logger.info({ queue: QUEUE_NAMES.NO_SHOW }, 'Worker started successfully');
  return worker;
}




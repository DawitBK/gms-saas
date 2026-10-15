import { Worker } from 'bullmq';
import { redisClient } from '../../cache/redis.client';
import { logger } from '../../../core/logger/logger';
import { QUEUE_NAMES } from '../queue';
import { processReceptionSlaJob } from './reception-sla.processor';
import { registerWorker } from './registry';
import { trackJob } from './worker-observability';

/** See the note in sla.worker.ts — same missing observability, same fix. */
export function createReceptionSlaWorker() {
    if (!redisClient) return null;

  const worker = new Worker(
    QUEUE_NAMES.RECEPTION_SLA_ENFORCEMENT,
    async (job) => {
      const visitId = Number(job.data.visitId);
      logger.info({ visitId }, 'ReceptionSLA Worker: Processing check');
      await trackJob(QUEUE_NAMES.RECEPTION_SLA_ENFORCEMENT, job, () =>
        processReceptionSlaJob(visitId),
      );
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
      'Reception SLA check failed — a guest waiting past the reception SLA may not have been rebooked',
    );
  });

  logger.info({ queue: QUEUE_NAMES.RECEPTION_SLA_ENFORCEMENT }, 'Worker started successfully');
  return worker;
}




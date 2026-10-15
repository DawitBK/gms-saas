import { Job, Worker } from 'bullmq';
import { redisClient } from '../../cache/redis.client';
import { SmsService } from '../../sms/sms.service';
import { logger } from '../../../core/logger/logger';
import { QUEUE_NAMES } from '../queue';
import { trackJob } from './worker-observability';

import { registerWorker } from './registry';

if (redisClient) {
  try {
    const smsWorker = new Worker(
      QUEUE_NAMES.SMS_NOTIFICATION,
      async (job: Job) => {
        await trackJob(QUEUE_NAMES.SMS_NOTIFICATION, job, () => processSmsJobData(job.name, job.data as any));
      },
      {
        connection: redisClient,
        concurrency: 5,
      }
    );

    registerWorker(smsWorker);

    smsWorker.on('completed', (job) => {
      logger.info({ jobId: job.id, name: job.name }, 'SMS job completed');
    });

    smsWorker.on('failed', (job, err) => {
      logger.error({ jobId: job?.id, name: job?.name, err }, 'SMS job failed');
    });
  } catch (err) {
    logger.error({ err }, 'SMS worker failed to initialize');
  }
}

export async function processSmsJobData(jobName: string, data: { to: string; message: string }): Promise<void> {
  const { to, message } = data;
  const smsService = new SmsService();
  await smsService.send({ to, message });
}

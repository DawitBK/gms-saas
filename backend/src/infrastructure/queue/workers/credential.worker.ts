import { Job, Worker } from 'bullmq';
import { redisClient } from '../../cache/redis.client';
import { CredentialService } from '../../../modules/credentials/credential.service';
import { logger } from '../../../core/logger/logger';
import { QUEUE_NAMES } from '../queue';
import { trackJob } from './worker-observability';

import { registerWorker } from './registry';

if (redisClient) {
  try {
    const credentialWorker = new Worker(
      QUEUE_NAMES.ACCESS_PROVISIONING,
      async (job: Job) => {
        await trackJob(QUEUE_NAMES.ACCESS_PROVISIONING, job, () => processCredentialJob(job));
      },
      {
        connection: redisClient,
        concurrency: 5,
      }
    );

    registerWorker(credentialWorker);

    credentialWorker.on('completed', (job) => {
      logger.info({ jobId: job.id, name: job.name }, 'Credential provisioning job completed');
    });

    credentialWorker.on('failed', (job, err) => {
      logger.error({ jobId: job?.id, name: job?.name, err }, 'Credential provisioning job failed');
    });
  } catch (err) {
    logger.error({ err }, 'Credential worker failed to initialize');
  }
}

async function processCredentialJob(job: Job): Promise<void> {
  await processCredentialJobData(job.data as { visitId: number; actorId: number });
}

export async function processCredentialJobData(data: { visitId: number; actorId: number }): Promise<void> {
  const { visitId, actorId } = data;
  const credentialService = new CredentialService();
  await credentialService.ensureCredentialsForVisit(visitId, actorId);
}

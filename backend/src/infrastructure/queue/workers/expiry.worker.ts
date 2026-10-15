import { Job, Worker } from 'bullmq';
import { Visit } from '../../database/models';
import { redisClient } from '../../cache/redis.client';
import { CredentialService } from '../../../modules/credentials/credential.service';
import { logger } from '../../../core/logger/logger';
import { QUEUE_NAMES } from '../queue';
import { trackJob } from './worker-observability';
import {
  VISIT_STATUS_APPROVED,
  VISIT_STATUS_EXPIRED,
  VISIT_STATUS_PENDING,
} from '../../../core/status/status-catalog';

import { registerWorker } from './registry';

if (redisClient) {
  try {
    const expiryWorker = new Worker(
      QUEUE_NAMES.EXPIRATIONS,
      async (job: Job) => {
        await trackJob(QUEUE_NAMES.EXPIRATIONS, job, () => processExpiryJob(job));
      },
      {
        connection: redisClient,
        concurrency: 10,
      }
    );

    registerWorker(expiryWorker);

    expiryWorker.on('completed', (job) => {
      logger.info({ jobId: job.id }, 'Expiry job completed');
    });

    expiryWorker.on('failed', (job, err) => {
      logger.error({ jobId: job?.id, err }, 'Expiry job failed');
    });
  } catch (err) {
    logger.error({ err }, 'Expiry worker failed to initialize');
  }
}

async function processExpiryJob(job: Job): Promise<void> {
  await processExpiryJobData(
    job.data as {
      visitId: number;
      mode?: 'visit-expiry' | 'terminal-status';
      terminalStatus?: string;
    },
    job.id
  );
}

export async function processExpiryJobData(
  data: {
    visitId: number;
    mode?: 'visit-expiry' | 'terminal-status';
    terminalStatus?: string;
  },
  jobId: string | number = 'inline'
): Promise<void> {
  const { visitId } = data;
  const credentialService = new CredentialService();
  const mode = data.mode ?? 'visit-expiry';

  if (mode === 'terminal-status') {
    logger.info({ jobId, visitId, terminalStatus: data.terminalStatus }, 'Processing terminal visit credential expiry');
    try {
      await credentialService.expireVisitCredentials(visitId);
    } catch (err) {
      // Platform audit finding 4.8: this call has no built-in retry of its
      // own — rethrowing lets BullMQ's job-level retry (3 attempts,
      // exponential backoff, see queue.ts) actually run again, instead of
      // the failure being swallowed as a generic "Expiry job failed" log
      // with no indication a physical door credential may still be active.
      logger.error(
        { jobId, visitId, err },
        'Failed to revoke physical access credential for a terminal visit — door PIN/QR may still be active. Will retry.',
      );
      throw err;
    }
    return;
  }

  const visit = await Visit.findByPk(visitId);

  logger.info({ jobId, visitId }, 'Processing visit expiry check');

  if (!visit) {
    logger.warn({ visitId }, 'Visit not found during expiry check, skipping');
    return;
  }

  const expirableStatuses = [VISIT_STATUS_PENDING, VISIT_STATUS_APPROVED] as const;
  const isPreExpiry = (expirableStatuses as readonly string[]).includes(String(visit.status));

  // Platform audit finding 4.8: previously, this guard skipped EVERY future
  // attempt at credential revocation once the visit was marked EXPIRED
  // below — including a BullMQ retry of this exact job — regardless of
  // whether the UniFi call had actually succeeded. A single UniFi failure
  // permanently stranded an active physical door credential with no way
  // for the system to notice or retry. Now: only bail out entirely for a
  // status that was never eligible for expiry in the first place (e.g.
  // CANCELLED/DECLINED) — an already-EXPIRED visit still falls through to
  // the credential-revocation attempt below, which is safe to re-run
  // (expireVisitCredentials is a no-op once the credential is actually
  // revoked, since it first looks up whether an active credential exists).
  if (!isPreExpiry && String(visit.status) !== VISIT_STATUS_EXPIRED) {
    logger.info({ visitId, status: visit.status }, 'Visit already processed, no expiry needed');
    return;
  }

  if (isPreExpiry) {
    if (!(visit.scheduled_end && visit.scheduled_end < new Date())) {
      return;
    }
    await Visit.update({ status: VISIT_STATUS_EXPIRED }, { where: { id: visitId } });
    logger.info({ visitId }, 'Visit auto-expired by scheduler');
  }

  try {
    await credentialService.expireVisitCredentials(visitId);
  } catch (err) {
    logger.error(
      { visitId, err },
      'Failed to revoke physical access credential for an expired visit — door PIN/QR may still be active. Will retry.',
    );
    throw err;
  }
}

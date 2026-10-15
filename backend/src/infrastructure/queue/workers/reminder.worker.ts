import { Job, Worker } from 'bullmq';
import { Visit, User } from '../../database/models';
import { redisClient } from '../../cache/redis.client';
import { logger } from '../../../core/logger/logger';
import { QUEUE_NAMES } from '../queue';
import { trackJob } from './worker-observability';
import { EmailService } from '../../email/email.service';

import { registerWorker } from './registry';

if (redisClient) {
  try {
    const reminderWorker = new Worker(
      QUEUE_NAMES.VISIT_REMINDER,
      async (job: Job) => {
        await trackJob(QUEUE_NAMES.VISIT_REMINDER, job, () => processReminderJobData(job.data as any));
      },
      {
        connection: redisClient,
        concurrency: 5,
      }
    );

    registerWorker(reminderWorker);

    reminderWorker.on('completed', (job) => {
      logger.info({ jobId: job.id }, 'Reminder job completed');
    });

    reminderWorker.on('failed', (job, err) => {
      logger.error({ jobId: job?.id, err }, 'Reminder job failed');
    });
  } catch (err) {
    logger.error({ err }, 'Reminder worker failed to initialize');
  }
}

export async function processReminderJobData(data: any): Promise<void> {
  const { visitId } = data as { visitId: number };
  const visit = await Visit.findByPk(visitId, {
    include: [{ model: User, as: 'guest' }],
  });

  const v = visit as any;
  if (!v || !v.guest?.email) {
    logger.warn({ visitId }, 'Skipping reminder: Visit or guest email missing');
    return;
  }

  const emailService = new EmailService();
  await emailService.send({
    to: v.guest.email,
    subject: 'Reminder: Your upcoming visit',
    html: emailService.renderVisitStatusEmail({
      guestName: v.guest.full_name,
      heading: 'Upcoming Visit Reminder',
      body: `This is a reminder for your scheduled visit today. Your access code is ready.`,
      qrCode: v.qr_code ?? undefined,
      validUntil: v.scheduled_end,
    }),
  });
}

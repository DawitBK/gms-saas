import { Job, Worker } from 'bullmq';
import { AccessCredential, User, Visit } from '../../database/models';
import { redisClient } from '../../cache/redis.client';
import { EmailService } from '../../email/email.service';
import { logger } from '../../../core/logger/logger';
import { QUEUE_NAMES } from '../queue';
import { dispatchQueueJob } from '../dispatchers';
import { trackJob } from './worker-observability';
import { buildVisitScanUrl } from '../../../shared/services/visit-qr-link.service';
import { resolveCredentialQrPngBuffer, resolveCredentialQrPngDataUri } from '../../../shared/services/credential-qr.service';

import { registerWorker } from './registry';

if (redisClient) {
  try {
    const emailWorker = new Worker(
      QUEUE_NAMES.EMAIL_NOTIFICATION,
      async (job: Job) => {
        await trackJob(QUEUE_NAMES.EMAIL_NOTIFICATION, job, () => processEmailJob(job));
      },
      {
        connection: redisClient,
        concurrency: 5,
      }
    );

    registerWorker(emailWorker);

    emailWorker.on('completed', (job) => {
      logger.info({ jobId: job.id, name: job.name }, 'Email job completed');
    });

    emailWorker.on('failed', (job, err) => {
      logger.error({ jobId: job?.id, name: job?.name, err }, 'Email job failed');
    });
  } catch (err) {
    logger.error({ err }, 'Email worker failed to initialize');
  }
}

async function processEmailJob(job: Job): Promise<void> {
  await processEmailJobData(job.name, job.data as any);
}

export async function processEmailJobData(
  jobName: string,
  data: {
    to?: string;
    subject?: string;
    html?: string;
    visitId?: number;
    guestId?: number;
    otp?: string;
    credentialId?: number;
    template?: 'PENDING_APPROVAL' | 'APPROVED' | 'CANCELLED' | 'RESCHEDULED' | 'REASSIGNED' | 'ESCALATED' | 'CHECKED_IN' | 'REGISTRATION_VERIFICATION';
  }
): Promise<void> {
  const emailService = new EmailService();

  if (jobName === 'SendEmail') {
    const { to, subject, html } = data as { to: string; subject: string; html: string };
    await emailService.send({ to, subject, html });
    return;
  }

  const { visitId, guestId, template, credentialId } = data as {
    visitId?: number;
    guestId?: number;
    otp?: string;
    credentialId?: number;
    template?: 'PENDING_APPROVAL' | 'APPROVED' | 'CANCELLED' | 'RESCHEDULED' | 'REASSIGNED' | 'ESCALATED' | 'CHECKED_IN' | 'REGISTRATION_VERIFICATION';
  };
  const guest = guestId ? await User.findByPk(guestId) : null;
  const visit = visitId ? await Visit.findByPk(visitId) : null;
  const credential = credentialId
    ? await AccessCredential.findByPk(credentialId)
    : visitId
      ? await AccessCredential.findOne({ where: { visit_id: visitId }, order: [['created_at', 'DESC']] })
      : null;
  const qrCode = visit?.qr_code ?? undefined;
  const qrUrl =
    typeof (credential?.metadata as any)?.qr_url === 'string' && (credential?.metadata as any)?.qr_url.trim()
      ? String((credential?.metadata as any)?.qr_url)
      : qrCode
        ? buildVisitScanUrl(qrCode) ?? undefined
        : undefined;
  const qrPngBuffer = await resolveCredentialQrPngBuffer({
    visitQrCode: qrCode,
    metadata: credential?.metadata as Record<string, unknown> | null | undefined,
    width: 220,
  });
  const qrPngDataUri = await resolveCredentialQrPngDataUri({
    visitQrCode: qrCode,
    metadata: credential?.metadata as Record<string, unknown> | null | undefined,
    width: 220,
  });
  const qrPngAttachment =
    qrPngBuffer && visitId
      ? [
        {
          filename: `visit-${visitId}-qr.png`,
          content: qrPngBuffer,
          contentType: 'image/png',
          disposition: 'attachment' as const,
        },
      ]
      : undefined;

  if (!guest?.email) {
    logger.warn({ visitId, guestId, template }, 'Skipping email because recipient email is unavailable');
    return;
  }

  switch (template) {
    case 'REGISTRATION_VERIFICATION': {
      const { otp } = data as { otp?: string };
      await emailService.send({
        to: guest.email,
        subject: 'Verify your GMS account',
        html: emailService.renderVisitStatusEmail({
          guestName: guest.full_name,
          heading: 'Verification Required',
          body: `Welcome to GMS! Please verify your account. Your verification code is: <strong>${otp}</strong> This code will expire in 10 minutes.`,
        }),
      });
      return;
    }

    case 'PENDING_APPROVAL':
      await emailService.send({
        to: guest.email,
        subject: 'Your visit request is pending approval',
        html: emailService.renderVisitStatusEmail({
          guestName: guest.full_name,
          heading: 'Visit request received',
          body: 'Your visit has been created and is waiting for approval.',
          qrCode,
          qrUrl,
          qrPngDataUri,
          validUntil: visit?.scheduled_end,
        }),
        attachments: qrPngAttachment,
      });
      return;

    case 'APPROVED':
      await emailService.send({
        to: guest.email,
        subject: 'Your visit has been approved',
        html: emailService.renderVisitStatusEmail({
          guestName: guest.full_name,
          heading: 'Access approved',
          body: 'Your visit was approved. Present the QR code or PIN below at check-in.',
          qrCode,
          qrUrl,
          qrPngDataUri,
          pinCode: (credential?.metadata as any)?.pin_code ?? null,
          validUntil: visit?.scheduled_end,
        }),
        attachments: qrPngAttachment,
      });

      return;

    case 'CANCELLED':
      await emailService.send({
        to: guest.email,
        subject: 'Your visit request was declined',
        html: emailService.renderVisitStatusEmail({
          guestName: guest.full_name,
          heading: 'Visit unavailable',
          body: 'Your visit was declined or cancelled. Please contact reception if you need help rescheduling.',
        }),
      });
      return;

    case 'RESCHEDULED':
      await emailService.send({
        to: guest.email,
        subject: 'Your visit schedule changed',
        html: emailService.renderVisitStatusEmail({
          guestName: guest.full_name,
          heading: 'Visit rescheduled',
          body: 'Your visit was rescheduled. Please review the updated arrival window below.',
          qrCode,
          qrUrl,
          qrPngDataUri,
          validUntil: visit?.scheduled_end,
        }),
        attachments: qrPngAttachment,
      });
      return;

    case 'REASSIGNED':
      await emailService.send({
        to: guest.email,
        subject: 'Your host assignment changed',
        html: emailService.renderVisitStatusEmail({
          guestName: guest.full_name,
          heading: 'Host reassigned',
          body: 'Your visit was reassigned to a different host. Your QR code remains valid for the updated routing.',
          qrCode,
          qrUrl,
          qrPngDataUri,
          validUntil: visit?.scheduled_end,
        }),
        attachments: qrPngAttachment,
      });
      return;

    case 'ESCALATED':
      await emailService.send({
        to: guest.email,
        subject: 'Reception is reviewing your visit',
        html: emailService.renderVisitStatusEmail({
          guestName: guest.full_name,
          heading: 'Reception follow-up required',
          body: 'Your visit was escalated to reception for additional support. The front desk team will guide the next step.',
          qrCode,
          qrUrl,
          qrPngDataUri,
          validUntil: visit?.scheduled_end,
        }),
        attachments: qrPngAttachment,
      });
      return;

    case 'CHECKED_IN':
      await emailService.send({
        to: guest.email,
        subject: 'You are checked in',
        html: emailService.renderVisitStatusEmail({
          guestName: guest.full_name,
          heading: 'Check-in confirmed',
          body: 'Your arrival has been recorded successfully. Please continue with your assigned host or reception guidance.',
          qrCode,
          qrUrl,
          qrPngDataUri,
          validUntil: visit?.scheduled_end,
        }),
        attachments: qrPngAttachment,
      });
      return;

    default:
      logger.warn({ template, jobName }, 'Unknown email template, skipping');
  }
}


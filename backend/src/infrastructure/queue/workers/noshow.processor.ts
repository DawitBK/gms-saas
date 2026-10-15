import { Visit, Host } from '../../database/models';
import { enqueueJob } from '../../events/outbox.service';
import { QUEUE_NAMES } from '../../../infrastructure/queue/queue';
import { NotificationDomainService } from '../../../modules/notifications/notification.service';
import { VisitService } from '../../../modules/visits/visit.service';
import { logger } from '../../../core/logger/logger';
import {
  VISIT_STATUS_APPROVED,
  VISIT_STATUS_NO_SHOW,
} from '../../../core/status/status-catalog';

import { computeNoShowDeadline } from '../../../config/visit-policy.config';

// Matches unifi-webhook.service.ts's SYSTEM_UNIFI_ACTOR — a system-initiated
// transition, not a real user action.
const SYSTEM_NOSHOW_ACTOR = { id: 0, roles: ['super_admin'] as string[] };

const visitService = new VisitService();

/**
 * No-show transition logic (worker and tests invoke this).
 */
export async function processNoShowJob(visitId: number): Promise<void> {
  const visit = await Visit.findByPk(visitId);
  if (!visit) {
    logger.warn({ visitId }, 'NoShow processor: Visit not found, skipping');
    return;
  }

  if (visit.status !== VISIT_STATUS_APPROVED) {
    logger.info({ visitId, status: visit.status }, 'NoShow processor: Visit already processed, skipping');
    return;
  }

  const graceDeadline = visit.grace_deadline_at
    ? new Date(visit.grace_deadline_at).getTime()
    : computeNoShowDeadline(new Date(visit.scheduled_end)).getTime();

  if (Date.now() < graceDeadline) {
    logger.info({ visitId }, 'NoShow processor: Grace period not yet expired, skipping');
    return;
  }

  // FIX: this used to be a bare Visit.update({status: NO_SHOW}) that
  // completely bypassed VisitTransitionService.processStatusChange — the
  // ONLY code path that calls expireCredentialsIfTerminal, which is what
  // actually tells UniFi Access to revoke the guest's door PIN/QR. A guest
  // marked no-show kept a fully live physical door credential, with the
  // AccessCredential row also left ACTIVE forever in the database. Routing
  // through the real transition service also gets state-machine validation,
  // the slot release (already handled inside it), and audit logging for
  // free instead of hand-rolling a subset of them here.
  await visitService.processStatusChange(visitId, SYSTEM_NOSHOW_ACTOR, VISIT_STATUS_NO_SHOW);

  const notificationService = new NotificationDomainService();
  try {
    if (visit.assigned_host_id) {
      const hostRow = await Host.findByPk(visit.assigned_host_id, { attributes: ['user_id'] });
      const hostUserId = hostRow ? Number((hostRow as { user_id?: number }).user_id) : null;
      if (hostUserId) {
        await notificationService.createNotification(
          hostUserId,
          'Guest No-Show',
          `Visit #${visitId} guest did not check in within the scheduled window. The visit has been marked as no-show and the time slot has been released.`,
          'NO_SHOW'
        );
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ visitId, error: message }, 'NoShow processor: Failed to send notification');
  }

  try {
    // FIX: noshow.worker.ts (the actual BullMQ consumer for this queue)
    // reads job.data.visitId — this self-publish only ever sent entity_id,
    // so Number(job.data.visitId) evaluated to NaN and processNoShowJob(NaN)
    // silently no-op'd every time this ran through the real queued path.
    await enqueueJob(QUEUE_NAMES.NO_SHOW, 'ProcessNoShow', {
      visitId,
      entity_id: visitId,
      office_id: visit.office_id,
      actor_id: 0,
      timestamp: new Date(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ visitId, error: message }, 'NoShow processor: Failed to publish event');
  }

  logger.info({ visitId }, 'NoShow processor: Visit marked as NO_SHOW, slot released');
}

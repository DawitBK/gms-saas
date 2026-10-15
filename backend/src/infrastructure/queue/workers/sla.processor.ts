import { Host, Visit } from '../../database/models';
import { publishEvent } from '../../events/outbox.service';
import { EventTypes } from '../../events/eventTypes';
import { NotificationDomainService } from '../../../modules/notifications/notification.service';
import { logger } from '../../../core/logger/logger';
import {
  VISIT_STATUS_ESCALATED,
  VISIT_STATUS_PENDING,
} from '../../../core/status/status-catalog';

/**
 * Core SLA escalation logic (Redis worker and tests call this directly).
 */
export async function processSlaEnforcementJob(visitId: number): Promise<void> {
  const visit = await Visit.findByPk(visitId);
  if (!visit) {
    logger.warn({ visitId }, 'SLA processor: Visit not found, skipping');
    return;
  }

  if (visit.status !== VISIT_STATUS_PENDING) {
    logger.info({ visitId, status: visit.status }, 'SLA processor: Visit already processed, skipping');
    return;
  }

  if (visit.sla_deadline_at && new Date(visit.sla_deadline_at).getTime() > Date.now()) {
    logger.info({ visitId }, 'SLA processor: SLA deadline not yet reached, skipping');
    return;
  }

  // FIX: the WHERE clause must re-assert the PENDING status checked above —
  // a bare `where: { id }` would blindly overwrite a legitimate concurrent
  // transition (e.g. a host approving right as this deadline check runs),
  // reverting it back to ESCALATED even though downstream work (credential
  // provisioning) had already been enqueued for the approval that "won".
  const [affectedRows] = await Visit.update(
    {
      status: VISIT_STATUS_ESCALATED,
      escalated_to_reception: true,
      escalated_at: new Date(),
      escalation_reason: 'Host did not respond within SLA window (3 working hours)',
    },
    { where: { id: visitId, status: VISIT_STATUS_PENDING } }
  );

  if (affectedRows === 0) {
    logger.info({ visitId }, 'SLA processor: Visit status changed concurrently, skipping escalation');
    return;
  }

  const notificationService = new NotificationDomainService();
  try {
    if (visit.assigned_host_id) {
      const hostRow = await Host.findByPk(visit.assigned_host_id, { attributes: ['user_id'] });
      const hostUserId = hostRow ? Number((hostRow as { user_id?: number }).user_id) : null;
      if (hostUserId) {
        await notificationService.createNotification(
          hostUserId,
          'Visit Escalated — SLA Breach',
          `Visit #${visitId} has been escalated to reception because no response was received within the SLA window.`,
          'SLA_ESCALATED'
        );
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ visitId, error: message }, 'SLA processor: Failed to send notification');
  }

  try {
    // FIX: this used enqueueJob(QUEUE_NAMES.SLA_ESCALATION, ...) — a queue no
    // worker consumes (same dead-queue class as the fixed escalateVisit bug),
    // so the auto-escalation never reached reception dashboards/realtime. It is
    // a domain event, not a job: publish VISIT.ESCALATED like every other
    // escalation path so the office room and operations dashboard update live.
    await publishEvent(
      {
        type: EventTypes.VISIT_ESCALATED,
        metadata: {
          entity_id: visitId,
          office_id: Number(visit.office_id),
          actor_id: 0,
          timestamp: new Date(),
        },
      },
      undefined,
      { type: 'Visit', id: visitId },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ visitId, error: message }, 'SLA processor: Failed to publish event');
  }

  logger.info({ visitId }, 'SLA processor: Visit auto-escalated to reception due to SLA breach');
}

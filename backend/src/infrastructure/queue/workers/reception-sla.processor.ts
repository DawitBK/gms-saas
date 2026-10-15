import { Host, Visit, User, Office } from '../../database/models';
import { logger } from '../../../core/logger/logger';
import { NotificationDomainService } from '../../../modules/notifications/notification.service';
import { VISIT_STATUS_ESCALATED } from '../../../core/status/status-catalog';
import { UserRole } from '../../database/models/UserRole';
import { Role } from '../../database/models/Role';

const RECEPTION_WINDOW_MINUTES = 60;

/**
 * Reception SLA Processor
 *
 * Runs exactly 1 hour after a guest declines a reschedule/reassignment.
 * If reception has not yet acted (visit still ESCALATED), we send the guest
 * a REBOOK_VISIT notification so they can re-initiate the booking flow.
 *
 * All relevant parties are notified of the outcome.
 */
export async function processReceptionSlaJob(visitId: number): Promise<void> {
  const visit = await Visit.findByPk(visitId);

  if (!visit) {
    logger.warn({ visitId }, 'ReceptionSLA: Visit not found, skipping');
    return;
  }

  // If reception already handled the visit (status is no longer ESCALATED), skip
  if (visit.status !== VISIT_STATUS_ESCALATED) {
    logger.info(
      { visitId, status: visit.status },
      'ReceptionSLA: Reception already handled visit — no action needed'
    );
    return;
  }

  // Check the deadline field if set
  if (visit.reception_sla_deadline_at) {
    const deadline = new Date(visit.reception_sla_deadline_at).getTime();
    if (deadline > Date.now()) {
      logger.info({ visitId }, 'ReceptionSLA: Reception SLA deadline not yet reached');
      return;
    }
  }

  logger.warn({ visitId }, 'ReceptionSLA: Reception did NOT act in time — notifying guest to rebook');

  const notifService = new NotificationDomainService();

  // Notify guest: offer rebook
  try {
    await notifService.createNotification(
      Number(visit.guest_id),
      '⏰ Reception did not respond — Please rebook',
      `We're sorry, reception was unable to find you a new slot within ${RECEPTION_WINDOW_MINUTES} minutes. ` +
        `Please use the "Rebook Visit" button to schedule a new visit at your convenience.`,
      'REBOOK_VISIT',
      {
        visit_id: visitId,
        action: 'REBOOK',
        reference_number: visit.reference_number ?? null,
      }
    );
  } catch (err) {
    logger.error({ visitId, err }, 'ReceptionSLA: Failed to notify guest');
  }

  // Notify host (if assigned) that guest needs rebooking
  try {
    if (visit.assigned_host_id) {
      const hostRow = await Host.findByPk(visit.assigned_host_id, { attributes: ['user_id'] });
      const hostUserId = hostRow ? Number((hostRow as any).user_id) : null;
      if (hostUserId) {
        await notifService.createNotification(
          hostUserId,
          'Guest rebooking required',
          `Visit #${visit.reference_number ?? visitId}: Reception did not reassign the guest in time. ` +
            `The guest has been invited to rebook.`,
          'VISIT_REBOOK_ALERT',
          { visit_id: visitId }
        );
      }
    }
  } catch (err) {
    logger.error({ visitId, err }, 'ReceptionSLA: Failed to notify host');
  }

  // Notify all reception staff of the SLA breach
  try {
    const officeId = visit.office_id ? Number(visit.office_id) : null;
    if (officeId) {
      // FIX: this used to omit the office_id filter on the joined user,
      // unlike notifyRoles() in notification.service.ts — a single office's
      // SLA breach paged reception staff at every other office too.
      const receptionStaff = await UserRole.findAll({
        include: [
          { model: Role, as: 'role', where: { name: 'reception' } },
          { model: User, as: 'user', required: true, where: { office_id: officeId } },
        ],
      }) as any[];

      await Promise.all(
        receptionStaff.map(async (ur) => {
          try {
            await notifService.createNotification(
              Number(ur.user_id),
              '⚠️ Reception SLA Breached',
              `Visit #${visit.reference_number ?? visitId} was not reassigned within ${RECEPTION_WINDOW_MINUTES} minutes. ` +
                `The guest has been invited to rebook. Please review this case.`,
              'RECEPTION_SLA_BREACH',
              { visit_id: visitId, office_id: officeId }
            );
          } catch {}
        })
      );
    }
  } catch (err) {
    logger.error({ visitId, err }, 'ReceptionSLA: Failed to notify reception staff');
  }

  logger.info({ visitId }, 'ReceptionSLA: SLA breach handled — guest notified to rebook');
}

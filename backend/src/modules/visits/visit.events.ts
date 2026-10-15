import { EventBus } from '../../infrastructure/events/eventBus';
import { EventTypes } from '../../infrastructure/events/eventTypes';
import { logger } from '../../core/logger/logger';
import { NotificationDomainService } from '../notifications/notification.service';
import { VisitRepository } from './visit.repository';

/**
 * Visits Module Events
 * Handles decoupled side-effects for the booking lifecycle.
 */

const notificationService = new NotificationDomainService();
const visitRepository = new VisitRepository();

EventBus.subscribe(EventTypes.VISIT_CREATED, async (payload) => {
  const visitId = Number(payload.metadata.entity_id);
  logger.info({ visitId }, 'VisitEvent: New booking detected. Pulse dispatched to Notification and Email queues.');
  
  try {
    const visit = await visitRepository.findById(visitId);
    if (visit) {
      await notificationService.createNotification(
        Number(visit.guest_id),
        'Visit Scheduled',
        `Your visit #${visit.reference_number || visit.id} has been scheduled for ${new Date(visit.scheduled_start).toLocaleString()}.`,
        'VISIT_CREATED',
        { visit_id: visit.id }
      );
    }
  } catch (err) {
    logger.error({ err, visitId }, 'VisitEvent: Failed to create creation notification');
  }
});

EventBus.subscribe(EventTypes.VISIT_APPROVED, async (payload) => {
  const visitId = Number(payload.metadata.entity_id);
  logger.info({ visitId }, 'VisitEvent: Booking approved. QR code is now active for reception check-in.');

  try {
    const visit = await visitRepository.findById(visitId);
    if (visit) {
      await notificationService.createNotification(
        Number(visit.guest_id),
        'Visit Approved',
        `Great news! Your visit #${visit.reference_number || visit.id} has been approved.`,
        'VISIT_APPROVED',
        { visit_id: visit.id }
      );
    }
  } catch (err) {
    logger.error({ err, visitId }, 'VisitEvent: Failed to create approval notification');
  }
});

EventBus.subscribe(EventTypes.VISIT_CANCELLED, async (payload) => {
  const visitId = Number(payload.metadata.entity_id);
  logger.info({ visitId }, 'VisitEvent: Booking cancelled. Time slot released back to availability pool.');

  try {
    const visit = await visitRepository.findById(visitId);
    if (visit) {
      await notificationService.createNotification(
        Number(visit.guest_id),
        'Visit Cancelled',
        `Your visit #${visit.reference_number || visit.id} has been cancelled.`,
        'VISIT_CANCELLED',
        { visit_id: visit.id }
      );
    }
  } catch (err) {
    logger.error({ err, visitId }, 'VisitEvent: Failed to create cancellation notification');
  }
});

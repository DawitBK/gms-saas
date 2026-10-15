import { VisitRepository } from '../visit.repository';
import { EventTypes } from '../../../infrastructure/events/eventTypes';
import { publishEvent } from '../../../infrastructure/events/outbox.service';
import { VISIT_STATUS_CHECKED_IN } from '../../../core/status/status-catalog';
import { logger } from '../../../core/logger/logger';
import { withTransaction } from '../../../core/db/transaction';
import { Op } from 'sequelize';

/**
 * DetectStaleVisitsInteractor
 * 
 * Domain-specific use case for identifying visitors who have been 
 * waiting in the facility beyond the acceptable SLA window.
 * 
 * DESIGN: Periodic Watchdog pattern. 
 * This interactor should be called by a background worker every 5-10 minutes.
 */
export class DetectStaleVisitsInteractor {
  private repository: VisitRepository;
  private readonly SLA_THRESHOLD_MINUTES = 15;

  constructor() {
    this.repository = new VisitRepository();
  }

  public async execute() {
    const thresholdDate = new Date();
    thresholdDate.setMinutes(thresholdDate.getMinutes() - this.SLA_THRESHOLD_MINUTES);

    logger.debug({ thresholdDate }, 'Running SLA Audit for stale visits');

    // Find visits that are CHECKED_IN, haven't been breached yet,
    // and have exceeded the waiting threshold.
    const staleVisits = await this.repository.findAll({
      status: VISIT_STATUS_CHECKED_IN,
      checked_in_at: {
        [Op.lt]: thresholdDate
      },
      sla_breached: false // Only flag new breaches
    });

    if (!staleVisits || staleVisits.length === 0) {
      return { flaggedCount: 0 };
    }

    for (const visit of staleVisits) {
      try {
        // FIX: `sla_breached` used to be committed durably and the
        // escalation notification fired only through the in-memory
        // EventBus — not the durable outbox path every other
        // visit-lifecycle event uses. Since the sweep's own guard is
        // `sla_breached: false`, a visit could never be re-swept once that
        // flag was set — if no reception client happened to be connected at
        // that exact tick, the notification vanished with zero durable
        // trace. Write the flag and the outbox row in the same transaction
        // so the notification is guaranteed to exist wherever the flag does.
        await withTransaction(async (t) => {
          await this.repository.updateVisit(visit.id, {
            sla_breached: true,
            sla_breached_at: new Date(),
            escalated_to_reception: true // Also trigger the business escalation flag
          } as any, t);

          await publishEvent(
            {
              type: EventTypes.VISIT_SLA_ESCALATED,
              metadata: {
                entity_id: visit.id,
                office_id: (visit as any).office_id,
                timestamp: new Date(),
                waiting_since: (visit as any).checked_in_at
              }
            },
            t,
            { type: 'Visit', id: visit.id },
          );
        });

        logger.warn({
          visitId: visit.id, 
          guestId: (visit as any).guest_id 
        }, 'SLA Breach detected: Visit escalated to reception');

      } catch (err) {
        logger.error({ err, visitId: visit.id }, 'Failed to escalate stale visit');
      }
    }

    return { flaggedCount: staleVisits.length };
  }
}

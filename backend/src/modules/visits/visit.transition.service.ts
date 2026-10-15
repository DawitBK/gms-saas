import { Transaction } from "sequelize";
import { logger } from "../../core/logger/logger";
import { AppError } from "../../core/errors/AppError";
import { ErrorCodes } from "../../core/errors/errorCodes";
import { withTransaction } from "../../core/db/transaction";
import { mapVisitToDTO } from "./visit.dto";
import { VisitRepository } from "./visit.repository";
import {
  enqueueJob,
  publishEvent,
} from "../../infrastructure/events/outbox.service";
import { logAudit } from "../../shared/services/audit.service";
import { EventTypes } from "../../infrastructure/events/eventTypes";
import { QUEUE_NAMES } from "../../infrastructure/queue/queue";
import { VisitActor } from "./visit.types";
import { VisitScopePolicy } from "./visit.scope.policy";
import { VISIT_STATUS_EVENT_MAP, assertValidVisitTransition } from "./visit.policy";
import {
  NON_OCCUPYING_VISIT_STATUSES,
  VISIT_STATUS_APPROVED,
  VISIT_STATUS_CHECKED_IN,
  VISIT_STATUS_COMPLETED,
  VISIT_STATUS_ESCALATED,
  VISIT_STATUS_PENDING,
} from "../../core/status/status-catalog";
import { computeGraceDeadline, computeNoShowDeadline } from "../../config/visit-policy.config";

/**
 * VisitTransitionService
 * 
 * The core state machine for the Visit lifecycle. 
 * Responsibilities:
 * - Validating status transitions against business policies.
 * - Updating visit metadata (timestamps, deadlines).
 * - Coordinating side effects (credential deactivation, outbox events, background jobs).
 * - Enforcing security scopes for state changes.
 */
export class VisitTransitionService {
  private readonly repository: VisitRepository;
  private readonly scopePolicy: VisitScopePolicy;

  constructor(repository?: VisitRepository, scopePolicy?: VisitScopePolicy) {
    this.repository = repository ?? new VisitRepository();
    this.scopePolicy = scopePolicy ?? new VisitScopePolicy();
  }

  public async processStatusChange(
    visitId: number,
    actor: VisitActor | number,
    newStatus: string,
    existingTransaction?: Transaction,
  ) {
    return withTransaction(async (t) => {
      // Lock the bare row first (no joins, so FOR UPDATE is valid) to
      // serialize concurrent mutations on this visit — see
      // VisitRepository.lockVisitRow for why.
      await this.repository.lockVisitRow(visitId, t);
      const visit = await this.repository.findById(visitId, t);
      if (!visit) {
        throw new AppError("Visit voided natively", ErrorCodes.SYSTEM_NOT_FOUND, 404);
      }

      const normalizedActor =
        typeof actor === "number" ? { id: actor, roles: ["admin"] } : actor;

      await this.scopePolicy.assertActorCanManageVisit(visit as any, normalizedActor);
      assertValidVisitTransition(String((visit as any).status), newStatus);

      /**
       * Three statuses are legal transitions but cannot be reached through
       * this generic endpoint, because reaching them means more than writing
       * the column.
       *
       * RESCHEDULED needs a new `time_slot_id` and the slot bookkeeping that
       * goes with it. REASSIGNED and REASSIGNED_RESCHEDULED need a new
       * `assigned_host_id` and a `VisitAssignment` row recording the handover.
       * `PATCH /visits/:id/status` writes none of that, so it produced visits
       * labelled "REASSIGNED" still pointing at the original host, and
       * "RESCHEDULED" still pointing at the original slot — a status that
       * contradicts every other field on the record, and which the reassignment
       * history then has no entry for.
       *
       * The dedicated endpoints (rescheduleVisit, reassignVisit) do the whole
       * job. Refusing here is what makes them the only way in.
       */
      const REQUIRES_DEDICATED_ENDPOINT: Record<string, string> = {
        RESCHEDULED: "POST /visits/:id/reschedule",
        REASSIGNED: "POST /visits/:id/reassign",
        REASSIGNED_RESCHEDULED: "POST /visits/:id/reassign",
      };
      // No escape hatch: rescheduleVisit and reassignVisit in
      // VisitCommandService write the status themselves after doing the rest
      // of the work, so they do not come through here. Every caller that does
      // (approvals, check-in, the no-show worker, the UniFi webhook) sets one
      // of APPROVED / DECLINED / CHECKED_IN / COMPLETED / NO_SHOW.
      const dedicated = REQUIRES_DEDICATED_ENDPOINT[newStatus];
      if (dedicated) {
        throw new AppError(
          `${newStatus} cannot be set directly — it requires a new host or timeslot to be chosen. Use ${dedicated}.`,
          ErrorCodes.INVALID_OPERATION,
          400,
        );
      }

      const fromStatus = (visit as any).status;
      // FIX: VisitStateMachine.validateTransition (above) deliberately treats
      // re-applying the same status as a valid no-op — that's what lets two
      // callers racing on the same visit (double-click, network retry, a
      // UniFi webhook racing a manual check-in) resolve safely once this
      // FOR UPDATE lock serializes them, instead of the second one throwing.
      // But the audit log + outbox publish below used to run unconditionally
      // even on that no-op path, so the "loser" of the race still produced a
      // duplicate audit row and a duplicate outbox event — and every caller
      // that does its own extra work after calling this (confirmation
      // emails, markGuestVisit, etc.) had the same problem. Expose whether a
      // real transition happened so both this method and its callers can
      // skip duplicate side effects on the no-op path.
      const changed = String(fromStatus) !== newStatus;
      const isLeavingEscalation =
        String(fromStatus) === VISIT_STATUS_ESCALATED &&
        newStatus !== VISIT_STATUS_ESCALATED;
      const updatePayload: any = {
        status: newStatus,
        escalated_to_reception:
          newStatus === VISIT_STATUS_ESCALATED
            ? true
            : newStatus === VISIT_STATUS_PENDING || isLeavingEscalation
              ? false
              : (visit as any).escalated_to_reception,
      };

      if (newStatus === VISIT_STATUS_ESCALATED) {
        updatePayload.escalated_at = (visit as any).escalated_at ?? new Date();
        updatePayload.escalated_by_id =
          (visit as any).escalated_by_id ?? normalizedActor.id;
      }

      if (newStatus === VISIT_STATUS_APPROVED && (visit as any).scheduled_start) {
        const parsedStart = new Date((visit as any).scheduled_start);
        if (!Number.isNaN(parsedStart.getTime())) {
          updatePayload.grace_deadline_at = computeGraceDeadline(parsedStart);
        }
      }

      if (newStatus === VISIT_STATUS_CHECKED_IN && !(visit as any).checked_in_at) {
        updatePayload.checked_in_at = new Date();
      }

      if (newStatus === VISIT_STATUS_COMPLETED && !(visit as any).checked_out_at) {
        updatePayload.checked_out_at = new Date();
      }

      const [, updatedRows] = await this.repository.updateVisit(
        visitId,
        updatePayload,
        t,
      );
      const updatedVisit = updatedRows[0];

      await this.releaseSlotIfTerminal(visitId, newStatus, t);
      await this.reclaimOrClearSlotOnReopen(visitId, String(fromStatus), newStatus, t);
      await this.expireCredentialsIfTerminal(visitId, newStatus, t);

      if (changed) {
        await logAudit(
          normalizedActor.id,
          `VISIT_${newStatus}`,
          "Visit",
          visitId,
          null,
          { previous_status: fromStatus },
          t
        );

        const eventType = VISIT_STATUS_EVENT_MAP[newStatus] as EventTypes | undefined;
        if (eventType) {
          await publishEvent(
            {
              type: eventType,
              metadata: {
                entity_id: visitId,
                office_id: (visit as any).office_id,
                actor_id: normalizedActor.id,
                timestamp: new Date(),
              },
            },
            t,
            { type: "Visit", id: visitId },
          );
        }
      }

      if (newStatus === VISIT_STATUS_APPROVED) {
        // Enqueue credential provisioning for any transition to APPROVED
        await enqueueJob(
          QUEUE_NAMES.ACCESS_PROVISIONING,
          "ProvisionVisitCredential",
          {
            visitId,
            actorId: normalizedActor.id,
          },
          t,
          { type: "Visit", id: visitId }
        );

        if ((visit as any).scheduled_start) {
          try {
            const scheduledStart = new Date((visit as any).scheduled_start);
            
            if (!Number.isNaN(scheduledStart.getTime())) {
              // 1. Schedule NO_SHOW check (1 hour after scheduled_start per user request)
              const noShowAt = new Date(scheduledStart.getTime() + 60 * 60 * 1000);
              await enqueueJob(QUEUE_NAMES.NO_SHOW, "NoShowCheck", { visitId }, t, {
                type: "Visit",
                id: visitId,
              }, noShowAt);

              // 2. Schedule HOST REMINDER (15 minutes before scheduled_start)
              const reminderAt = new Date(scheduledStart.getTime() - 15 * 60 * 1000);
              await enqueueJob(QUEUE_NAMES.VISIT_REMINDER, "ApprovedVisitReminder", {
                visitId,
                guestId: (visit as any).guest_id,
                hostId: (visit as any).assigned_host_id,
                scheduledStart: (visit as any).scheduled_start,
              }, t, {
                type: "Visit",
                id: visitId,
              }, reminderAt);
            }
          } catch {
            // best-effort scheduling
          }
        }
      }

      const hydrated = await this.repository.findById(visitId, t);
      return { visit: mapVisitToDTO(hydrated ?? updatedVisit), changed };
    }, existingTransaction);
  }

  private async releaseSlotIfTerminal(
    visitId: number,
    newStatus: string,
    t: Transaction,
  ) {
    if (!(NON_OCCUPYING_VISIT_STATUSES as readonly string[]).includes(newStatus)) {
      return;
    }

    const visit = await this.repository.findById(visitId, t);
    const slotId = (visit as any)?.time_slot_id
      ? Number((visit as any).time_slot_id)
      : null;

    if (slotId) {
      await this.repository.releaseTimeSlot(slotId, t);
    }
  }

  /**
   * A visit coming back out of a terminal state must not silently keep a
   * timeslot it no longer owns.
   *
   * VisitStateMachine deliberately allows four reopenings — DECLINED→PENDING
   * and CANCELLED→PENDING ("re-open for correction"), NO_SHOW→RESCHEDULED and
   * EXPIRED→RESCHEDULED. All four leave states that already ran
   * `releaseSlotIfTerminal` on the way in, which marked the timeslot available
   * again. Reopening did nothing about that: the visit kept its
   * `time_slot_id`, so it pointed at a slot Postgres now considers free —
   * bookable, and very likely already booked, by somebody else. Two guests,
   * one slot, one host, and nothing anywhere reporting a conflict.
   *
   * The slot is reclaimed if it is still genuinely free. If it has since been
   * taken, the reference is cleared instead, which puts the visit into the
   * same state as any other unslotted booking and forces reception to pick a
   * new time explicitly. Losing the original slot is the correct outcome —
   * releasing it was the point of cancelling.
   */
  private async reclaimOrClearSlotOnReopen(
    visitId: number,
    fromStatus: string,
    newStatus: string,
    t: Transaction,
  ) {
    const nonOccupying = NON_OCCUPYING_VISIT_STATUSES as readonly string[];
    const isReopening =
      nonOccupying.includes(fromStatus) && !nonOccupying.includes(newStatus);
    if (!isReopening) return;

    const visit = await this.repository.findById(visitId, t);
    const slotId = (visit as any)?.time_slot_id
      ? Number((visit as any).time_slot_id)
      : null;
    if (!slotId) return;

    // Conditional update — only claims the slot if it is still unbooked, so
    // two reopenings racing for the same slot cannot both win.
    const reclaimed = await this.repository.reclaimTimeSlotIfFree(slotId, t);
    if (reclaimed) return;

    await this.repository.updateVisit(visitId, { time_slot_id: null }, t);
    logger.warn(
      { visitId, slotId, fromStatus, newStatus },
      "Visit reopened but its original timeslot had already been taken — slot reference cleared, the visit needs rescheduling",
    );
  }

  private async expireCredentialsIfTerminal(
    visitId: number,
    newStatus: string,
    t: Transaction,
  ) {
    if (!(NON_OCCUPYING_VISIT_STATUSES as readonly string[]).includes(newStatus)) {
      return;
    }

    await enqueueJob(
      QUEUE_NAMES.EXPIRATIONS,
      "ExpireVisitCredentials",
      {
        visitId,
        mode: "terminal-status",
        terminalStatus: newStatus,
      },
      t,
      { type: "Visit", id: visitId },
    );
  }
}

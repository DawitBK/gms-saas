import { AppError } from "../../core/errors/AppError";
import { ErrorCodes } from "../../core/errors/errorCodes";
import { ApprovalRepository } from "./approval.repository";
import { ApprovalDecisionInput, mapApprovalToDTO } from "./approval.dto";
import { VisitService } from "../visits/visit.service";
import { logAudit } from "../../shared/services/audit.service";
import { NotificationDomainService } from "../notifications/notification.service";
import { QUEUE_NAMES } from "../../infrastructure/queue/queue";
import { enqueueJob } from "../../infrastructure/events/outbox.service";
import { withTransaction } from "../../core/db/transaction";
import { APPROVABLE_VISIT_STATUSES } from "../visits/visit-statuses";
import { VISIT_STATUS_APPROVED } from "../../core/status/status-catalog";

export class ApprovalService {
  private approvalRepository: ApprovalRepository;
  private visitService: VisitService;
  private notificationService: NotificationDomainService;
  constructor() {
    this.approvalRepository = new ApprovalRepository();
    this.visitService = new VisitService();
    this.notificationService = new NotificationDomainService();
  }

  public async decideVisit(
    visitId: number,
    actor: { id: number; roles?: string[]; office_id?: number },
    input: ApprovalDecisionInput,
  ) {
    return withTransaction(async (transaction) => {
      const visit = await this.approvalRepository.findVisitForDecision(
        visitId,
        transaction,
      );
      if (!visit) {
        throw new AppError("Visit not found", ErrorCodes.SYSTEM_NOT_FOUND, 404);
      }

      const approvableStatuses = new Set<string>(APPROVABLE_VISIT_STATUSES);
      if (!approvableStatuses.has(String(visit.status))) {
        throw new AppError(
          "Visit is not in an approvable state",
          ErrorCodes.INVALID_INPUT,
          400,
        );
      }

      // Prevent contradictory decisions on already approved visits.
      if (String(visit.status) === VISIT_STATUS_APPROVED) {
        if (input.decision === "DECLINED") {
          throw new AppError(
            "An approved visit cannot be declined directly. Reassign, reschedule, or cancel it instead.",
            ErrorCodes.INVALID_OPERATION,
            409,
          );
        }

        const latestApproval =
          await this.approvalRepository.findLatestByVisitId(visitId);
        const currentVisit = await this.visitService.getVisitForActor(
          visitId,
          actor,
        );
        return {
          approval: latestApproval ? mapApprovalToDTO(latestApproval) : null,
          visit: currentVisit,
          already_decided: true,
        };
      }

      const previousStatus = visit.status;
      const nextStatus =
        input.decision === "APPROVED" ? "APPROVED" : "DECLINED";
      // processStatusChange now returns { visit, changed }. `changed` isn't
      // consulted here: APPROVABLE_VISIT_STATUSES + the already-APPROVED
      // early-return above mean the only way to reach this call is from a
      // genuinely different status (PENDING), so a no-op is only reachable
      // via a true concurrent double-decision race — an edge case this
      // method doesn't special-case beyond what processStatusChange itself
      // already guards against.
      const { visit: updatedVisit } = await this.visitService.processStatusChange(
        visitId,
        actor,
        nextStatus,
        transaction,
      );
      const approval = await this.approvalRepository.create(
        {
          visit_id: visitId,
          approver_id: actor.id,
          status: nextStatus,
          reason: input.reason,
        },
        transaction,
      );

      await logAudit(
        actor.id,
        `VISIT_${nextStatus}_DECISION`,
        "Approval",
        approval.id,
        { visit_id: visitId, status: previousStatus },
        { decision: nextStatus, reason: input.reason ?? null },
        transaction,
      );

      if (input.decision === "APPROVED") {
        // Approval notification fan-out is intentionally deferred until credential activation succeeds.
        // ACCESS_PROVISIONING is now handled globally in VisitTransitionService
      } else {
        await this.notificationService.createNotification(
          visit.guest_id,
          "Visit Declined",
          "Your visit request was declined. Please contact reception for help.",
          "VISIT_DECLINED",
        );

        await enqueueJob(
          QUEUE_NAMES.EMAIL_NOTIFICATION,
          "VisitDeclinedEmail",
          {
            visitId,
            guestId: visit.guest_id,
            template: "CANCELLED",
          },
          transaction,
          { type: "Visit", id: visitId },
        );

        await enqueueJob(
          QUEUE_NAMES.SMS_NOTIFICATION,
          "VisitDeclinedSms",
          {
            visitId,
            guestId: visit.guest_id,
            template: "CANCELLED",
          },
          transaction,
          { type: "Visit", id: visitId },
        );
      }

      return {
        approval: mapApprovalToDTO(approval),
        visit: updatedVisit,
      };
    }).catch((error) => {
      // Log detailed error information for debugging
      console.error('Approval service error:', {
        visitId,
        actor: { id: actor.id, roles: actor.roles, office_id: actor.office_id },
        input,
        error: error.message,
        stack: error.stack
      });
      throw error;
    });
  }

  public async listVisitApprovals(
    visitId: number,
    actor?: { id: number; roles?: string[]; office_id?: number },
  ) {
    /**
     * This endpoint had no scoping of any kind — `requireRole(['admin','host',
     * 'reception'])` and nothing else. Visit ids are sequential, so any staff
     * member at any office could walk `/approvals/visit/1..n` and read who
     * approved or declined every visit in the estate, and the free-text reason
     * they gave for declining. Decline reasons are candid ("previously removed
     * from site", "ongoing dispute") because their authors reasonably assume a
     * small audience.
     *
     * `getVisitForActor` is the visit module's own scope policy — the same one
     * that decides whether this person may see the visit at all. Approvals are
     * strictly narrower than the visit they belong to, so deferring to it keeps
     * the two from disagreeing, and it throws 403/404 on its own.
     */
    if (actor) {
      await this.visitService.getVisitForActor(visitId, actor as any);
    }

    const approvals = await this.approvalRepository.findByVisitId(visitId);
    return approvals.map(mapApprovalToDTO);
  }
}

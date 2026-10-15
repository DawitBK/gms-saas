import { ExclusionConstraintError } from "sequelize";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { VisitRepository } from "./visit.repository";
import { AppError } from "../../core/errors/AppError";
import { ErrorCodes } from "../../core/errors/errorCodes";
import { logger } from "../../core/logger/logger";
import { mapVisitToDTO } from "./visit.dto";
import { withTransaction } from "../../core/db/transaction";
import { EventTypes } from "../../infrastructure/events/eventTypes";
import {
  publishEvent,
  enqueueJob,
} from "../../infrastructure/events/outbox.service";
import { QUEUE_NAMES } from "../../infrastructure/queue/queue";
import { logAudit } from "../../shared/services/audit.service";
import { HostAssignmentService } from "./host-assignment.service";
import { NotificationDomainService } from "../notifications/notification.service";
import { ServiceRepository } from "../services/service.repository";
import {
  VisitAssignment,
  GuestProfile,
  Office,
} from "../../infrastructure/database/models";
import { computeSlaDeadline } from "../../config/visit-policy.config";
import { AuthRepository } from "../auth/auth.repository";
import { isAdminRole, isReceptionRole } from "../../shared/auth/roles";
import { VisitActor } from "./visit.types";
import {
  assertNotTerminalVisitStatus,
  assertValidVisitTransition,
  assertVisitSlotStartsInFuture,
} from "./visit.policy";
import { VisitScopePolicy } from "./visit.scope.policy";
import { QUEUE_NAMES as QUEUE_NAME_CONST } from "../../infrastructure/queue/queue";
import {
  TIMESLOT_STATE_AVAILABLE,
  TIMESLOT_STATE_BLOCKED,
  TIMESLOT_STATE_BOOKED,
  VISIT_GUEST_DECISION_ACCEPTED,
  VISIT_GUEST_DECISION_DECLINED,
  VISIT_GUEST_DECISION_PENDING,
  VISIT_STATUS_ESCALATED,
  VISIT_STATUS_PENDING,
  VISIT_STATUS_REASSIGNED,
  VISIT_STATUS_REASSIGNED_RESCHEDULED,
  VISIT_STATUS_RESCHEDULED,
} from "../../core/status/status-catalog";

/**
 * VisitCommandService
 * 
 * The primary mutation layer for the Visit domain. This service handles the creation, 
 * modification, and complex operational transitions of visits.
 * 
 * Key Responsibilities:
 * - Atomic booking creation with guest profile auto-provisioning.
 * - Host assignment and load-balancing orchestration.
 * - Resource conflict detection during temporal extensions.
 * - Physical hardware synchronization (UniFi Access) via the Credential Service.
 * - SLA enforcement and automated notification dispatch.
 */
/**
 * Booking a visit for somebody other than yourself is a front-desk action.
 * Admin and reception (and their super_* variants, which `isAdminRole` /
 * `isReceptionRole` already cover) do it for walk-ins; a host or a guest has
 * no reason to, and no way to prove they were asked to.
 */
function canBookOnBehalfOfOthers(roles: string[] = []): boolean {
  return roles.some((role) => isAdminRole(role) || isReceptionRole(role));
}

export class VisitCommandService {
  private readonly repository: VisitRepository;
  private readonly assignmentService: HostAssignmentService;
  private readonly scopePolicy: VisitScopePolicy;

  constructor(
    repository?: VisitRepository,
    assignmentService?: HostAssignmentService,
    scopePolicy?: VisitScopePolicy,
  ) {
    this.repository = repository ?? new VisitRepository();
    this.assignmentService = assignmentService ?? new HostAssignmentService();
    this.scopePolicy = scopePolicy ?? new VisitScopePolicy();
  }

  public async createVisit(guestId: number, payload: any, actorRoles: string[] = []) {
    /**
     * `guest_id` lets reception book a visit on a walk-in's behalf. It is a
     * staff capability, and until now nothing said so: `createVisitSchema`
     * accepts `guest_id` from any caller, `POST /visits` carries no
     * `requireRole` gate at all (only idempotency, schema validation and
     * `enforceOfficeScope`, which inspects `office_id` and never `guest_id`),
     * and this line trusted the body over the authenticated identity.
     *
     * Any authenticated principal — including a plain `guest` — could
     * therefore book a visit AS somebody else by passing that person's user
     * id, which is small and sequential. Two consequences, not one: the
     * confirmation email and SMS go to the victim, and `isVip` is read from
     * the victim's GuestProfile further down, so booking as a VIP inherits the
     * VIP branch's bypass of the slot-lock and overlap checks.
     *
     * Booking for yourself is unaffected — passing your own id is allowed
     * explicitly, since some clients echo it back rather than omitting it.
     */
    const requestedGuestId = payload.guest_id ? Number(payload.guest_id) : null;
    if (
      requestedGuestId !== null &&
      requestedGuestId !== guestId &&
      !canBookOnBehalfOfOthers(actorRoles)
    ) {
      throw new AppError(
        "You can only book a visit for yourself.",
        ErrorCodes.AUTH_FORBIDDEN,
        403,
      );
    }

    let finalGuestId = requestedGuestId ?? guestId;
    const officeId = Number(payload.office_id);
    const serviceId = payload.service_id ? Number(payload.service_id) : null;
    let precomputedPasswordHash: string | null = null;

    if (payload.guest_payload && !payload.guest_id) {
      // Precompute hash outside transaction to prevent DB connection starvation (CPU intensive)
      precomputedPasswordHash = await bcrypt.hash(randomUUID(), 12);
    }

    return withTransaction(async (t) => {
      if (payload.guest_payload) {
        const authRepo = new AuthRepository();
        const existing = await authRepo.findUserByEmail(
          payload.guest_payload.email,
        );
        if (existing) {
          finalGuestId = Number((existing as any).id);
          // Update existing profile with new triage data if provided
          if (
            payload.guest_payload.company ||
            payload.guest_payload.government_id ||
            payload.guest_payload.document_url
          ) {
            await GuestProfile.update(
              {
                company: payload.guest_payload.company ?? undefined,
                government_id: payload.guest_payload.government_id ?? undefined,
                document_url: payload.guest_payload.document_url ?? undefined,
              },
              { where: { user_id: finalGuestId }, transaction: t },
            );
          }
        } else {
          const user = await authRepo.createUser(
            {
              full_name: payload.guest_payload.full_name,
              email: payload.guest_payload.email,
              phone: payload.guest_payload.phone || null,
              password_hash: precomputedPasswordHash!,
              status: "ACTIVE",
            },
            t,
          );
          await authRepo.assignRoles(user.id, ["guest"], t);
          await authRepo.findOrCreateGuestProfile(user.id, {}, t);
          if (
            payload.guest_payload.company ||
            payload.guest_payload.government_id ||
            payload.guest_payload.document_url
          ) {
            await GuestProfile.update(
              {
                company: payload.guest_payload.company ?? undefined,
                government_id: payload.guest_payload.government_id ?? undefined,
                document_url: payload.guest_payload.document_url ?? undefined,
              },
              { where: { user_id: user.id }, transaction: t },
            );
          }
          finalGuestId = user.id;
        }
      }

      const guestProfile = await GuestProfile.findOne({
        where: { user_id: finalGuestId },
        transaction: t,
      });
      const isVip = guestProfile?.is_vip ?? false;

      let inferredDepartmentId: number | null = payload.department_id ?? null;
      if (
        (inferredDepartmentId === null || inferredDepartmentId === undefined) &&
        payload.service_id
      ) {
        const serviceRepo = new ServiceRepository();
        const svc = await serviceRepo.findById(Number(payload.service_id));
        inferredDepartmentId = svc ? Number((svc as any).department_id) : null;
      }

      if (!inferredDepartmentId) {
        throw new AppError(
          "Could not determine department for this booking",
          ErrorCodes.INVALID_INPUT,
          400,
        );
      }

      let assignedHostId: number | null = payload.host_id
        ? Number(payload.host_id)
        : null;
      let slotId = Number(payload.time_slot_id);
      let isEscalated = false;
      let manualAssignment = !!payload.host_id;
      let assignmentAudit: any = null;

      // 1. Fetch the requested slot first
      let slot = await this.repository.findTimeSlotWithLock(slotId, t);
      if (!slot) {
        throw new AppError(
          "Selected arrival window was not found",
          ErrorCodes.SYSTEM_NOT_FOUND,
          404,
        );
      }

      // 2. If no host explicitly requested, try to load-balance
      if (!assignedHostId) {
        const assignmentResult = await this.assignmentService.assignHost({
          serviceId,
          departmentId: inferredDepartmentId,
          officeId,
          timeSlotId: slotId,
          transaction: t,
        });

        if (assignmentResult) {
          assignedHostId = assignmentResult.hostId;
          slotId = assignmentResult.slotId;
          assignmentAudit = assignmentResult.audit;
          // Refresh slot reference if we swapped slots
          slot = await this.repository.findTimeSlotWithLock(slotId, t);
          if (!slot) {
            throw new AppError(
              "Swapped slot not found",
              ErrorCodes.SYSTEM_NOT_FOUND,
              404,
            );
          }
        } else {
          // Fallback to the requested slot's host if load balancing failed (e.g., cross-office service)
          assignedHostId = Number((slot as any).host_id);
          if (!assignedHostId) {
            isEscalated = true;
          }
        }
      }

      if (
        !isVip &&
        ((slot as any).is_booked ||
          (slot as any).slot_state === TIMESLOT_STATE_BLOCKED ||
          ((slot as any).visits && (slot as any).visits.length > 0))
      ) {
        throw new AppError(
          "Requested visit time strictly locked or already consumed by another booking",
          ErrorCodes.SLOT_LOCKED,
          409,
        );
      }

      if (!isVip) {
        assertVisitSlotStartsInFuture(
          slot,
          "Selected arrival window has already passed",
        );
      }

      const overlappingGuestVisits =
        await this.repository.findOverlappingGuestVisits(
          finalGuestId,
          (slot as any).start_time,
          (slot as any).end_time,
          t,
        );

      if (!isVip && overlappingGuestVisits.length > 0) {
        throw new AppError(
          "You already have an active visit scheduled during this time window.",
          ErrorCodes.INVALID_INPUT,
          409,
        );
      }

      // If VIP and conflict exists, mark as escalated
      if (
        isVip &&
        ((slot as any).is_booked ||
          (slot as any).slot_state === TIMESLOT_STATE_BLOCKED ||
          overlappingGuestVisits.length > 0 ||
          !assignedHostId)
      ) {
        isEscalated = true;
      }

      const slaDeadline = computeSlaDeadline(new Date());
      const office = await Office.findByPk(officeId, {
        transaction: t,
      });

      const officeCode = office?.name
        ? office.name
            .split(" ")
            .map((w) => w[0])
            .join("")
            .substring(0, 3)
            .toUpperCase()
        : "OFC";

      const dailySeq = await this.repository.getNextDailySequence(officeId, t);
      const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, "");
      const referenceNumber = `${officeCode}-${dateStr}-${String(dailySeq).padStart(3, "0")}`;

      // Calculate actual visit end time based on service duration
      let actualScheduledEnd = (slot as any).end_time;
      if (serviceId) {
        const serviceRepo = new ServiceRepository();
        const service = await serviceRepo.findById(serviceId);
        if (service && (service as any).duration_minutes) {
          const durationMs = (service as any).duration_minutes * 60 * 1000;
          const calculatedEnd = new Date((slot as any).start_time.getTime() + durationMs);
          // Use the calculated end time, but don't exceed the slot's end time boundary
          actualScheduledEnd = calculatedEnd <= (slot as any).end_time ? calculatedEnd : (slot as any).end_time;
        }
      }

      const visitData: any = {
        status: isEscalated ? VISIT_STATUS_ESCALATED : VISIT_STATUS_PENDING,
        guest_id: finalGuestId,
        service_id: serviceId,
        department_id: inferredDepartmentId,
        office_id: officeId,
        time_slot_id: Number((slot as any).id),
        assigned_host_id: assignedHostId,
        scheduled_start: (slot as any).start_time,
        scheduled_end: actualScheduledEnd,
        purpose: payload.purpose ?? null,
        qr_code: randomUUID(),
        reference_number: referenceNumber,
        daily_sequence: dailySeq,
        escalated_to_reception: isEscalated,
        escalated_at: isEscalated ? new Date() : null,
        is_vip: isVip,
        escalation_reason: isEscalated
          ? isVip
            ? "VIP Overbooking - Urgent reconciliation required"
            : "No available host - auto-escalated to reception"
          : null,
        sla_deadline_at: isEscalated ? null : slaDeadline,
      };

      let newVisit;
      try {
        newVisit = await this.repository.createVisitAtomic(
          visitData,
          Number((slot as any).id),
          t,
        );
      } catch (err: any) {
        if (
          err instanceof ExclusionConstraintError ||
          err?.parent?.code === "23P01" ||
          err?.parent?.code === "23505"
        ) {
          throw new AppError(
            "Requested visit time conflicts with an existing booking",
            ErrorCodes.SLOT_LOCKED,
            409,
          );
        }
        if (
          err?.name === "SequelizeForeignKeyConstraintError" ||
          err?.parent?.code === "23503"
        ) {
          throw new AppError(
            "One or more selected references are invalid (office, service, host, or slot).",
            ErrorCodes.INVALID_INPUT,
            400,
          );
        }
        if (err?.parent?.code === "22P02") {
          throw new AppError(
            "One or more identifier values are invalid.",
            ErrorCodes.INVALID_INPUT,
            400,
          );
        }
        throw err;
      }

      const createdVisitId = Number((newVisit as any).id);

      if (assignedHostId) {
        try {
          await VisitAssignment.create(
            {
              visit_id: createdVisitId,
              host_id: assignedHostId,
              assigned_at: new Date(),
              assignment_reason: manualAssignment
                ? "manual_assigned"
                : "auto_assigned",
              candidate_hosts: assignmentAudit?.candidates ?? [],
              load_metrics: assignmentAudit?.loadMetrics ?? {},
              is_current: true,
              assigned_by_id: manualAssignment ? guestId : null,
            },
            { transaction: t },
          );
        } catch (err) {
          // FIX: previously swallowed with zero logging — a failure here
          // left the visit created with no VisitAssignment history row and
          // no trace it had happened. Still fail-open (assignment history
          // is supplementary to the visit itself), just log it now.
          logger.warn({ err, visitId: createdVisitId, hostId: assignedHostId }, "Failed to record VisitAssignment history for newly created visit");
        }
      }

      // Passing `t` makes this write atomic with the rest of the transaction
      // (and lets audit.service.ts's own logAudit rethrow-on-failure invariant
      // do its job): a failed audit insert must abort the whole transaction,
      // not be swallowed here — Postgres has already marked the transaction
      // aborted on the failed statement, so silently continuing past it (the
      // old local try/catch) risked a confusing secondary "current
      // transaction is aborted" error on the next query instead of a clean
      // rollback.
      await logAudit(
        guestId,
        "VISIT_CREATED",
        "Visit",
        createdVisitId,
        null,
        {
          officeId,
          guestId: finalGuestId,
        },
        t,
      );

      try {
        await publishEvent(
          {
            type: EventTypes.VISIT_CREATED,
            metadata: {
              entity_id: createdVisitId,
              office_id: officeId,
              actor_id: guestId,
              timestamp: new Date(),
            },
          },
          t,
          { type: "Visit", id: createdVisitId },
        );
      } catch (err) {
        // FIX: previously swallowed with zero logging — a failure here means
        // no downstream consumer (websocket fan-out, etc.) ever learns this
        // visit was created, with no trace it had happened. Still fail-open,
        // just log it now.
        logger.warn({ err, visitId: createdVisitId }, "Failed to publish VISIT_CREATED outbox event");
      }

      try {
        await enqueueJob(
          QUEUE_NAMES.EMAIL_NOTIFICATION,
          "VisitScheduledEmail",
          {
            visitId: createdVisitId,
            guestId: finalGuestId,
            template: isEscalated ? "ESCALATED" : "PENDING_APPROVAL",
          },
          t,
          { type: "Visit", id: createdVisitId },
        );
      } catch (err) {
        // FIX: previously swallowed with zero logging — a failure here means
        // the guest silently never gets their booking confirmation email,
        // with no trace it had happened. Still fail-open, just log it now.
        logger.warn({ err, visitId: createdVisitId, guestId: finalGuestId }, "Failed to enqueue VisitScheduledEmail notification");
      }

      try {
        await enqueueJob(
          QUEUE_NAMES.SMS_NOTIFICATION,
          "VisitCreatedSms",
          {
            visitId: createdVisitId,
            guestId: finalGuestId,
            template: isEscalated ? "ESCALATED" : "PENDING_APPROVAL",
          },
          t,
          { type: "Visit", id: createdVisitId },
        );
      } catch (err) {
        // FIX: previously swallowed with zero logging — a failure here means
        // the guest silently never gets their booking confirmation SMS, with
        // no trace it had happened. Still fail-open, just log it now.
        logger.warn({ err, visitId: createdVisitId, guestId: finalGuestId }, "Failed to enqueue VisitCreatedSms notification");
      }

      try {
        if (isEscalated && isVip) {
          const notifService = new NotificationDomainService();
          await notifService.notifyRoles(
            ["reception", "super_reception", "admin", "super_admin"],
            "URGENT: VIP Arrival Escalated",
            `VIP Guest #${finalGuestId} has a conflict for Visit #${createdVisitId}. Immediate reconciliation required.`,
            "VIP_ESCALATION_URGENT",
            officeId,
            { visit_id: createdVisitId },
          );
        }
      } catch (err) {
        // FIX: previously swallowed with zero logging — a failure here means
        // reception/admin staff silently never get paged about a VIP
        // conflict that needs urgent reconciliation, with no trace it had
        // happened. Still fail-open, just log it now.
        logger.warn({ err, visitId: createdVisitId, guestId: finalGuestId }, "Failed to send VIP escalation notification to reception/admin");
      }

      if (!isEscalated && slaDeadline) {
        try {
          await enqueueJob(
            QUEUE_NAMES.SLA_ENFORCEMENT,
            "HostSlaCheck",
            { visitId: createdVisitId },
            t,
            { type: "Visit", id: createdVisitId },
          );
        } catch (err) {
          // FIX: previously swallowed with zero logging — a failure here
          // means this visit's host SLA deadline is never enforced, with no
          // trace it had happened. Still fail-open, just log it now.
          logger.warn({ err, visitId: createdVisitId }, "Failed to enqueue HostSlaCheck for SLA enforcement");
        }
      }

      const hydrated = await this.repository.findById(createdVisitId, t);
      return mapVisitToDTO(hydrated ?? newVisit);
    });
  }

  public async rescheduleVisit(
    visitId: number,
    actor: VisitActor,
    payload: { time_slot_id: number; note?: string },
  ) {
    return withTransaction(async (t) => {
      // Lock the row first to serialize against any concurrent mutation of
      // this same visit — see VisitRepository.lockVisitRow.
      await this.repository.lockVisitRow(visitId, t);
      const visit = await this.repository.findById(visitId, t);
      if (!visit) {
        throw new AppError(
          "Visit block missing or deleted",
          ErrorCodes.SYSTEM_NOT_FOUND,
          404,
        );
      }

      await this.scopePolicy.assertActorCanManageVisit(visit as any, actor);
      assertNotTerminalVisitStatus((visit as any).status);
      // FIX: this used to check ONLY "not terminal" — CHECKED_IN and
      // IN_PROGRESS aren't terminal, so a visit could be rescheduled to a
      // brand-new future slot while the guest was already physically
      // checked in. The state machine's own matrix has no RESCHEDULED
      // destination from either status; enforce it the same way
      // processStatusChange already does for the transition-service path.
      assertValidVisitTransition((visit as any).status, VISIT_STATUS_RESCHEDULED);

      const nextSlot = await this.repository.findTimeSlotWithLock(
        payload.time_slot_id,
        t,
      );
      if (
        !nextSlot ||
        (nextSlot as any).is_booked ||
        (nextSlot as any).slot_state === TIMESLOT_STATE_BLOCKED
      ) {
        throw new AppError(
          "Selected replacement slot is not available",
          ErrorCodes.SLOT_LOCKED,
          409,
        );
      }
      assertVisitSlotStartsInFuture(
        nextSlot,
        "Selected replacement slot has already passed",
      );

      const previousSlotId = (visit as any).time_slot_id
        ? Number((visit as any).time_slot_id)
        : null;
      if (previousSlotId && previousSlotId !== Number((nextSlot as any).id)) {
        await this.repository.updateTimeSlot(
          previousSlotId,
          { is_booked: false, slot_state: TIMESLOT_STATE_AVAILABLE },
          t,
        );
      }

      await this.repository.updateTimeSlot(
        Number((nextSlot as any).id),
        { is_booked: true, slot_state: TIMESLOT_STATE_BOOKED },
        t,
      );

      // Calculate actual visit end time based on service duration
      let actualScheduledEnd = (nextSlot as any).end_time;
      const visitServiceId = (visit as any).service_id;
      if (visitServiceId) {
        const serviceRepo = new ServiceRepository();
        const service = await serviceRepo.findById(visitServiceId);
        if (service && (service as any).duration_minutes) {
          const durationMs = (service as any).duration_minutes * 60 * 1000;
          const calculatedEnd = new Date((nextSlot as any).start_time.getTime() + durationMs);
          // Use the calculated end time, but don't exceed the slot's end time boundary
          actualScheduledEnd = calculatedEnd <= (nextSlot as any).end_time ? calculatedEnd : (nextSlot as any).end_time;
        }
      }

      const [, updatedRows] = await this.repository.updateVisit(
        visitId,
        {
          time_slot_id: Number((nextSlot as any).id),
          assigned_host_id: Number((nextSlot as any).host_id),
          scheduled_start: (nextSlot as any).start_time,
          scheduled_end: actualScheduledEnd,
          status: VISIT_STATUS_RESCHEDULED,
          guest_decision_status: VISIT_GUEST_DECISION_PENDING,
          guest_decision_at: null,
        },
        t,
      );

      // If the host changed during reschedule, update assignment history
      const currentHostId = visit.assigned_host_id ?? (visit as any).TimeSlot?.host_id;
      const nextHostId = Number((nextSlot as any).host_id);

      if (currentHostId && Number(currentHostId) !== nextHostId) {
        await VisitAssignment.update(
          { is_current: false },
          {
            where: { visit_id: visitId, is_current: true },
            transaction: t,
          },
        );

        await VisitAssignment.create(
          {
            visit_id: visitId,
            host_id: nextHostId,
            assigned_by_id: actor.id,
            assigned_at: new Date(),
            assignment_reason: payload.note || "Host changed during reschedule",
            is_current: true,
          },
          { transaction: t },
        );
      }

      await logAudit(
        actor.id,
        "VISIT_RESCHEDULED",
        "Visit",
        visitId,
        visit.toJSON(),
        {
          reason: payload.note ?? null,
        },
        t,
      );
      await publishEvent(
        {
          type: EventTypes.VISIT_RESCHEDULED,
          metadata: {
            entity_id: visitId,
            actor_id: actor.id,
            office_id: Number(updatedRows[0].office_id),
            timestamp: new Date(),
          },
        },
        t,
        { type: "Visit", id: visitId },
      );
      await enqueueJob(
        QUEUE_NAMES.EMAIL_NOTIFICATION,
        "VisitRescheduled",
        {
          visitId,
          guestId: updatedRows[0].guest_id,
          hostId: updatedRows[0].assigned_host_id,
          template: "RESCHEDULED",
        },
        t,
      );

      const hydrated = await this.repository.findById(visitId, t);
      return mapVisitToDTO(hydrated ?? updatedRows[0]);
    });
  }

  public async reassignVisit(
    visitId: number,
    actor: VisitActor,
    payload: { host_id: number; time_slot_id?: number; note?: string },
  ) {
    return withTransaction(async (t) => {
      // Lock the row first to serialize against any concurrent mutation of
      // this same visit — see VisitRepository.lockVisitRow.
      await this.repository.lockVisitRow(visitId, t);
      const visit = await this.repository.findById(visitId, t);
      if (!visit) {
        throw new AppError(
          "Visit block missing or deleted",
          ErrorCodes.SYSTEM_NOT_FOUND,
          404,
        );
      }

      await this.scopePolicy.assertActorCanManageVisit(visit as any, actor);
      assertNotTerminalVisitStatus((visit as any).status);

      const nextSlot = payload.time_slot_id
        ? await this.repository.findTimeSlotWithLock(payload.time_slot_id, t)
        : await this.repository.findAvailableSlotForHost(payload.host_id, t);

      if (!nextSlot) {
        throw new AppError(
          "No available slot was found for the selected host",
          ErrorCodes.SYSTEM_NOT_FOUND,
          404,
        );
      }

      if (Number((nextSlot as any).host_id) !== payload.host_id) {
        throw new AppError(
          "Selected slot does not belong to the chosen host",
          ErrorCodes.INVALID_INPUT,
          400,
        );
      }

      if (
        (nextSlot as any).is_booked ||
        (nextSlot as any).slot_state === TIMESLOT_STATE_BLOCKED
      ) {
        throw new AppError(
          "Selected replacement slot is not available",
          ErrorCodes.SLOT_LOCKED,
          409,
        );
      }
      assertVisitSlotStartsInFuture(
        nextSlot,
        "Selected replacement slot has already passed",
      );

      const previousSlotId = (visit as any).time_slot_id
        ? Number((visit as any).time_slot_id)
        : null;
      const nextSlotId = Number((nextSlot as any).id);
      const isTimeslotChanged = previousSlotId !== nextSlotId;

      // FIX: this used to check ONLY "not terminal" (above) — CHECKED_IN and
      // IN_PROGRESS aren't terminal, so a visit could be silently reassigned
      // to a different host while the guest was already on-site. The two
      // possible target statuses aren't equivalent in every source state
      // (e.g. ESCALATED allows REASSIGNED but not REASSIGNED_RESCHEDULED),
      // so validate against whichever one this call will actually apply.
      assertValidVisitTransition(
        (visit as any).status,
        isTimeslotChanged ? VISIT_STATUS_REASSIGNED_RESCHEDULED : VISIT_STATUS_REASSIGNED,
      );

      if (isTimeslotChanged) {
        if (previousSlotId) {
          await this.repository.updateTimeSlot(
            previousSlotId,
            { is_booked: false, slot_state: TIMESLOT_STATE_AVAILABLE },
            t,
          );
        }
        await this.repository.updateTimeSlot(
          nextSlotId,
          { is_booked: true, slot_state: TIMESLOT_STATE_BOOKED },
          t,
        );
      }

      // Track assignment history without swallowing errors (preventing Postgres transaction poisoning)
      await VisitAssignment.update(
        { is_current: false },
        { where: { visit_id: visitId, is_current: true }, transaction: t },
      );
      await VisitAssignment.create(
        {
          visit_id: visitId,
          host_id: payload.host_id,
          assigned_at: new Date(),
          assignment_reason: isTimeslotChanged
            ? "reassigned_and_rescheduled"
            : "reassigned",
          is_current: true,
          assigned_by_id: actor.id,
        },
        { transaction: t },
      );

      // Calculate actual visit end time based on service duration
      let actualScheduledEnd = (nextSlot as any).end_time;
      const visitServiceId = (visit as any).service_id;
      if (visitServiceId) {
        const serviceRepo = new ServiceRepository();
        const service = await serviceRepo.findById(visitServiceId);
        if (service && (service as any).duration_minutes) {
          const durationMs = (service as any).duration_minutes * 60 * 1000;
          const calculatedEnd = new Date((nextSlot as any).start_time.getTime() + durationMs);
          // Use the calculated end time, but don't exceed the slot's end time boundary
          actualScheduledEnd = calculatedEnd <= (nextSlot as any).end_time ? calculatedEnd : (nextSlot as any).end_time;
        }
      }

      const [, updatedRows] = await this.repository.updateVisit(
        visitId,
        {
          assigned_host_id: payload.host_id,
          time_slot_id: nextSlotId,
          scheduled_start: (nextSlot as any).start_time,
          scheduled_end: actualScheduledEnd,
          status: isTimeslotChanged
            ? VISIT_STATUS_REASSIGNED_RESCHEDULED
            : VISIT_STATUS_REASSIGNED,
          escalated_to_reception: false,
          escalated_at: null,
          escalated_by_id: null,
          escalation_reason: null,
          guest_decision_status: isTimeslotChanged
            ? VISIT_GUEST_DECISION_PENDING
            : ((visit as any).guest_decision_status ?? null),
          guest_decision_at: isTimeslotChanged
            ? null
            : ((visit as any).guest_decision_at ?? null),
        },
        t,
      );

      await logAudit(
        actor.id,
        "VISIT_REASSIGNED",
        "Visit",
        visitId,
        visit.toJSON(),
        {
          reason: payload.note ?? null,
        },
        t,
      );
      await publishEvent(
        {
          type: EventTypes.VISIT_REASSIGNED,
          metadata: {
            entity_id: visitId,
            actor_id: actor.id,
            office_id: Number(updatedRows[0].office_id),
            timestamp: new Date(),
          },
        },
        t,
        { type: "Visit", id: visitId },
      );
      await enqueueJob(
        QUEUE_NAMES.EMAIL_NOTIFICATION,
        "VisitReassigned",
        {
          visitId,
          guestId: updatedRows[0].guest_id,
          hostId: updatedRows[0].assigned_host_id,
          template: "REASSIGNED",
        },
        t,
      );

      const hydrated = await this.repository.findById(visitId, t);
      return mapVisitToDTO(hydrated ?? updatedRows[0]);
    });
  }

  public async escalateVisit(
    visitId: number,
    actor: VisitActor,
    payload: { reason?: string; target_host_id?: number },
  ) {
    return withTransaction(async (t) => {
      // Lock the row first to serialize against any concurrent mutation of
      // this same visit — see VisitRepository.lockVisitRow.
      await this.repository.lockVisitRow(visitId, t);
      const visit = await this.repository.findById(visitId, t);
      if (!visit) {
        throw new AppError(
          "Visit block missing or deleted",
          ErrorCodes.SYSTEM_NOT_FOUND,
          404,
        );
      }

      await this.scopePolicy.assertActorCanManageVisit(visit as any, actor);
      assertNotTerminalVisitStatus((visit as any).status);
      // FIX: this used to check ONLY "not terminal" — e.g. RESCHEDULED and
      // CHECKED_IN aren't terminal, but the state machine's own matrix has
      // no ESCALATED destination from either. Enforce it explicitly instead
      // of relying on every other caller to route through
      // processStatusChange (the only path that already did).
      assertValidVisitTransition((visit as any).status, VISIT_STATUS_ESCALATED);

      const updatePayload: any = {
        status: VISIT_STATUS_ESCALATED,
        escalated_to_reception: true,
        escalated_at: new Date(),
        escalated_by_id: actor.id,
        escalation_reason: payload.reason ?? "Needs front-desk intervention",
      };

      if (payload.target_host_id) {
        updatePayload.assigned_host_id = payload.target_host_id;

        // Close previous assignment
        await VisitAssignment.update(
          { is_current: false },
          { where: { visit_id: visitId, is_current: true }, transaction: t },
        );

        // Create new assignment for the target (Super) host
        await VisitAssignment.create(
          {
            visit_id: visitId,
            host_id: payload.target_host_id,
            assigned_at: new Date(),
            assignment_reason: "escalated_to_management",
            is_current: true,
            assigned_by_id: actor.id,
          },
          { transaction: t },
        );
      }

      const [, updatedRows] = await this.repository.updateVisit(
        visitId,
        updatePayload,
        t,
      );

      await logAudit(
        actor.id,
        "VISIT_ESCALATED",
        "Visit",
        visitId,
        visit.toJSON(),
        updatedRows[0].toJSON(),
        t,
      );
      await publishEvent(
        {
          type: EventTypes.VISIT_ESCALATED,
          metadata: {
            entity_id: visitId,
            actor_id: actor.id,
            office_id: Number(updatedRows[0].office_id),
            timestamp: new Date(),
          },
        },
        t,
        { type: "Visit", id: visitId },
      );
      // FIX: this used QUEUE_NAMES.SLA_ESCALATION — a different constant
      // from every sibling "send a templated email" call in this file
      // (create/reschedule/reassign all use EMAIL_NOTIFICATION). Nothing in
      // the codebase registers a BullMQ worker for SLA_ESCALATION (the only
      // SLA-related worker listens on SLA_ENFORCEMENT, a different queue
      // entirely) — every escalation notification silently vanished into a
      // queue nobody drains, 100% of the time this ran, not just under a
      // race.
      await enqueueJob(
        QUEUE_NAMES.EMAIL_NOTIFICATION,
        "SlaEscalated",
        {
          visitId,
          guestId: updatedRows[0].guest_id,
          hostId: updatedRows[0].assigned_host_id,
          template: "ESCALATED",
        },
        t,
      );

      const hydrated = await this.repository.findById(visitId, t);
      return mapVisitToDTO(hydrated ?? updatedRows[0]);
    });
  }

  public async processGuestDecision(
    visitId: number,
    guestId: number,
    decision:
      | typeof VISIT_GUEST_DECISION_ACCEPTED
      | typeof VISIT_GUEST_DECISION_DECLINED,
  ) {
    return withTransaction(async (t) => {
      const visit = await this.repository.findById(visitId, t);
      if (!visit) {
        throw new AppError("Visit not found", ErrorCodes.SYSTEM_NOT_FOUND, 404);
      }

      if (Number((visit as any).guest_id) !== guestId) {
        throw new AppError(
          "You are not the guest for this visit",
          ErrorCodes.AUTH_FORBIDDEN,
          403,
        );
      }

      if (
        (visit as any).guest_decision_status !== VISIT_GUEST_DECISION_PENDING
      ) {
        throw new AppError(
          "No pending decision for this visit",
          ErrorCodes.INVALID_INPUT,
          400,
        );
      }

      if (decision === VISIT_GUEST_DECISION_ACCEPTED) {
        // FIX: this branch used to write status: PENDING directly with no
        // transition check — unlike rescheduleVisit/reassignVisit/
        // escalateVisit, all of which call assertValidVisitTransition before
        // writing status. Enforce the same invariant here so an illegal
        // source state is rejected instead of silently accepted.
        assertValidVisitTransition((visit as any).status, VISIT_STATUS_PENDING);
        // Always a real unique value, in every environment — qr_code has no DB
        // unique constraint and is the sole lookup key for check-in
        // (checkin.service.ts), so a shared placeholder string here would let
        // unrelated visits collide on the same check-in credential.
        const newQr = randomUUID();
        const [, updatedRows] = await this.repository.updateVisit(
          visitId,
          {
            guest_decision_status: VISIT_GUEST_DECISION_ACCEPTED,
            guest_decision_at: new Date(),
            status: VISIT_STATUS_PENDING,
            qr_code: newQr,
          },
          t,
        );

        await logAudit(
          guestId,
          "GUEST_ACCEPT_RESCHEDULE",
          "Visit",
          visitId,
          null,
          { decision: VISIT_GUEST_DECISION_ACCEPTED, newQr },
          t,
        );
        await publishEvent(
          {
            type: EventTypes.VISIT_GUEST_DECISION,
            metadata: {
              entity_id: visitId,
              actor_id: guestId,
              timestamp: new Date(),
            },
          },
          t,
          { type: "Visit", id: visitId },
        );

        const hydrated = await this.repository.findById(visitId, t);
        return mapVisitToDTO(hydrated ?? updatedRows[0]);
      }

      // This branch used to write status: ESCALATED directly with no transition check, unlike rescheduleVisit/reassignVisit/escalateVisit,
      // which all call assertValidVisitTransition first. The check was added here, but the state machine did not allow RESCHEDULED -> ESCALATED,
      // so a guest could never decline a host's reschedule ("Illegal lifecycle transition"). The machine now allows it: declining sends the visit to reception.
      assertValidVisitTransition((visit as any).status, VISIT_STATUS_ESCALATED);

      const receptionDeadline = new Date(Date.now() + 60 * 60 * 1000);
      const [, updatedRows] = await this.repository.updateVisit(
        visitId,
        {
          guest_decision_status: VISIT_GUEST_DECISION_DECLINED,
          guest_decision_at: new Date(),
          status: VISIT_STATUS_ESCALATED,
          escalated_to_reception: true,
          escalated_at: new Date(),
          escalated_by_id: guestId,
          escalation_reason: "Guest declined proposed reschedule/reassignment",
          reception_sla_deadline_at: receptionDeadline,
        },
        t,
      );

      await logAudit(
        guestId,
        "GUEST_DECLINE_RESCHEDULE",
        "Visit",
        visitId,
        null,
        {
          decision: VISIT_GUEST_DECISION_DECLINED,
          reason: "Guest declined proposed reschedule/reassignment",
        },
        t,
      );
      await publishEvent(
        {
          type: EventTypes.VISIT_ESCALATED,
          metadata: {
            entity_id: visitId,
            actor_id: guestId,
            office_id: (visit as any).office_id,
            timestamp: new Date(),
          },
        },
        t,
        { type: "Visit", id: visitId },
      );
      await enqueueJob(
        QUEUE_NAME_CONST.EMAIL_NOTIFICATION,
        "GuestDeclinedReschedule",
        {
          visitId,
          guestId,
          template: "ESCALATED",
        },
        t,
      );

      await enqueueJob(
        QUEUE_NAME_CONST.RECEPTION_SLA_ENFORCEMENT,
        "CheckReceptionResponse",
        { visitId },
        t,
        undefined,
        receptionDeadline,
      );

      // We should ideally send immediate in-app notifications here for the guest.
      const notifService = new NotificationDomainService();
      try {
        await notifService.createNotification(
          guestId,
          "Visit Escalated",
          "Your visit has been escalated to Reception. Please wait up to 1 hour for a new schedule or assignment.",
          "VISIT_ESCALATED",
          { visit_id: visitId },
        );

        // Notify reception staff
        const officeId = (visit as any).office_id;
        if (officeId) {
          const { UserRole } =
            await import("../../infrastructure/database/models/UserRole.js");
          const { Role } =
            await import("../../infrastructure/database/models/Role.js");
          const { User } =
            await import("../../infrastructure/database/models/User.js");

          const receptionStaff = (await UserRole.findAll({
            include: [
              { model: Role, as: "role", where: { name: "reception" } },
              { model: User, as: "user", required: true },
            ],
          })) as any[];

          await Promise.all(
            receptionStaff.map((ur) =>
              notifService
                .createNotification(
                  Number(ur.user_id),
                  "Urgent Action Required: Guest Declined",
                  `Guest declined the proposed schedule for Visit #${visitId}. You have 1 hour to reassign or reschedule.`,
                  "RECEPTION_ACTION_REQUIRED",
                  { visit_id: visitId, office_id: officeId },
                )
                .catch(() => {}),
            ),
          );
        }
      } catch (err) {
        // Ignore notification errors
      }

      const hydrated = await this.repository.findById(visitId, t);
      return mapVisitToDTO(hydrated ?? updatedRows[0]);
    });
  }

  public async submitFeedback(
    visitId: number,
    guestId: number,
    rating: number,
    comment?: string,
  ) {
    return withTransaction(async (t) => {
      const visit = await this.repository.findById(visitId, t);
      if (!visit)
        throw new AppError("Visit not found", ErrorCodes.SYSTEM_NOT_FOUND, 404);
      if (Number((visit as any).guest_id) !== guestId)
        throw new AppError("Forbidden", ErrorCodes.AUTH_FORBIDDEN, 403);
      if ((visit as any).status !== "COMPLETED")
        throw new AppError(
          "Visit must be completed to submit feedback",
          ErrorCodes.INVALID_INPUT,
          400,
        );

      await this.repository.updateVisit(
        visitId,
        { rating, rating_comment: comment },
        t,
      );
      await logAudit(guestId, "FEEDBACK_SUBMITTED", "Visit", visitId, null, {
        rating,
        comment,
      }, t);
      return { success: true };
    });
  }

  public async archiveVisit(id: number) {
    return this.repository.softDelete(id);
  }

  public async restoreVisit(id: number) {
    return this.repository.restore(id);
  }

  /**
   * Extends the duration of an active visit.
   *
   * This is a critical operational junction:
   * 1. It validates that the guest is actually on site (CHECKED_IN or
   *    IN_PROGRESS). Until 2026-09-04 this step was described here but never
   *    implemented — see the note at the check itself.
   * 2. It performs 'Resource Conflict Detection' to check if the host is booked for a future visit
   *    that overlaps with the new extension window.
   * 3. It updates the DB state and emits an ESCALATION if a conflict is found.
   * 4. HARDWARE SYNC: It propagates the new end-time to the physical UniFi door controller
   *    via the CredentialService to prevent guest lockouts.
   */
  public async extendVisit(
    visitId: number,
    actor: VisitActor,
    newEndTime: Date,
  ) {
    return withTransaction(async (t) => {
      const visit = await this.repository.findById(visitId, t);
      if (!visit)
        throw new AppError("Visit not found", ErrorCodes.SYSTEM_NOT_FOUND, 404);

      await this.scopePolicy.assertActorCanManageVisit(visit as any, actor);

      /**
       * The status check the doc comment above has always claimed to perform.
       *
       * It did not exist. `POST /visits/:id/extend` succeeded against a visit
       * in ANY status — including COMPLETED, CANCELLED, DECLINED, EXPIRED and
       * NO_SHOW. That is not merely an odd no-op: when the extension window
       * overlaps another booking the code below flips the visit to ESCALATED,
       * so extending a visit that ended last month silently reopened it,
       * putting a terminal record back into reception's active queue with a
       * door credential re-synced to a future end time.
       *
       * Extending is only meaningful while somebody is actually on site, which
       * is what CHECKED_IN and IN_PROGRESS mean. APPROVED is deliberately
       * excluded — a visit that has not started yet should be rescheduled, not
       * extended.
       */
      const extendableStatuses = new Set(["CHECKED_IN", "IN_PROGRESS"]);
      const currentStatus = String((visit as any).status);
      if (!extendableStatuses.has(currentStatus)) {
        throw new AppError(
          `A visit can only be extended while the guest is on site. This one is ${currentStatus}.`,
          ErrorCodes.INVALID_INPUT,
          400,
        );
      }

      const oldEndTime = (visit as any).scheduled_end;
      const originalEnd = (visit as any).original_scheduled_end ?? oldEndTime;

      // Check for conflicts
      const hostId = (visit as any).assigned_host_id;
      const conflicts = await this.repository.findOverlappingVisits(
        hostId,
        oldEndTime,
        newEndTime,
        t,
      );

      const hasConflicts = conflicts.some((v: any) => v.id !== visitId);

      await this.repository.updateVisit(
        visitId,
        {
          scheduled_end: newEndTime,
          is_extended: true,
          original_scheduled_end: originalEnd,
          ...(hasConflicts
            ? {
                status: VISIT_STATUS_ESCALATED,
                escalated_to_reception: true,
                escalated_at: new Date(),
                escalation_reason: `Visit extension caused scheduling conflicts with ${conflicts.length} other visits.`,
              }
            : {}),
        },
        t,
      );

      await logAudit(
        actor.id,
        "VISIT_EXTENDED",
        "Visit",
        visitId,
        { oldEndTime },
        { newEndTime, hasConflicts },
        t,
      );

      if (hasConflicts) {
        await publishEvent(
          {
            type: EventTypes.VISIT_ESCALATED,
            metadata: {
              entity_id: visitId,
              actor_id: actor.id,
              office_id: (visit as any).office_id,
              timestamp: new Date(),
              after: { reason: "extension_conflict" },
            },
          },
          t,
        );
      }

      const hydrated = await this.repository.findById(visitId, t);
      
      // Synchronize credential validity if active
      try {
        const { CredentialService } = await import("../credentials/credential.service.js");
        const credService = new CredentialService();
        await credService.updateCredentialValidity(visitId, newEndTime);
      } catch (error) {
        // Log but don't fail the visit extension if credential sync fails
        const { logger } = await import("../../core/logger/logger.js");
        logger.warn({ error, visitId }, "Failed to sync credential validity during visit extension");
      }

      return mapVisitToDTO(hydrated ?? visit);
    });
  }

  public async regenerateQR(visitId: number, actor: VisitActor) {
    return withTransaction(async (t) => {
      const visit = await this.repository.findById(visitId, t);
      if (!visit) {
        throw new AppError("Visit not found", ErrorCodes.SYSTEM_NOT_FOUND, 404);
      }

      await this.scopePolicy.assertActorCanManageVisit(visit as any, actor);

      // Always a real unique value — see the matching comment on the
      // guest-decision-accepted path above for why this can never be a
      // shared placeholder string.
      const newQrCode = randomUUID();
      const [, updatedRows] = await this.repository.updateVisit(
        visitId,
        { qr_code: newQrCode },
        t,
      );

      await logAudit(
        actor.id,
        "VISIT_QR_REGENERATED",
        "Visit",
        visitId,
        { old_qr: (visit as any).qr_code },
        { new_qr: newQrCode },
        t,
      );

      // Push change to physical access system - this will trigger the actual notification once ready
      await enqueueJob(
        QUEUE_NAMES.ACCESS_PROVISIONING,
        "ProvisionVisitCredential",
        {
          visitId,
          actorId: actor.id,
        },
        t,
        { type: "Visit", id: visitId },
      );

      return mapVisitToDTO(updatedRows[0] ?? visit);
    });
  }
}

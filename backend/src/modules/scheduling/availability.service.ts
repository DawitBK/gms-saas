import { Op } from "sequelize";
import { AppError } from "../../core/errors/AppError";
import { ErrorCodes } from "../../core/errors/errorCodes";
import { VISIT_POLICY } from "../../config/visit-policy.config";
import {
  isAdminRole,
  isHostRole,
  isReceptionRole,
  isSuperAdmin,
  isSuperHost,
  isSuperReception,
  normalizeRoles,
} from "../../shared/auth/roles";
import { requireActorOfficeId as requireAssignedOfficeId } from "../../shared/auth/scope-resolver";
import { AvailabilityRepository } from "./availability.repository";

type AvailabilityActor = { id: number; roles?: string[]; office_id?: number };

/**
 * AvailabilityService
 * 
 * Orchestrates time slot generation and schedule management for hosts.
 * Core Logic:
 * - Materializes recurring availability rules into concrete time slots.
 * - Manages slot states (AVAILABLE, BOOKED, BLOCKED).
 * - Enforces complex scoping rules (e.g., staff vs host board views).
 * - Handles timezone-aware date calculations for global office operations.
 */
export class AvailabilityService {
  private repository: AvailabilityRepository;

  constructor() {
    this.repository = new AvailabilityRepository();
  }

  public async getAvailableTimeSlots(opts: {
    officeId?: number;
    serviceId?: number;
    departmentId?: number;
    date?: string;
    hostId?: number;
  }) {
    const { officeId, serviceId, departmentId, date, hostId } = opts;

    let deptId: number | undefined;
    let serviceRecord: any = null;
    if (serviceId) {
      serviceRecord = await this.repository.findServiceById(serviceId);
      if (serviceRecord) {
        deptId = Number((serviceRecord as any).department_id);
      }
    } else if (departmentId) {
      deptId = departmentId;
    }

    const hostWhere: any = { active: true };

    const serviceHostIds = Array.isArray(serviceRecord?.host_ids)
      ? serviceRecord.host_ids.map((id: any) => Number(id)).filter(Boolean)
      : [];
    if (serviceHostIds.length > 0) {
      hostWhere.id = { [Op.in]: serviceHostIds };
    } else {
      if (deptId) hostWhere.department_id = deptId;
      if (officeId) hostWhere.office_id = officeId;
    }

    if (hostId) {
      hostWhere.id = hostId;
    }

    const hosts = await this.repository.findHosts(hostWhere);
    const hostIds = hosts.map((h) => Number((h as any).id)).filter(Boolean);

    const slotWhere: any = {
      is_booked: false,
      slot_state: "AVAILABLE",
    };

    // If we resolved explicit hosts (usually from a service's `host_ids`),
    // prefer returning slots for those hosts regardless of the selected office.
    // This allows admin-assigned, cross-office hosts to surface their availability
    // when a guest selects a service that targets them. If there are no
    // resolved hosts, fall back to restricting slots to the requested office
    // (and host-managed null-office slots).
    if (hostIds.length > 0) {
      slotWhere.host_id = { [Op.in]: hostIds };
    } else {
      if (officeId) {
        slotWhere.office_id = { [Op.or]: [officeId, null] };
      }
    }

    const startTimeWhere: any = {
      [Op.gte]: new Date(),
    };
    if (date) {
      const normalizedDate = String(date).slice(0, 10);
      const start = new Date(`${normalizedDate}T00:00:00.000Z`);
      const end = new Date(`${normalizedDate}T23:59:59.999Z`);
      startTimeWhere[Op.between] = [start, end];
    }
    slotWhere.start_time = startTimeWhere;

    const slots = await this.repository.findAvailableSlots(slotWhere);

    const hostMap = new Map(hosts.map((host: any) => [Number(host.id), host]));

    // FIX: this used to be `slots.filter((slot) => slot.host_id === host.id)`
    // inside the `hosts.map()` below — an O(H×S) re-scan of the full `slots`
    // array once per host. Build a single-pass count-by-host Map up front
    // instead (mirroring the group-by pattern `listVisibleOtherHosts` below
    // already uses, but counting directly since only the count is needed
    // here), then just look each host up in O(1).
    const slotCountsByHost = slots.reduce<Map<number, number>>(
      (acc, slot: any) => {
        const hostId = Number(slot.host_id);
        acc.set(hostId, (acc.get(hostId) ?? 0) + 1);
        return acc;
      },
      new Map(),
    );

    return {
      service: serviceRecord
        ? {
            id: Number(serviceRecord.id),
            name: serviceRecord.name,
            department_id: serviceRecord.department_id
              ? Number(serviceRecord.department_id)
              : null,
            office_id: serviceRecord.office_id
              ? Number(serviceRecord.office_id)
              : null,
          }
        : null,
      department_id: deptId ?? null,
      hosts: hosts.map((host: any) => ({
        id: Number(host.id),
        user_id: Number(host.user_id),
        department_id: host.department_id ? Number(host.department_id) : null,
        office_id: host.office_id ? Number(host.office_id) : null,
        name: host.user?.full_name ?? "Unnamed host",
        email: host.user?.email ?? null,
        available_slots_count: slotCountsByHost.get(Number(host.id)) ?? 0,
      })),
      slots: slots.map((slot: any) => {
        const owner = hostMap.get(Number(slot.host_id)) ?? slot.Host;
        return {
          id: Number(slot.id),
          host_id: Number(slot.host_id),
          office_id: slot.office_id ? Number(slot.office_id) : null,
          availability_rule_id: slot.availability_rule_id
            ? Number(slot.availability_rule_id)
            : null,
          start_time: slot.start_time,
          end_time: slot.end_time,
          is_booked: Boolean(slot.is_booked),
          slot_state: slot.slot_state,
          host: owner
            ? {
                id: Number(owner.id),
                user_id: Number(owner.user_id),
                name: owner.user?.full_name ?? null,
                email: owner.user?.email ?? null,
                department_id: owner.department_id
                  ? Number(owner.department_id)
                  : null,
                office_id: owner.office_id ? Number(owner.office_id) : null,
              }
            : null,
        };
      }),
    };
  }

  public async getHostAvailabilityBoard(
    actor: AvailabilityActor,
    hostId?: number,
    startDate?: string,
    endDate?: string,
  ) {
    const targetHostId = await this.resolveBoardHostId(actor, hostId);
    const { rangeStart, rangeEnd } = this.resolveBoardRange(startDate, endDate);

    let host, rules, slots;
    try {
      [host, rules, slots] = await Promise.all([
        targetHostId ? this.repository.findHostById(targetHostId) : Promise.resolve(null),
        targetHostId ? this.repository.findRulesByHost(targetHostId) : Promise.resolve([]),
        targetHostId ? this.repository.findSlotsByHostAndRange(targetHostId, rangeStart, rangeEnd) : Promise.resolve([]),
      ]);
    } catch (error: any) {
      throw new AppError(
        `Host board retrieval failed: ${error.message}`,
        ErrorCodes.SYSTEM_INTERNAL_ERROR,
        500,
      );
    }

    if (targetHostId && !host) {
      throw new AppError(
        "Target host profile not found",
        ErrorCodes.SYSTEM_NOT_FOUND,
        404,
      );
    }

    return {
      host: host ? {
        id: Number((host as any).id),
        user_id: Number((host as any).user_id),
        name: (host as any).user?.full_name ?? (host as any).name ?? "Host",
        email: (host as any).user?.email ?? (host as any).email ?? null,
        office_id: (host as any).office_id
          ? Number((host as any).office_id)
          : null,
        department_id: (host as any).department_id
          ? Number((host as any).department_id)
          : null,
      } : null,
      range: {
        start: rangeStart.toISOString(),
        end: rangeEnd.toISOString(),
      },
      rules: (rules || []).map((rule: any) => ({
        id: Number(rule.id),
        host_id: Number(rule.host_id),
        office_id: rule.office_id ? Number(rule.office_id) : null,
        recurrence_type: rule.recurrence_type,
        day_of_week: rule.day_of_week,
        day_of_month: rule.day_of_month,
        specific_date: rule.specific_date,
        start_time: rule.start_time,
        end_time: rule.end_time,
        is_available: Boolean(rule.is_available),
        label: rule.label ?? null,
        notes: rule.notes ?? null,
      })),
      slots: (slots || []).map((slot: any) => ({
        id: Number(slot.id),
        host_id: Number(slot.host_id),
        availability_rule_id: slot.availability_rule_id
          ? Number(slot.availability_rule_id)
          : null,
        start_time: slot.start_time,
        end_time: slot.end_time,
        is_booked: Boolean(slot.is_booked),
        slot_state: slot.slot_state,
      })),
      other_hosts: await this.listVisibleOtherHosts(
        actor,
        targetHostId || 0,
        rangeStart,
        rangeEnd,
      ),
    };
  }

  public async createAvailabilityRule(actor: AvailabilityActor, payload: any) {
    const targetHostId = await this.resolveManagedHostId(
      actor,
      payload.host_id,
    );
    this.validatePatternPayload(payload);

    const host = await this.requireHostById(targetHostId);
    const officeId = payload.office_id ?? (host as any).office_id ?? null;
    const officeTimezone = await this.resolveOfficeTimezone(officeId);

    this.validateTimeWindow(payload.start_time, payload.end_time);
    this.validateRuleEffectiveWindow(payload, officeTimezone);

    const recurrenceType = payload.recurrence_type;
    const dayOfWeek =
      recurrenceType === "WEEKLY" ? Number(payload.day_of_week) : 0;
    const dayOfMonth =
      recurrenceType === "MONTHLY" ? Number(payload.day_of_month) : null;
    const specificDate =
      recurrenceType === "DATE_OVERRIDE" ? String(payload.specific_date) : null;

    const rule = await this.repository.createRule({
      host_id: targetHostId,
      office_id: officeId,
      recurrence_type: recurrenceType,
      day_of_week: dayOfWeek,
      day_of_month: dayOfMonth,
      specific_date: specificDate,
      start_time: this.normalizeTime(payload.start_time),
      end_time: this.normalizeTime(payload.end_time),
      is_available: payload.is_available ?? true,
      label: payload.label ?? null,
      notes: payload.notes ?? null,
    });

    await this.materializeRuleSlots(rule, payload.horizon_days ?? 45);
    return this.getHostAvailabilityBoard(actor, targetHostId);
  }

  public async updateAvailabilityRule(
    actor: AvailabilityActor,
    ruleId: number,
    payload: any,
  ) {
    const rule = await this.repository.findRuleById(ruleId);
    if (!rule) {
      throw new AppError(
        "Availability rule was not found",
        ErrorCodes.SYSTEM_NOT_FOUND,
        404,
      );
    }

    const targetHostId = await this.resolveManagedHostId(
      actor,
      Number((rule as any).host_id),
    );
    if (targetHostId !== Number((rule as any).host_id)) {
      throw new AppError(
        "Availability rule is outside your scope",
        ErrorCodes.AUTH_FORBIDDEN,
        403,
      );
    }

    const nextPayload = { ...(rule as any).toJSON(), ...payload };
    this.validatePatternPayload(nextPayload);
    const officeTimezone = await this.resolveOfficeTimezone(
      payload.office_id ?? (rule as any).office_id ?? null,
    );

    if (payload.start_time || payload.end_time) {
      this.validateTimeWindow(
        payload.start_time ?? (rule as any).start_time,
        payload.end_time ?? (rule as any).end_time,
      );
    }
    this.validateRuleEffectiveWindow(nextPayload, officeTimezone);

    const finalType = payload.recurrence_type ?? (rule as any).recurrence_type;
    const finalDayOfWeek =
      finalType === "WEEKLY"
        ? Number(payload.day_of_week ?? (rule as any).day_of_week)
        : 0;
    const finalDayOfMonth =
      finalType === "MONTHLY"
        ? Number(payload.day_of_month ?? (rule as any).day_of_month)
        : null;
    const finalSpecificDate =
      finalType === "DATE_OVERRIDE"
        ? String(payload.specific_date ?? (rule as any).specific_date)
        : null;

    await rule.update({
      recurrence_type: finalType,
      day_of_week: finalDayOfWeek,
      day_of_month: finalDayOfMonth,
      specific_date: finalSpecificDate,
      start_time: payload.start_time
        ? this.normalizeTime(payload.start_time)
        : (rule as any).start_time,
      end_time: payload.end_time
        ? this.normalizeTime(payload.end_time)
        : (rule as any).end_time,
      is_available: payload.is_available ?? (rule as any).is_available,
      label: payload.label ?? (rule as any).label ?? null,
      notes: payload.notes ?? (rule as any).notes ?? null,
      office_id: payload.office_id ?? (rule as any).office_id ?? null,
    });

    await this.repository.deleteFutureUnbookedSlotsForRule(ruleId);

    await this.materializeRuleSlots(rule, payload.horizon_days ?? 45);
    return this.getHostAvailabilityBoard(actor, targetHostId);
  }

  public async deleteAvailabilityRule(
    actor: AvailabilityActor,
    ruleId: number,
  ) {
    const rule = await this.repository.findRuleById(ruleId);
    if (!rule) {
      throw new AppError(
        "Availability rule was not found",
        ErrorCodes.SYSTEM_NOT_FOUND,
        404,
      );
    }

    // Strict lock: Only the host themselves can delete their recurring rules
    const roles = normalizeRoles(actor.roles ?? []);
    if (!roles.some(isHostRole) && !isSuperAdmin(roles)) {
      throw new AppError(
        "Only the host who owns this board can delete rules",
        ErrorCodes.AUTH_FORBIDDEN,
        403,
      );
    }

    const hostProfile = await this.repository.findHostByUserId(actor.id);
    const myHostId = Number((hostProfile as any)?.id ?? 0);

    if (Number((rule as any).host_id) !== myHostId && !isSuperAdmin(roles)) {
      throw new AppError(
        "You can only manage rules on your own board",
        ErrorCodes.AUTH_FORBIDDEN,
        403,
      );
    }

    const targetHostId = Number((rule as any).host_id);

    await this.repository.deleteFutureUnbookedSlotsForRule(ruleId);
    await this.repository.deleteRule(rule);
    return this.getHostAvailabilityBoard(actor, targetHostId);
  }

  public async deleteTimeSlot(actor: AvailabilityActor, slotId: number) {
    const slot = await this.repository.findSlotById(slotId);
    if (!slot) {
      throw new AppError("Time slot not found", ErrorCodes.SYSTEM_NOT_FOUND, 404);
    }

    // Strict permissions: Same as rules, only host-owner can prune slots
    const roles = normalizeRoles(actor.roles ?? []);
    const myHostId = isSuperAdmin(roles)
      ? null
      : Number(((await this.repository.findHostByUserId(actor.id)) as any)?.id ?? 0);

    if (myHostId !== null && Number((slot as any).host_id) !== myHostId) {
      throw new AppError(
        "Only the host can delete individual slots from their schedule",
        ErrorCodes.AUTH_FORBIDDEN,
        403,
      );
    }

    // Check if slot has an active visit (not just slot_state BOOKED)
    const activeVisit = await this.repository.findActiveVisitsForSlot(slotId);
    if (activeVisit) {
      const terminalStatuses = ['COMPLETED', 'CANCELLED', 'DECLINED', 'EXPIRED', 'NO_SHOW'];
      const isTerminal = terminalStatuses.includes((activeVisit as any).status);
      
      if (!isTerminal) {
        throw new AppError(
          JSON.stringify({
            code: 'SLOT_HAS_ACTIVE_VISIT',
            message: 'This time slot has an active visit. You must reassign, reschedule, or escalate the visit before removing this slot.',
            visit_id: (activeVisit as any).id,
            visit_status: (activeVisit as any).status,
            actions_required: ['REASSIGN', 'RESCHEDULE', 'ESCALATE', 'REASSIGN_AND_RESCHEDULE'],
          }),
          ErrorCodes.SLOT_HAS_ACTIVE_VISIT,
          409,
        );
      }
    }

    if ((slot as any).is_booked || (slot as any).slot_state === "BOOKED") {
      throw new AppError(
        "Cannot delete a booked time slot. Please reschedule or decline the visit first to release the slot.",
        ErrorCodes.SLOT_LOCKED,
        409,
      );
    }

    const targetHostId = Number((slot as any).host_id);
    await this.repository.deleteSlot(slot);

    return this.getHostAvailabilityBoard(actor, targetHostId);
  }

  private async resolveManagedHostId(
    actor: AvailabilityActor,
    explicitHostId?: number,
  ) {
    const roles = normalizeRoles(actor.roles ?? []);

    // Strict Permission: Only Hosts can manages rules/slots.
    // Staff (Admin/Reception) can view boards via getHostAvailabilityBoard but cannot use write operations.
    if (roles.some(isHostRole)) {
      // super_host has no personal host record — require explicit host_id
      if (isSuperHost(roles)) {
        if (!explicitHostId) {
          throw new AppError(
            "super_host must provide host_id to manage availability",
            ErrorCodes.INVALID_INPUT,
            400,
          );
        }
        return Number(explicitHostId);
      }

      const hostProfile = await this.repository.findHostByUserId(actor.id);
      const myHostId = Number((hostProfile as any)?.id ?? 0);

      if (!hostProfile) {
        throw new AppError(
          "No host profile is linked to this user",
          ErrorCodes.SYSTEM_NOT_FOUND,
          404,
        );
      }

      if (
        explicitHostId &&
        Number(explicitHostId) !== myHostId &&
        !isSuperAdmin(roles)
      ) {
        throw new AppError(
          "You can only manage your own availability",
          ErrorCodes.AUTH_FORBIDDEN,
          403,
        );
      }

      return myHostId;
    }

    // Allow Super Admin escape hatch for emergency overrides if needed, but otherwise restricted
    if (isSuperAdmin(roles) && explicitHostId) {
      return Number(explicitHostId);
    }

    throw new AppError(
      "Only hosts can manage availability rules and slots. Staff may only view the schedule board.",
      ErrorCodes.AUTH_FORBIDDEN,
      403,
    );
  }

  private validatePatternPayload(payload: any) {
    const recurrenceType = payload.recurrence_type;
    if (
      recurrenceType === "WEEKLY" &&
      (payload.day_of_week === undefined || payload.day_of_week === null)
    ) {
      throw new AppError(
        "Weekly availability requires day_of_week",
        ErrorCodes.INVALID_INPUT,
        400,
      );
    }
    if (
      recurrenceType === "MONTHLY" &&
      (payload.day_of_month === undefined || payload.day_of_month === null)
    ) {
      throw new AppError(
        "Monthly availability requires day_of_month",
        ErrorCodes.INVALID_INPUT,
        400,
      );
    }
    if (recurrenceType === "DATE_OVERRIDE" && !payload.specific_date) {
      throw new AppError(
        "Date override availability requires specific_date",
        ErrorCodes.INVALID_INPUT,
        400,
      );
    }
  }

  private validateTimeWindow(startTime: string, endTime: string) {
    const normalizedStart = this.normalizeTime(startTime);
    const normalizedEnd = this.normalizeTime(endTime);

    if (
      !/^[0-2]\d:[0-5]\d(:[0-5]\d)?$/.test(normalizedStart) ||
      !/^[0-2]\d:[0-5]\d(:[0-5]\d)?$/.test(normalizedEnd)
    ) {
      throw new AppError(
        "Start and end times must be in HH:MM or HH:MM:SS format",
        ErrorCodes.INVALID_INPUT,
        400,
      );
    }

    const [sH, sM, sS] = normalizedStart.split(":").map(Number);
    const [eH, eM, eS] = normalizedEnd.split(":").map(Number);
    const start = sH * 3600 + sM * 60 + sS;
    const end = eH * 3600 + eM * 60 + eS;

    if (start === end) {
      throw new AppError(
        "Start and end times must not be equal",
        ErrorCodes.INVALID_INPUT,
        400,
      );
    }

    if (start > end) {
      throw new AppError(
        "Start time must be before end time",
        ErrorCodes.INVALID_INPUT,
        400,
      );
    }
  }

  private validateRuleEffectiveWindow(payload: any, officeTimezone: string) {
    if (payload.recurrence_type !== "DATE_OVERRIDE") {
      return;
    }

    const specificDate = String(payload.specific_date ?? "").slice(0, 10);
    if (!specificDate) {
      return;
    }

    const currentDateKey = this.getDateKeyInTimezone(
      new Date(),
      officeTimezone,
    );
    if (specificDate < currentDateKey) {
      throw new AppError(
        "Date override availability cannot be created in the past",
        ErrorCodes.INVALID_INPUT,
        400,
      );
    }

    if (specificDate === currentDateKey) {
      const currentSeconds = this.getTimeSecondsInTimezone(
        new Date(),
        officeTimezone,
      );
      const endSeconds = this.timeToSeconds(
        this.normalizeTime(payload.end_time),
      );
      if (endSeconds <= currentSeconds) {
        throw new AppError(
          "Date override availability must end in the future for the selected office timezone",
          ErrorCodes.INVALID_INPUT,
          400,
        );
      }
    }
  }

  private normalizeTime(value: string) {
    return value.length === 5 ? `${value}:00` : value;
  }

  private resolveBoardRange(startDate?: string, endDate?: string) {
    const cleanStart =
      typeof startDate === "string"
        ? startDate.slice(0, 10)
        : new Date().toISOString().slice(0, 10);
    const cleanEnd =
      typeof endDate === "string" ? endDate.slice(0, 10) : undefined;

    const rangeStart = new Date(`${cleanStart}T00:00:00.000Z`);
    if (Number.isNaN(rangeStart.getTime())) {
      rangeStart.setTime(new Date().setUTCHours(0, 0, 0, 0));
    }
    rangeStart.setUTCHours(0, 0, 0, 0);

    const rangeEnd = cleanEnd
      ? new Date(`${cleanEnd}T23:59:59.999Z`)
      : new Date(rangeStart.getTime() + 6 * 24 * 60 * 60 * 1000);

    if (Number.isNaN(rangeEnd.getTime())) {
      rangeEnd.setTime(rangeStart.getTime() + 6 * 24 * 60 * 60 * 1000);
    }

    return { rangeStart, rangeEnd };
  }

  private async resolveBoardHostId(
    actor: AvailabilityActor,
    explicitHostId?: number,
  ) {
    const roles = normalizeRoles(actor.roles ?? []);

    if (explicitHostId) {
      const targetHostId = Number(explicitHostId);
      await this.assertActorCanViewHost(actor, targetHostId);
      return targetHostId;
    }

    if (roles.some(isHostRole)) {
      const hostProfile = await this.repository.findHostByUserId(actor.id);
      if (!hostProfile) {
        throw new AppError(
          "No host profile is linked to this user",
          ErrorCodes.SYSTEM_NOT_FOUND,
          404,
        );
      }
      return Number((hostProfile as any).id);
    }

    // Admins and receptionists can load the board without a primary host (to see the staff list)
    return null;
  }

  private async assertActorCanViewHost(
    actor: AvailabilityActor,
    hostId: number,
  ) {
    const roles = normalizeRoles(actor.roles ?? []);

    if (isSuperAdmin(roles) || isSuperReception(roles) || isSuperHost(roles)) {
      return;
    }

    if (roles.some((role) => isAdminRole(role) || isReceptionRole(role))) {
      await this.assertActorCanViewHostForStaff(actor, hostId);
      return;
    }

    if (roles.some(isHostRole)) {
      const officeId = await this.requireActorOfficeId(actor);
      const host = await this.repository.findHostById(hostId);
      if (Number((host as any)?.office_id ?? 0) !== officeId) {
        throw new AppError(
          "That host is outside your office scope",
          ErrorCodes.AUTH_FORBIDDEN,
          403,
        );
      }
      return;
    }

    throw new AppError(
      "You do not have permission to view this availability board",
      ErrorCodes.AUTH_FORBIDDEN,
      403,
    );
  }

  private async requireActorOfficeId(actor: AvailabilityActor) {
    if (actor.office_id) {
      return requireAssignedOfficeId(actor);
    }

    const hostProfile = await this.repository.findHostByUserId(actor.id);
    const officeId = Number((hostProfile as any)?.office_id ?? 0);
    if (!officeId) {
      throw new AppError(
        "Office-scoped access requires an office assignment",
        ErrorCodes.AUTH_FORBIDDEN,
        403,
      );
    }

    return officeId;
  }

  private async assertActorCanViewHostForStaff(
    actor: AvailabilityActor,
    hostId: number,
  ) {
    const roles = normalizeRoles(actor.roles ?? []);
    const targetHost = await this.repository.findHostById(hostId);

    if (isSuperAdmin(roles) || isSuperReception(roles)) {
      return;
    }

    const officeId = await this.requireActorOfficeId(actor);
    if (Number((targetHost as any)?.office_id ?? 0) !== officeId) {
      throw new AppError(
        "That host is outside your office scope",
        ErrorCodes.AUTH_FORBIDDEN,
        403,
      );
    }
  }

  /**
   * Loads a host by ID with a not-found guard.
   */
  private async requireHostById(hostId: number) {
    const host = await this.repository.findHostById(hostId);
    if (!host) {
      throw new AppError(
        "Target host profile not found",
        ErrorCodes.SYSTEM_NOT_FOUND,
        404,
      );
    }
    return host;
  }

  private async listVisibleOtherHosts(
    actor: AvailabilityActor,
    primaryHostId: number,
    rangeStart: Date,
    rangeEnd: Date,
  ) {
    const roles = normalizeRoles(actor.roles ?? []);
    const officeId =
      !(isSuperAdmin(roles) || isSuperReception(roles) || isSuperHost(roles))
        ? await this.requireActorOfficeId(actor)
        : null;
    const hosts = await this.repository.findOfficeScopedHosts(
      officeId,
      officeId === null,
    );

    const filteredHosts = hosts.filter(
      (host: any) => Number(host.id) !== primaryHostId,
    );
    const hostIds = filteredHosts
      .map((host: any) => Number(host.id))
      .filter(Boolean);
    if (hostIds.length === 0) {
      return [];
    }

    const slots = await this.repository.findSlotsByHostIdsAndRange(
      hostIds,
      rangeStart,
      rangeEnd,
    );

    const slotsByHost = slots.reduce<Record<number, any[]>>(
      (acc, slot: any) => {
        const hostId = Number(slot.host_id);
        acc[hostId] = [...(acc[hostId] ?? []), slot];
        return acc;
      },
      {},
    );

    return filteredHosts.map((host: any) => ({
      id: Number(host.id),
      user_id: Number(host.user_id),
      name: host.user?.full_name ?? "Host",
      email: host.user?.email ?? null,
      office_id: host.office_id ? Number(host.office_id) : null,
      department_id: host.department_id ? Number(host.department_id) : null,
      available_slots_count: (slotsByHost[Number(host.id)] ?? []).filter(
        (slot) => slot.slot_state === "AVAILABLE" && !slot.is_booked,
      ).length,
      slots: (slotsByHost[Number(host.id)] ?? []).map((slot: any) => ({
        id: Number(slot.id),
        host_id: Number(slot.host_id),
        availability_rule_id: slot.availability_rule_id
          ? Number(slot.availability_rule_id)
          : null,
        start_time: slot.start_time,
        end_time: slot.end_time,
        is_booked: Boolean(slot.is_booked),
        slot_state: slot.slot_state,
      })),
    }));
  }

  private async materializeRuleSlots(rule: any, horizonDays: number) {
    const { DEFAULT_SLOT_DURATION_MINUTES } = VISIT_POLICY;
    
    // Resolve service duration if this availability rule has an associated service context
    // Rules themselves don't have service_id, but hosts can be assigned to services
    // For now, we'll use the default duration and let service-specific booking handle precise timing
    // In future enhancement, we could fetch all services for this host and create separate slots per service
    const slotDurationMinutes = DEFAULT_SLOT_DURATION_MINUTES;
    
    const officeTimezone = await this.resolveOfficeTimezone(
      rule.office_id ?? null,
    );
    const todayKey = this.getDateKeyInTimezone(new Date(), officeTimezone);
    const now = new Date();

    for (let offset = 0; offset <= horizonDays; offset += 1) {
      const dateKey = this.addDaysToDateKey(todayKey, offset);
      if (!this.ruleMatchesDateKey(rule, dateKey)) {
        continue;
      }

      const windowStart = this.combineDateAndTime(
        dateKey,
        rule.start_time,
        officeTimezone,
      );
      const windowEnd = this.combineDateAndTime(
        dateKey,
        rule.end_time,
        officeTimezone,
      );
      if (windowEnd.getTime() <= now.getTime()) {
        continue;
      }

      const slotState = rule.is_available ? "AVAILABLE" : "BLOCKED";
      const slotDurationMs = slotDurationMinutes * 60 * 1000;

      // Generate fixed-duration sub-slots within the availability window
      for (
        let slotStart = new Date(windowStart.getTime());
        slotStart.getTime() + slotDurationMs <= windowEnd.getTime();
        slotStart = new Date(slotStart.getTime() + slotDurationMs)
      ) {
        const slotEnd = new Date(slotStart.getTime() + slotDurationMs);
        if (
          slotStart.getTime() <= now.getTime() ||
          slotEnd.getTime() <= now.getTime()
        ) {
          continue;
        }

        const existing = await this.repository.findSlotByHostWindow(
          rule.host_id,
          slotStart,
          slotEnd,
        );

        if (existing) {
          if (!(existing as any).is_booked) {
            await this.repository.updateSlot(existing, {
              availability_rule_id: rule.id,
              slot_state: slotState,
              is_booked: false,
            });
          }
          continue;
        }

        await this.repository.createSlot({
          host_id: rule.host_id,
          office_id: rule.office_id ?? null,
          availability_rule_id: rule.id,
          start_time: slotStart,
          end_time: slotEnd,
          is_booked: false,
          slot_state: slotState,
        });
      }
    }
  }

  private ruleMatchesDateKey(rule: any, dateKey: string) {
    const date = new Date(`${dateKey}T00:00:00.000Z`);
    switch (rule.recurrence_type) {
      case "DAILY":
        return true;
      case "WEEKLY":
        return date.getUTCDay() === Number(rule.day_of_week);
      case "MONTHLY":
        return date.getUTCDate() === Number(rule.day_of_month);
      case "DATE_OVERRIDE": {
        if (!rule.specific_date) return false;
        const normalizedSpecific = String(rule.specific_date).slice(0, 10);
        const ruleDate = new Date(`${normalizedSpecific}T00:00:00Z`);
        return (
          date.getUTCFullYear() === ruleDate.getUTCFullYear() &&
          date.getUTCMonth() === ruleDate.getUTCMonth() &&
          date.getUTCDate() === ruleDate.getUTCDate()
        );
      }
      default:
        return false;
    }
  }

  private combineDateAndTime(dateKey: string, time: string, timeZone: string) {
    const [year, month, day] = dateKey.split("-").map(Number);
    const [hours, minutes, seconds] = this.normalizeTime(time)
      .split(":")
      .map(Number);
    const assumedUtc = new Date(
      Date.UTC(year, month - 1, day, hours, minutes, seconds),
    );
    const offsetMinutes = this.getTimeZoneOffsetMinutes(timeZone, assumedUtc);
    return new Date(assumedUtc.getTime() - offsetMinutes * 60 * 1000);
  }

  private async resolveOfficeTimezone(officeId?: number | null) {
    if (!officeId) {
      return "UTC";
    }

    return this.repository.findOfficeTimezone(Number(officeId));
  }

  private addDaysToDateKey(dateKey: string, days: number) {
    const seed = new Date(`${dateKey}T00:00:00.000Z`);
    seed.setUTCDate(seed.getUTCDate() + days);
    return seed.toISOString().slice(0, 10);
  }

  private getDateKeyInTimezone(date: Date, timeZone: string) {
    const parts = this.getZonedParts(date, timeZone);
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  private getTimeSecondsInTimezone(date: Date, timeZone: string) {
    const parts = this.getZonedParts(date, timeZone);
    return (
      Number(parts.hour) * 3600 +
      Number(parts.minute) * 60 +
      Number(parts.second)
    );
  }

  private timeToSeconds(time: string) {
    const [hours, minutes, seconds] = time.split(":").map(Number);
    return hours * 3600 + minutes * 60 + seconds;
  }

  private getZonedParts(date: Date, timeZone: string) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });

    const parts = formatter.formatToParts(date);
    const pick = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? "00";

    return {
      year: pick("year"),
      month: pick("month"),
      day: pick("day"),
      hour: pick("hour"),
      minute: pick("minute"),
      second: pick("second"),
    };
  }

  private getTimeZoneOffsetMinutes(timeZone: string, date: Date) {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
    });
    const tzName = formatter
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value;

    if (!tzName || tzName === "GMT") {
      return 0;
    }

    const match = tzName.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);
    if (!match) {
      return 0;
    }

    const [, sign, hours, minutes] = match;
    const total = Number(hours) * 60 + Number(minutes ?? "0");
    return sign === "-" ? -total : total;
  }
}

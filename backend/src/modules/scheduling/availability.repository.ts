import { Op } from "sequelize";
import {
  Host,
  Office,
  RecurringAvailability,
  Service,
  TimeSlot,
  User,
  Visit,
} from "../../infrastructure/database/models";
import { NON_OCCUPYING_VISIT_STATUSES } from "../visits/visit-statuses";

export class AvailabilityRepository {
  public async findServiceById(serviceId: number) {
    return Service.findByPk(serviceId);
  }

  public async findHosts(where: Record<string, unknown>) {
    return Host.findAll({
      where,
      include: [{ model: User, as: "user", required: false }],
      attributes: ["id", "user_id", "department_id", "office_id", "active"],
    });
  }

  public async findAvailableSlots(where: Record<string, unknown>) {
    return TimeSlot.findAll({
      where: {
        ...where,
        "$visits.id$": null,
      },
      order: [["start_time", "ASC"]],
      include: [
        {
          model: Host,
          required: false,
          include: [{ model: User, as: "user", required: false }],
        },
        {
          model: Visit,
          as: "visits",
          required: false,
          attributes: ["id"],
          where: {
            status: { [Op.notIn]: [...NON_OCCUPYING_VISIT_STATUSES] },
            deleted_at: null,
          },
        },
      ],
      subQuery: false,
    });
  }

  public async findRulesByHost(hostId: number) {
    return RecurringAvailability.findAll({
      where: { host_id: hostId },
      order: [["created_at", "DESC"]],
    });
  }

  public async findSlotsByHostAndRange(
    hostId: number,
    rangeStart: Date,
    rangeEnd: Date,
  ) {
    return TimeSlot.findAll({
      where: {
        host_id: hostId,
        start_time: { [Op.between]: [rangeStart, rangeEnd] },
      },
      order: [["start_time", "ASC"]],
    });
  }

  public async createRule(payload: Record<string, unknown>) {
    return RecurringAvailability.create(payload);
  }

  public async findRuleById(ruleId: number) {
    return RecurringAvailability.findByPk(ruleId);
  }

  public async deleteFutureUnbookedSlotsForRule(ruleId: number) {
    return TimeSlot.destroy({
      where: {
        availability_rule_id: ruleId,
        is_booked: false,
        start_time: { [Op.gte]: new Date() },
      },
    });
  }

  public async deleteRule(rule: RecurringAvailability) {
    return rule.destroy();
  }

  public async findSlotById(slotId: number) {
    return TimeSlot.findByPk(slotId);
  }

  public async deleteSlot(slot: TimeSlot) {
    return slot.destroy();
  }

  public async findOfficeTimezone(officeId: number) {
    const office = await Office.findByPk(officeId, { attributes: ["timezone"] });
    return (office as any)?.timezone || "UTC";
  }

  public async findSlotByHostWindow(hostId: number, startTime: Date, endTime: Date) {
    return TimeSlot.findOne({
      where: {
        host_id: hostId,
        start_time: startTime,
        end_time: endTime,
      },
    });
  }

  public async createSlot(payload: Record<string, unknown>) {
    return TimeSlot.create(payload);
  }

  public async updateSlot(slot: TimeSlot, payload: Record<string, unknown>) {
    return slot.update(payload);
  }

  public async findOfficeScopedHosts(
    officeId: number | null | undefined,
    includeAll = false,
  ) {
    const where: Record<string, unknown> = { active: true };
    if (!includeAll && officeId) {
      where.office_id = officeId;
    }

    return Host.findAll({
      where,
      include: [{ model: User, as: "user", required: false }],
      order: [
        ["office_id", "ASC"],
        ["id", "ASC"],
      ],
    });
  }

  public async findSlotsByHostIdsAndRange(hostIds: number[], rangeStart: Date, rangeEnd: Date) {
    if (hostIds.length === 0) {
      return [];
    }

    return TimeSlot.findAll({
      where: {
        host_id: { [Op.in]: hostIds },
        start_time: { [Op.between]: [rangeStart, rangeEnd] },
      },
      order: [["start_time", "ASC"]],
    });
  }

  /**
   * Resolve a host record by primary key.
   * Used internally for scope checks and office resolution.
   */
  public async findHostById(hostId: number) {
    return Host.findByPk(hostId, {
      include: [{ model: User, as: "user", required: false }],
      attributes: ["id", "user_id", "department_id", "office_id", "active"],
    });
  }

  /**
   * Resolve a host record by user_id.
   * Used to map an authenticated user to their host profile.
   */
  public async findHostByUserId(userId: number) {
    return Host.findOne({
      where: { user_id: userId },
      include: [{ model: User, as: "user", required: false }],
      attributes: ["id", "user_id", "department_id", "office_id", "active"],
    });
  }

  /**
   * Find active visits associated with a time slot.
   * Used to prevent deletion of slots with active visits.
   */
  public async findActiveVisitsForSlot(slotId: number) {
    return Visit.findOne({
      where: {
        time_slot_id: slotId,
        status: {
          [Op.notIn]: [...NON_OCCUPYING_VISIT_STATUSES],
        },
        deleted_at: null,
      },
      attributes: ['id', 'status', 'reference_number'],
    });
  }
}

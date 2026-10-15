import { fn, col, Op, Transaction } from "sequelize";
import {
  Host,
  Service,
  TimeSlot,
  User,
  Visit,
  VisitAssignment,
} from "../../infrastructure/database/models";
import { NON_OCCUPYING_VISIT_STATUSES } from "./visit-statuses";
import { TIMESLOT_STATE_AVAILABLE } from "../../core/status/status-catalog";

export class HostAssignmentRepository {
  public async findRequestedSlotNoLock(timeSlotId: number) {
    return TimeSlot.findOne({
      where: { id: timeSlotId },
    });
  }

  public async findAndLockAvailableSlotsBatch(
    eligibleHostIds: number[],
    slotStartTime: Date,
    slotEndTime: Date,
    transaction: Transaction,
  ) {
    return TimeSlot.findAll({
      where: {
        host_id: { [Op.in]: eligibleHostIds },
        start_time: slotStartTime,
        end_time: slotEndTime,
        is_booked: false,
        slot_state: TIMESLOT_STATE_AVAILABLE,
      },
      transaction,
      lock: Transaction.LOCK.UPDATE,
      order: [["id", "ASC"]],
      include: [
        {
          model: Host,
          required: true,
          include: [{ model: User, as: "user", required: true }],
        },
      ],
    });
  }

  public async findService(serviceId: number | null | undefined) {
    if (!serviceId) {
      return null;
    }
    return Service.findByPk(serviceId);
  }

  public async findEligibleHosts(hostWhere: Record<string, unknown>) {
    return Host.findAll({ where: hostWhere, attributes: ["id"] });
  }

  /**
   * Batched replacement for a per-host `countActiveVisitsForHost` loop — one
   * grouped COUNT for every candidate host instead of one query per host
   * (this runs inside a transaction that also holds row locks, so the old
   * N+1 shape extended lock hold time too, not just query count).
   */
  public async countActiveVisitsForHosts(
    hostIds: number[],
    transaction: Transaction,
  ): Promise<Record<number, number>> {
    const result: Record<number, number> = {};
    for (const hId of hostIds) result[hId] = 0;
    if (hostIds.length === 0) return result;

    const rows = (await Visit.findAll({
      attributes: ["assigned_host_id", [fn("COUNT", col("id")), "count"]],
      where: {
        assigned_host_id: { [Op.in]: hostIds },
        status: { [Op.notIn]: [...NON_OCCUPYING_VISIT_STATUSES] },
      },
      group: ["assigned_host_id"],
      transaction,
      raw: true,
    })) as unknown as Array<{ assigned_host_id: number; count: string }>;

    for (const row of rows) {
      result[Number(row.assigned_host_id)] = Number(row.count);
    }
    return result;
  }

  /**
   * Batched replacement for a per-host `findLastCurrentAssignment` loop —
   * one query ordered DESC across every candidate host, reduced to "the
   * first row seen per host_id" (safe because the query is globally
   * ordered DESC, so the first occurrence per host is that host's most
   * recent current assignment).
   */
  public async findLastCurrentAssignmentsForHosts(
    hostIds: number[],
    transaction: Transaction,
  ): Promise<Record<number, Date | null>> {
    const result: Record<number, Date | null> = {};
    for (const hId of hostIds) result[hId] = null;
    if (hostIds.length === 0) return result;

    const rows = await VisitAssignment.findAll({
      where: { host_id: { [Op.in]: hostIds }, is_current: true },
      order: [["assigned_at", "DESC"]],
      transaction,
    });

    for (const row of rows as unknown as Array<{ host_id: number; assigned_at: Date }>) {
      const hostId = Number(row.host_id);
      if (result[hostId] === null) {
        result[hostId] = row.assigned_at;
      }
    }
    return result;
  }
}

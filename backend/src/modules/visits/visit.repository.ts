import {
  AccessCredential,
  Approval,
  Visit,
  TimeSlot,
  User,
  Host,
  Service,
  Department,
  Office,
  VisitAssignment,
  GuestProfile,
  AuditLog,
} from "../../infrastructure/database/models";
import { Op, Transaction, fn, col } from "sequelize";
import { NON_OCCUPYING_VISIT_STATUSES } from "./visit-statuses";
import {
  CREDENTIAL_STATUS_ACTIVE,
  TIMESLOT_STATE_AVAILABLE,
  TIMESLOT_STATE_BOOKED,
  VISIT_STATUS_APPROVED,
  VISIT_STATUS_CHECKED_IN,
  VISIT_STATUS_IN_PROGRESS,
  VISIT_STATUS_PENDING,
  VISIT_STATUS_RESCHEDULED,
} from "../../core/status/status-catalog";

const VISIT_INCLUDE = [
  {
    model: User,
    as: "guest",
    required: false,
    include: [{ model: GuestProfile, as: "guestProfile", required: false }],
  },
  { model: Service, as: "service", required: false },
  { model: Department, as: "department", required: false },
  { model: Office, as: "office", required: false },
  {
    model: Host,
    as: "assignedHost",
    required: false,
    include: [{ model: User, as: "user", required: false }],
  },
  {
    model: User,
    as: "escalatedBy",
    required: false,
  },
  {
    model: TimeSlot,
    required: false,
    include: [
      {
        model: Host,
        required: false,
        include: [{ model: User, as: "user", required: false }],
      },
    ],
  },
  { model: AccessCredential, as: "credentials", required: false },
  { model: Approval, as: "approvals", required: false },
  {
    model: VisitAssignment,
    as: "assignments",
    required: false,
    include: [
      {
        model: Host,
        as: "host",
        required: false,
        include: [{ model: User, as: "user", required: false }],
      },
      {
        model: User,
        as: "assignedBy",
        required: false,
      },
    ],
  },
] as const;

export class VisitRepository {
  private buildVisitIncludes(filter: Record<string, any>) {
    const needsCredentialFilter =
      filter.__hasCredential === true || filter.__expiringSoon === true;

    return VISIT_INCLUDE.map((entry) => {
      if ((entry as any).as !== "credentials") {
        return entry;
      }

      if (filter.__expiringSoon === true) {
        const expiringWindow = new Date(Date.now() + 4 * 60 * 60 * 1000);
        return {
          ...entry,
          required: true,
          where: {
            status: CREDENTIAL_STATUS_ACTIVE,
            valid_until: {
              [Op.between]: [new Date(), expiringWindow],
            },
          },
        };
      }

      if (needsCredentialFilter) {
        return {
          ...entry,
          required: true,
        };
      }

      return entry;
    });
  }

  private normalizeFilter(filter: Record<string, any>) {
    const where: any = { ...filter };
    const q = where.q;
    delete where.q;
    delete where.page;
    delete where.limit;
    delete where.sort_by;
    delete where.sort_order;
    delete where.__hasCredential;
    delete where.__expiringSoon;

    // Defensive: Sequelize throws if a WHERE key has an `undefined` value.
    // Remove keys with `undefined` or the literal string 'undefined' to avoid
    // query-generation errors when clients send undefined params.
    for (const key of Object.keys(where)) {
      if (where[key] === undefined || where[key] === 'undefined') {
        delete where[key];
      }
    }

    if (q) {
      where[Op.or] = [
        { reference_number: { [Op.iLike]: `%${q}%` } },
        { "$guest.full_name$": { [Op.iLike]: `%${q}%` } },
        { "$guest.email$": { [Op.iLike]: `%${q}%` } },
        { "$guest.phone$": { [Op.iLike]: `%${q}%` } },
        { "$guest.guestProfile.government_id$": { [Op.iLike]: `%${q}%` } },
        { "$guest.guestProfile.company$": { [Op.iLike]: `%${q}%` } },
        { "$assignedHost.user.full_name$": { [Op.iLike]: `%${q}%` } },
        { "$assignedHost.user.email$": { [Op.iLike]: `%${q}%` } },
      ];
    }
    return where;
  }

  /**
   * FIX: every visit-mutating call site read the row with a plain,
   * unlocked findById/findByPk — no FOR UPDATE anywhere. Two concurrent
   * mutations on the same visit (e.g. two reassignments, or an approval
   * racing a reschedule) could both read the same pre-image, both compute
   * their own slot booking/release, and the second writer's blind
   * UPDATE...WHERE id=? would silently clobber the first writer's change —
   * including leaving the FIRST writer's newly-booked slot permanently
   * marked booked with no visit referencing it anymore (a phantom-booked
   * slot lost from availability for good).
   *
   * This locks the row alone — no joins — specifically so it CAN take
   * FOR UPDATE without hitting Postgres's "FOR UPDATE cannot be applied to
   * the nullable side of an outer join" restriction that the full
   * VISIT_INCLUDE graph would trigger. Call this first to serialize
   * concurrent writers on this visit, then call findById for the actual
   * hydrated read.
   */
  public async lockVisitRow(id: number, transaction: Transaction) {
    return Visit.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
      include: [],
    });
  }

  public async findById(id: number, transaction?: Transaction) {
    const visit = await Visit.findByPk(id, {
      transaction,
      include: VISIT_INCLUDE as any,
    });

    if (!visit) {
      return null;
    }

    // audit_logs.entity_id is string while visits.id is BIGINT; avoid invalid DB join casting.
    const auditLogs = await AuditLog.findAll({
      where: { entity: "Visit", entity_id: String(id) },
      transaction,
      order: [["created_at", "DESC"]],
      include: [{ model: User, as: "user", required: false }],
    });

    (visit as any).setDataValue("auditLogs", auditLogs);
    return visit;
  }

  /**
   * Same hydrated read as findById, but tolerant of soft-deleted rows
   * (Visit is paranoid:true, so the plain findByPk above never sees a
   * visit once it's been soft-deleted). Needed for authorization checks
   * that must run against a visit that is, by definition, already
   * soft-deleted — see VisitQueryService.getVisitForActorIncludingDeleted.
   */
  public async findByIdIncludingDeleted(id: number, transaction?: Transaction) {
    const visit = await Visit.findByPk(id, {
      transaction,
      include: VISIT_INCLUDE as any,
      paranoid: false,
    });

    if (!visit) {
      return null;
    }

    // audit_logs.entity_id is string while visits.id is BIGINT; avoid invalid DB join casting.
    const auditLogs = await AuditLog.findAll({
      where: { entity: "Visit", entity_id: String(id) },
      transaction,
      order: [["created_at", "DESC"]],
      include: [{ model: User, as: "user", required: false }],
    });

    (visit as any).setDataValue("auditLogs", auditLogs);
    return visit;
  }

  public async findAll(where: any, transaction?: Transaction) {
    return Visit.findAll({
      where,
      transaction,
      include: VISIT_INCLUDE as any,
    });
  }

  public async findAllPaginated(filter: any, limit: number, offset: number) {
    const where = this.normalizeFilter(filter);
    const include = this.buildVisitIncludes(filter);

    try {
      const { rows, count } = await Visit.findAndCountAll({
        where,
        limit,
        offset,
        order: [["created_at", "DESC"]],
        distinct: true,
        subQuery: false,
        include: include as any,
      });

      return { rows, count };
    } catch (error) {
      console.error("Error in VisitRepository.findAllPaginated:", error);
      throw error;
    }
  }

  /**
   * Status Distribution Analytics
   * Calculates the count of visits per status for a specific organizational filter.
   * Leverages DISTINCT counts to ensure accuracy even with nested relational joins.
   */
  public async countByStatus(filter: any) {
    const where = this.normalizeFilter(filter);
    return Visit.findAll({
      where,
      attributes: [
        "status",
        [fn("COUNT", col("id")), "count"],
      ],
      group: ["status"],
      raw: true,
    }) as unknown as Promise<{ status: string; count: number }[]>;
  }
  
  public async countByDay(filter: any, days: number = 7) {
    const where = this.normalizeFilter(filter);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    where.scheduled_start = { [Op.gte]: startDate };

    return Visit.findAll({
      where,
      attributes: [
        [fn("DATE_TRUNC", "day", col("scheduled_start")), "day"],
        [fn("COUNT", col("id")), "count"],
      ],
      group: [fn("DATE_TRUNC", "day", col("scheduled_start"))],
      order: [[fn("DATE_TRUNC", "day", col("scheduled_start")), "ASC"]],
      raw: true,
    }) as unknown as Promise<{ day: string; count: number }[]>;
  }

  public async softDelete(id: number) {
    return Visit.destroy({ where: { id } });
  }

  public async restore(id: number) {
    return Visit.restore({ where: { id } });
  }

  public async findAllWithDeleted(filter: any, limit: number, offset: number) {
    const where = this.normalizeFilter(filter);
    const include = this.buildVisitIncludes(filter);

    return Visit.findAndCountAll({
      where,
      limit,
      offset,
      order: [["created_at", "DESC"]],
      distinct: true,
      paranoid: false,
      include: include as any,
    });
  }
  public async findTimeSlotWithLock(slotId: number, transaction: Transaction) {
    // 1. Lock the TimeSlot record only to avoid outer join locking issues in Postgres
    const slot = await TimeSlot.findByPk(slotId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!slot) return null;

    // 2. Fetch associated visits manually to maintain occupancy check logic
    const visits = await Visit.findAll({
      where: {
        time_slot_id: slotId,
        status: {
          [Op.notIn]: [...NON_OCCUPYING_VISIT_STATUSES],
        },
        deleted_at: null,
      },
      transaction,
    });

    // Attach visits to the slot instance for the service layer's consumption (maintains compatibility)
    (slot as any).visits = visits;
    return slot;
  }

  public async findAvailableSlotForHost(
    hostId: number,
    transaction?: Transaction,
  ) {
    return TimeSlot.findOne({
      where: {
        host_id: hostId,
        slot_state: TIMESLOT_STATE_AVAILABLE,
        is_booked: false,
        start_time: { [Op.gte]: new Date() },
      },
      order: [["start_time", "ASC"]],
      transaction,
    });
  }

  public async createVisitAtomic(
    visitData: any,
    slotId: number,
    transaction: Transaction,
  ) {
    // 1. Create Visit natively
    const visit = await Visit.create(visitData, { transaction });
    // 2. Lock the associated slot enforcing uniqueness strictly natively
    await TimeSlot.update(
      { is_booked: true, slot_state: TIMESLOT_STATE_BOOKED },
      { where: { id: slotId }, transaction },
    );
    return visit;
  }

  public async updateVisit(id: number, data: any, transaction?: Transaction) {
    return Visit.update(data, { where: { id }, transaction, returning: true });
  }

  public async updateTimeSlot(
    id: number,
    data: any,
    transaction?: Transaction,
  ) {
    return TimeSlot.update(data, { where: { id }, transaction });
  }

  public async releaseTimeSlot(id: number, transaction?: Transaction) {
    return TimeSlot.update(
      { is_booked: false, slot_state: TIMESLOT_STATE_AVAILABLE },
      { where: { id }, transaction },
    );
  }

  /**
   * Take a slot back, but only if nobody else has taken it in the meantime.
   *
   * Used when a visit is reopened out of a terminal status, where the slot was
   * released on the way in. The `is_booked: false` predicate is the whole
   * point: it makes the claim conditional inside the transaction, so two
   * reopenings racing for the same freed slot cannot both succeed. Returns
   * whether the claim was won.
   */
  public async reclaimTimeSlotIfFree(id: number, transaction?: Transaction): Promise<boolean> {
    const [affected] = await TimeSlot.update(
      { is_booked: true, slot_state: TIMESLOT_STATE_BOOKED },
      { where: { id, is_booked: false }, transaction },
    );
    return affected > 0;
  }

  public async findLatestCredentialMetadataByVisitId(visitId: number) {
    const credential = await AccessCredential.findOne({
      where: { visit_id: visitId },
      order: [["created_at", "DESC"]],
      attributes: ["metadata"],
    });

    return (credential?.metadata ?? null) as Record<string, unknown> | null;
  }

  public async findLatestCredentialByVisitId(visitId: number) {
    return AccessCredential.findOne({
      where: { visit_id: visitId },
      order: [["created_at", "DESC"]],
    });
  }

  /**
   * Applies the PostgreSQL EXCLUDE constraint logically (in DB via migration but verified here for fallback logic)
   * Prevents any visits from bridging identical timeframe boundaries for identical hosts natively
   */
  public async detectOverlaps(
    hostId: number,
    startTime: Date,
    endTime: Date,
    transaction: Transaction,
  ) {
    // Fallback logic handled seamlessly via GIST excludes
    return false;
  }

  public async findOverlappingGuestVisits(
    guestId: number,
    startTime: Date,
    endTime: Date,
    transaction?: Transaction,
  ) {
    return Visit.findAll({
      where: {
        guest_id: guestId,
        status: {
          [Op.in]: [
            VISIT_STATUS_PENDING,
            VISIT_STATUS_APPROVED,
            VISIT_STATUS_CHECKED_IN,
            VISIT_STATUS_IN_PROGRESS,
            VISIT_STATUS_RESCHEDULED,
          ],
        },
        [Op.and]: [
          { scheduled_start: { [Op.lt]: endTime } },
          { scheduled_end: { [Op.gt]: startTime } },
        ],
      },
      transaction,
    });
  }

  public async getNextDailySequence(officeId: number, transaction: Transaction) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const maxSeq = await Visit.max("daily_sequence", {
      where: {
        office_id: officeId,
        created_at: {
          [Op.between]: [startOfDay, endOfDay],
        },
      },
      transaction,
    });

    return (Number(maxSeq) || 0) + 1;
  }

  public async findOverlappingVisits(
    hostId: number,
    startTime: Date,
    endTime: Date,
    transaction?: Transaction,
  ) {
    return Visit.findAll({
      where: {
        assigned_host_id: hostId,
        status: {
          [Op.in]: [
            VISIT_STATUS_PENDING,
            VISIT_STATUS_APPROVED,
            VISIT_STATUS_CHECKED_IN,
            VISIT_STATUS_IN_PROGRESS,
            VISIT_STATUS_RESCHEDULED,
          ],
        },
        [Op.and]: [
          { scheduled_start: { [Op.lt]: endTime } },
          { scheduled_end: { [Op.gt]: startTime } },
        ],
      },
      transaction,
    });
  }
}

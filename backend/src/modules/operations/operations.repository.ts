import { Op, QueryTypes, literal } from "sequelize";
import { logger } from "../../core/logger/logger";
import {
  AccessCredential,
  Approval,
  AuditLog,
  Department,
  ExternalWebhookEvent,
  GuestProfile,
  Host,
  Office,
  OutboxEvent,
  Service,
  TimeSlot,
  User,
  Visit,
  VisitAssignment,
} from "../../infrastructure/database/models";
import {
  APPROVAL_DECISION_APPROVED,
  CREDENTIAL_STATUS_ACTIVE,
  CREDENTIAL_STATUS_FAILED,
  OUTBOX_STATUS_DEAD_LETTER,
  OUTBOX_STATUS_FAILED,
  VISIT_STATUS_APPROVED,
  VISIT_STATUS_CANCELLED,
  VISIT_STATUS_CHECKED_IN,
  VISIT_STATUS_DECLINED,
  VISIT_STATUS_EXPIRED,
  VISIT_STATUS_IN_PROGRESS,
  VISIT_STATUS_PENDING,
  WEBHOOK_STATUS_FAILED,
} from "../../core/status/status-catalog";

export class OperationsRepository {
  public async getDashboardStats(
    officeId: number | undefined,
    startOfDay: Date,
    endOfDay: Date,
    nowDate: Date,
    expiringWindow: Date,
  ) {
    const [stats] = (await Visit.sequelize!.query(
      `
      SELECT
        (SELECT COUNT(*)::int FROM guest_profiles gp
          WHERE (:officeId::int IS NULL OR EXISTS (
            SELECT 1 FROM visits v_scope
            WHERE v_scope.guest_id = gp.user_id
              AND v_scope.office_id = :officeId::int
              AND v_scope.deleted_at IS NULL
          ))) AS total_guests,
        (SELECT COUNT(*)::int FROM guest_profiles gp
          WHERE gp.is_vip = true
            AND (:officeId::int IS NULL OR EXISTS (
              SELECT 1 FROM visits v_scope
              WHERE v_scope.guest_id = gp.user_id
                AND v_scope.office_id = :officeId::int
                AND v_scope.deleted_at IS NULL
            ))) AS vip_guests,
        COUNT(DISTINCT v.guest_id) FILTER (
          WHERE (
            (v.status = 'APPROVED' AND v.scheduled_end >= :nowDate)
            OR v.status IN ('CHECKED_IN', 'IN_PROGRESS')
          )
        )::int AS active_guests,
        COUNT(*) FILTER (WHERE v.status = 'PENDING')::int AS pending_approvals,
        COUNT(*) FILTER (
          WHERE v.scheduled_start BETWEEN :startOfDay AND :endOfDay
            AND v.status NOT IN ('CANCELLED', 'DECLINED', 'EXPIRED')
        )::int AS entries_today,
        (SELECT COUNT(*)::int
          FROM access_credentials ac
          JOIN visits cv ON cv.id = ac.visit_id
          WHERE ac.status = 'ACTIVE'
            AND ac.valid_until >= :nowDate
            AND cv.deleted_at IS NULL
            AND (:officeId::int IS NULL OR cv.office_id = :officeId::int)
        ) AS active_credentials,
        COUNT(*) FILTER (
          WHERE v.status = 'DECLINED'
            AND v.updated_at BETWEEN :startOfDay AND :endOfDay
        )::int AS declined_today,
        COUNT(*) FILTER (
          WHERE v.status = 'PENDING'
            AND v.scheduled_start < :nowDate
        )::int AS overdue_pending,
        (SELECT COUNT(*)::int
          FROM access_credentials ac
          JOIN visits cv ON cv.id = ac.visit_id
          WHERE ac.status = 'ACTIVE'
            AND ac.valid_until BETWEEN :nowDate AND :expiringWindow
            AND cv.deleted_at IS NULL
            AND (:officeId::int IS NULL OR cv.office_id = :officeId::int)
        ) AS expiring_soon,
        COUNT(*) FILTER (WHERE v.status = 'DECLINED')::int AS declined_total,
        COUNT(*) FILTER (WHERE v.status = 'EXPIRED')::int AS expired_total,
        COUNT(*)::int AS total_visits,
        (SELECT COUNT(*)::int FROM (
          SELECT fv.guest_id
          FROM visits fv
          WHERE fv.deleted_at IS NULL
            AND (:officeId::int IS NULL OR fv.office_id = :officeId::int)
          GROUP BY fv.guest_id
          HAVING COUNT(*) > 5
        ) frequent_guests) AS frequent_guests,
        COUNT(DISTINCT v.guest_id) FILTER (
          WHERE v.status IN ('APPROVED', 'CHECKED_IN', 'IN_PROGRESS')
            OR v.scheduled_start > NOW()
        )::int AS active_visitors
      FROM visits v
      WHERE v.deleted_at IS NULL
        AND (:officeId::int IS NULL OR v.office_id = :officeId::int)
      `,
      {
        replacements: {
          officeId: officeId ?? null,
          startOfDay,
          endOfDay,
          nowDate,
          expiringWindow,
        },
        type: QueryTypes.SELECT,
      },
    )) as any[];

    return {
      totalGuests: Number(stats?.total_guests ?? 0),
      vipGuests: Number(stats?.vip_guests ?? 0),
      activeGuests: Number(stats?.active_guests ?? 0),
      pendingApprovals: Number(stats?.pending_approvals ?? 0),
      entriesToday: Number(stats?.entries_today ?? 0),
      activeCredentials: Number(stats?.active_credentials ?? 0),
      declinedToday: Number(stats?.declined_today ?? 0),
      overduePending: Number(stats?.overdue_pending ?? 0),
      expiringSoon: Number(stats?.expiring_soon ?? 0),
      declinedTotal: Number(stats?.declined_total ?? 0),
      expiredTotal: Number(stats?.expired_total ?? 0),
      totalVisits: Number(stats?.total_visits ?? 0),
      frequentGuests: Number(stats?.frequent_guests ?? 0),
      activeVisitors: Number(stats?.active_visitors ?? 0),
    };
  }

  public async countGuestProfiles(officeId?: number) {
    if (!officeId) {
      return GuestProfile.count();
    }

    // A guest belongs to an office if they have at least one visit record in that office
    const query = `
      SELECT COUNT(DISTINCT guest_id) as count 
      FROM visits 
      WHERE office_id = :officeId 
      AND deleted_at IS NULL
    `;
    const results = await Visit.sequelize!.query(query, {
      replacements: { officeId },
      type: QueryTypes.SELECT,
    });
    return Number((results[0] as any)?.count ?? 0);
  }

  public async countVipGuests(officeId?: number) {
    if (!officeId) {
      return GuestProfile.count({ where: { is_vip: true } });
    }

    return Visit.count({
      distinct: true,
      col: "guest_id",
      where: { office_id: officeId },
      include: [
        {
          model: User,
          as: "guest",
          required: true,
          include: [
            {
              model: GuestProfile,
              as: "guestProfile",
              required: true,
              where: { is_vip: true },
            },
          ],
        },
      ],
    });
  }

  public async countActiveGuests(officeId?: number, nowDate = new Date()) {
    // APPROVED with future end (waiting), OR CHECKED_IN/IN_PROGRESS (physically present regardless of time)
    return Visit.count({
      distinct: true,
      col: "guest_id",
      where: {
        ...(officeId ? { office_id: officeId } : {}),
        [Op.or]: [
          {
            status: VISIT_STATUS_APPROVED,
            scheduled_end: { [Op.gte]: nowDate },
          },
          {
            status: { [Op.in]: [VISIT_STATUS_CHECKED_IN, VISIT_STATUS_IN_PROGRESS] },
          },
        ],
      },
    });
  }

  public async countPendingApprovals(officeId?: number) {
    return Visit.count({
      where: {
        ...(officeId ? { office_id: officeId } : {}),
        status: VISIT_STATUS_PENDING,
      },
    });
  }

  public async countEntriesToday(
    officeId: number | undefined,
    start: Date,
    end: Date,
  ) {
    return Visit.count({
      where: {
        ...(officeId ? { office_id: officeId } : {}),
        scheduled_start: { [Op.between]: [start, end] },
        status: {
          [Op.notIn]: [
            VISIT_STATUS_CANCELLED,
            VISIT_STATUS_DECLINED,
            VISIT_STATUS_EXPIRED,
          ],
        },
      },
    });
  }

  public async countActiveCredentials(officeId?: number, nowDate = new Date()) {
    return AccessCredential.count({
      where: {
        status: CREDENTIAL_STATUS_ACTIVE,
        valid_until: { [Op.gte]: nowDate },
      },
      include: officeId
        ? [{ model: Visit, required: true, where: { office_id: officeId } }]
        : [{ model: Visit, required: true }],
    });
  }

  public async countDeclinedToday(
    officeId: number | undefined,
    start: Date,
    end: Date,
  ) {
    return Visit.count({
      where: {
        ...(officeId ? { office_id: officeId } : {}),
        status: VISIT_STATUS_DECLINED,
        updated_at: { [Op.between]: [start, end] },
      },
    });
  }

  public async countOverduePending(officeId?: number, nowDate = new Date()) {
    return Visit.count({
      where: {
        ...(officeId ? { office_id: officeId } : {}),
        status: VISIT_STATUS_PENDING,
        scheduled_start: { [Op.lt]: nowDate },
      },
    });
  }

  public async countDeclinedTotal(officeId?: number) {
    return Visit.count({
      where: {
        ...(officeId ? { office_id: officeId } : {}),
        status: VISIT_STATUS_DECLINED,
      },
    });
  }

  public async countExpiredTotal(officeId?: number) {
    return Visit.count({
      where: {
        ...(officeId ? { office_id: officeId } : {}),
        status: VISIT_STATUS_EXPIRED,
      },
    });
  }

  public async countTotalVisits(officeId?: number) {
    return Visit.count({
      where: officeId ? { office_id: officeId } : {},
    });
  }

  public async countFrequentGuests(officeId?: number, threshold = 5) {
    const query = `
      SELECT COUNT(*) as count FROM (
        SELECT guest_id 
        FROM visits 
        ${officeId ? 'WHERE office_id = :officeId' : ''}
        GROUP BY guest_id 
        HAVING COUNT(*) > :threshold
      ) as frequent_guests
    `;
    const results = await Visit.sequelize!.query(query, {
      replacements: { officeId, threshold },
      type: QueryTypes.SELECT,
    });
    return Number((results[0] as any)?.count ?? 0);
  }

  public async countActiveVisitors(officeId?: number) {
    // Active visitors = guests with upcoming or in-progress visits
    const query = `
      SELECT COUNT(DISTINCT guest_id) as count 
      FROM visits 
      WHERE (status IN (:activeStatuses) OR scheduled_start > NOW())
      ${officeId ? 'AND office_id = :officeId' : ''}
    `;
    const results = await Visit.sequelize!.query(query, {
      replacements: { 
        officeId, 
        activeStatuses: [VISIT_STATUS_APPROVED, VISIT_STATUS_CHECKED_IN, VISIT_STATUS_IN_PROGRESS] 
      },
      type: QueryTypes.SELECT,
    });
    return Number((results[0] as any)?.count ?? 0);
  }

  public async getReportData(filters: {
    startDate?: Date;
    endDate?: Date;
    officeId?: number;
    departmentId?: number;
    hostId?: number;
    guestId?: number;
    status?: string;
  }) {
    const replacements: any = {};
    const conditions: string[] = ['v.deleted_at IS NULL'];

    if (filters.startDate && filters.endDate) {
      conditions.push('v.scheduled_start BETWEEN :start AND :end');
      replacements.start = filters.startDate;
      replacements.end = filters.endDate;
    }
    if (filters.officeId) {
      conditions.push('v.office_id = :officeId');
      replacements.officeId = filters.officeId;
    }
    if (filters.departmentId) {
      conditions.push('v.department_id = :departmentId');
      replacements.departmentId = filters.departmentId;
    }
    if (filters.hostId) {
      conditions.push(
        '(v.assigned_host_id = :hostId OR v.id IN (SELECT visit_id FROM visit_assignments WHERE host_id = :hostId))',
      );
      replacements.hostId = filters.hostId;
    }
    if (filters.status) {
      conditions.push('v.status = :status');
      replacements.status = filters.status;
    }
    if (filters.guestId) {
      conditions.push('v.guest_id = :guestId');
      replacements.guestId = filters.guestId;
    }

    const whereClause = conditions.join(' AND ');

    const query = `
      SELECT
        v.id,
        v.guest_id,
        v.office_id,
        v.department_id,
        v.service_id,
        v.assigned_host_id,
        v.purpose,
        v.status,
        v.scheduled_start,
        v.scheduled_end,
        v.checked_in_at,
        v.checked_out_at,
        v.reference_number,
        v.escalated_to_reception,
        v.escalated_at,
        v.escalated_by_id,
        v.is_vip,
        v.rating,
        v.rating_comment,
        v.created_at,
        v.updated_at,
        -- guest with profile
        jsonb_build_object(
          'id', g.id,
          'full_name', g.full_name,
          'email', g.email,
          'phone', g.phone,
          'guestProfile', CASE WHEN gp.id IS NOT NULL THEN jsonb_build_object('company', gp.company) ELSE NULL END
        ) AS guest,
        -- assigned host with user
        jsonb_build_object(
          'id', h.id,
          'user_id', h.user_id,
          'user', CASE WHEN hu.id IS NOT NULL THEN jsonb_build_object('full_name', hu.full_name, 'email', hu.email) ELSE NULL END
        ) AS "assignedHost",
        -- department
        jsonb_build_object('name', d.name) AS department,
        -- service
        jsonb_build_object('id', s.id, 'name', s.name) AS service,
        -- office
        jsonb_build_object('id', o.id, 'name', o.name) AS office,
        -- escalated by
        jsonb_build_object('id', eu.id, 'full_name', eu.full_name) AS "escalatedBy",
        -- latest approval (as array so service sort works)
        CASE WHEN la.status IS NOT NULL THEN jsonb_build_array(jsonb_build_object('status', la.status, 'created_at', la.created_at)) ELSE '[]'::jsonb END AS approvals,
        -- latest credential (as array so service sort works)
        CASE WHEN lc.status IS NOT NULL THEN jsonb_build_array(jsonb_build_object('status', lc.status, 'created_at', lc.created_at, 'provider', lc.provider, 'metadata', lc.metadata)) ELSE '[]'::jsonb END AS credentials,
        -- assignments (simplified; fetch only current ones to keep query light)
        COALESCE(assign_arr.assignments, '[]'::jsonb) AS assignments
      FROM visits v
      LEFT JOIN users g ON v.guest_id = g.id
      LEFT JOIN guest_profiles gp ON g.id = gp.user_id
      LEFT JOIN hosts h ON v.assigned_host_id = h.id
      LEFT JOIN users hu ON h.user_id = hu.id
      LEFT JOIN departments d ON v.department_id = d.id
      LEFT JOIN services s ON v.service_id = s.id
      LEFT JOIN offices o ON v.office_id = o.id
      LEFT JOIN users eu ON v.escalated_by_id = eu.id
      LEFT JOIN LATERAL (
        SELECT status, created_at
        FROM approvals
        WHERE visit_id = v.id
        ORDER BY created_at DESC
        LIMIT 1
      ) la ON true
      LEFT JOIN LATERAL (
        SELECT status, created_at, provider, metadata
        FROM access_credentials
        WHERE visit_id = v.id
        ORDER BY created_at DESC
        LIMIT 1
      ) lc ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object(
          'id', va.id,
          'assigned_at', va.assigned_at,
          'assignment_reason', va.assignment_reason,
          'is_current', va.is_current,
          'host', CASE WHEN vah.id IS NOT NULL THEN jsonb_build_object('user', jsonb_build_object('full_name', vahu.full_name)) ELSE NULL END,
          'assignedBy', CASE WHEN vau.id IS NOT NULL THEN jsonb_build_object('full_name', vau.full_name) ELSE NULL END
        )) AS assignments
        FROM visit_assignments va
        LEFT JOIN hosts vah ON va.host_id = vah.id
        LEFT JOIN users vahu ON vah.user_id = vahu.id
        LEFT JOIN users vau ON va.assigned_by_id = vau.id
        WHERE va.visit_id = v.id
        LIMIT 100
      ) assign_arr ON true
      WHERE ${whereClause}
      ORDER BY v.scheduled_start ASC
    `;

    const rows = (await Visit.sequelize!.query(query, {
      replacements,
      type: QueryTypes.SELECT,
    })) as any[];

    return rows;
  }

  public async countCredentialsExpiringSoon(
    officeId: number | undefined,
    end: Date,
    nowDate = new Date(),
  ) {
    return AccessCredential.count({
      where: {
        status: CREDENTIAL_STATUS_ACTIVE,
        valid_until: { [Op.between]: [nowDate, end] },
      },
      include: officeId
        ? [{ model: Visit, required: true, where: { office_id: officeId } }]
        : [{ model: Visit, required: true }],
    });
  }

  public async getRecentActivityRaw(
    officeId: number | undefined,
    limit: number,
  ) {
    const visitScope = officeId ? { office_id: officeId } : undefined;
    const [visits, approvals, credentials] = await Promise.all([
      Visit.findAll({
        where: visitScope,
        order: [["updated_at", "DESC"]],
        limit,
        include: [{ model: User, as: "guest", required: false }],
      }),
      Approval.findAll({
        include: [
          { model: Visit, required: true, where: visitScope },
          { model: User, as: "approver", required: false },
        ],
        order: [["created_at", "DESC"]],
        limit,
      }),
      AccessCredential.findAll({
        include: [{ model: Visit, required: true, where: visitScope }],
        order: [["updated_at", "DESC"]],
        limit,
      }),
    ]);

    return { visits, approvals, credentials };
  }

  public async getQueue(
    officeId: number | undefined,
    limit: number,
    start: Date,
    nowDate = new Date(),
  ) {
    const replacements: any = { start, limit, nowDate };
    const conditions = [
      'v.scheduled_end >= :nowDate',
      "v.status != 'CANCELLED'",
      'v.deleted_at IS NULL',
    ];
    if (officeId) {
      conditions.push('v.office_id = :officeId');
      replacements.officeId = officeId;
    }

    const whereClause = conditions.join(' AND ');

    try {
      const rows = (await Visit.sequelize!.query(
        `
        SELECT
          v.id,
          v.guest_id,
          v.office_id,
          v.department_id,
          v.service_id,
          v.assigned_host_id,
          v.time_slot_id,
          v.purpose,
          v.status,
          v.scheduled_start,
          v.scheduled_end,
          v.checked_in_at,
          v.checked_out_at,
          v.reference_number,
          v.escalated_to_reception,
          v.escalated_at,
          v.escalated_by_id,
          v.escalation_reason,
          v.is_vip,
          v.rating,
          v.rating_comment,
          v.created_at,
          v.updated_at,
          -- conflict detection: is the host busy with another guest?
          EXISTS (
            SELECT 1 FROM visits v2 
            WHERE v2.assigned_host_id = v.assigned_host_id 
            AND v2.id != v.id 
            AND v2.status IN ('CHECKED_IN', 'IN_PROGRESS')
            AND v2.deleted_at IS NULL
          ) as has_conflict,
          -- guest with profile
          jsonb_build_object(
            'id', g.id,
            'full_name', g.full_name,
            'email', g.email,
            'guestProfile', CASE WHEN gp.id IS NOT NULL THEN jsonb_build_object('company', gp.company) ELSE NULL END
          ) AS guest,
          -- assigned host with user
          jsonb_build_object(
            'id', h.id,
            'user_id', h.user_id,
            'user', CASE WHEN hu.id IS NOT NULL THEN jsonb_build_object('full_name', hu.full_name, 'email', hu.email) ELSE NULL END
          ) AS "assignedHost",
          -- time slot fallback host
          jsonb_build_object(
            'id', ts.id,
            'host', CASE WHEN tsh.id IS NOT NULL THEN jsonb_build_object(
              'id', tsh.id,
              'user', CASE WHEN tshu.id IS NOT NULL THEN jsonb_build_object('full_name', tshu.full_name, 'email', tshu.email) ELSE NULL END
            ) ELSE NULL END
          ) AS "TimeSlot",
          -- department
          jsonb_build_object('name', d.name) AS department,
          -- service
          jsonb_build_object('id', s.id, 'name', s.name) AS service,
          -- escalated by
          jsonb_build_object('id', eu.id, 'full_name', eu.full_name) AS "escalatedBy",
          -- approvals (latest first)
          COALESCE(approval_arr.approvals, '[]'::jsonb) AS approvals,
          -- credentials (latest first)
          COALESCE(cred_arr.credentials, '[]'::jsonb) AS credentials,
          -- assignments
          COALESCE(assign_arr.assignments, '[]'::jsonb) AS assignments
        FROM visits v
        LEFT JOIN users g ON v.guest_id = g.id
        LEFT JOIN guest_profiles gp ON g.id = gp.user_id
        LEFT JOIN hosts h ON v.assigned_host_id = h.id
        LEFT JOIN users hu ON h.user_id = hu.id
        LEFT JOIN time_slots ts ON v.time_slot_id = ts.id
        LEFT JOIN hosts tsh ON ts.host_id = tsh.id
        LEFT JOIN users tshu ON tsh.user_id = tshu.id
        LEFT JOIN departments d ON v.department_id = d.id
        LEFT JOIN services s ON v.service_id = s.id
        LEFT JOIN users eu ON v.escalated_by_id = eu.id
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(jsonb_build_object(
            'status', a.status,
            'created_at', a.created_at
          ) ORDER BY a.created_at DESC) AS approvals
          FROM approvals a
          WHERE a.visit_id = v.id
        ) approval_arr ON true
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(jsonb_build_object(
            'status', ac.status,
            'provider', ac.provider,
            'external_credential_id', ac.external_credential_id,
            'external_identity_id', ac.external_identity_id,
            'metadata', ac.metadata,
            'created_at', ac.created_at
          ) ORDER BY ac.created_at DESC) AS credentials
          FROM access_credentials ac
          WHERE ac.visit_id = v.id
        ) cred_arr ON true
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(jsonb_build_object(
            'id', va.id,
            'assigned_at', va.assigned_at,
            'assignment_reason', va.assignment_reason,
            'is_current', va.is_current,
            'host', CASE WHEN vah.id IS NOT NULL THEN jsonb_build_object('user', jsonb_build_object('full_name', vahu.full_name)) ELSE NULL END,
            'assignedBy', CASE WHEN vau.id IS NOT NULL THEN jsonb_build_object('full_name', vau.full_name) ELSE NULL END
          )) AS assignments
          FROM visit_assignments va
          LEFT JOIN hosts vah ON va.host_id = vah.id
          LEFT JOIN users vahu ON vah.user_id = vahu.id
          LEFT JOIN users vau ON va.assigned_by_id = vau.id
          WHERE va.visit_id = v.id
        ) assign_arr ON true
        WHERE ${whereClause}
        ORDER BY v.scheduled_start ASC
        LIMIT :limit
        `,
        { replacements, type: QueryTypes.SELECT },
      )) as any[];

      return rows;
    } catch (err) {
      logger.error(
        { err, officeId, limit, start },
        "Failed to fetch operations queue from repository",
      );
      return [];
    }
  }

  public async countFailedOutbox() {
    // FIX: DEAD_LETTER (retries exhausted) used to be invisible to this
    // count — the exact rows an operator most needs to know about.
    return OutboxEvent.count({
      where: { status: { [Op.in]: [OUTBOX_STATUS_FAILED, OUTBOX_STATUS_DEAD_LETTER] } },
    });
  }

  public async getFailedOutbox(limit: number) {
    return OutboxEvent.findAll({
      where: { status: { [Op.in]: [OUTBOX_STATUS_FAILED, OUTBOX_STATUS_DEAD_LETTER] } },
      order: [["updated_at", "DESC"]],
      limit,
    });
  }

  public async countUnifiReconciliationPending(officeId?: number) {
    return AccessCredential.count({
      where: { provider: "INTERNAL", status: CREDENTIAL_STATUS_ACTIVE },
      include: officeId
        ? [{ model: Visit, required: true, where: { office_id: officeId } }]
        : [{ model: Visit, required: true }],
    });
  }

  /**
   * Credentials issued as "internal" fallback during a UniFi outage (see
   * unifi.service.ts's buildInternalFallbackCredential) are never
   * automatically re-pushed to UniFi once connectivity returns — nothing
   * reconciles them. A full auto-reconciliation job is out of scope here;
   * this at least makes the backlog visible so an operator can act on it.
   */
  public async getUnifiReconciliationPending(officeId: number | undefined, limit: number) {
    return AccessCredential.findAll({
      where: { provider: "INTERNAL", status: CREDENTIAL_STATUS_ACTIVE },
      include: officeId
        ? [{ model: Visit, required: true, where: { office_id: officeId } }]
        : [{ model: Visit, required: true }],
      order: [["updated_at", "DESC"]],
      limit,
    });
  }

  public async countFailedWebhookEvents() {
    return ExternalWebhookEvent.count({
      where: { status: WEBHOOK_STATUS_FAILED },
    });
  }

  public async getFailedWebhookEvents(limit: number) {
    return ExternalWebhookEvent.findAll({
      where: { status: WEBHOOK_STATUS_FAILED },
      order: [["updated_at", "DESC"]],
      limit,
    });
  }

  public async countFailedCredentials(officeId?: number) {
    return AccessCredential.count({
      where: { status: CREDENTIAL_STATUS_FAILED },
      include: officeId
        ? [{ model: Visit, required: true, where: { office_id: officeId } }]
        : [{ model: Visit, required: true }],
    });
  }

  public async getFailedCredentials(
    officeId: number | undefined,
    limit: number,
  ) {
    return AccessCredential.findAll({
      where: { status: CREDENTIAL_STATUS_FAILED },
      include: officeId
        ? [{ model: Visit, required: true, where: { office_id: officeId } }]
        : [{ model: Visit, required: true }],
      order: [["updated_at", "DESC"]],
    });
  }

  public async countApprovedWithFailedCredentialLatest(officeId?: number) {
    const query = `
      SELECT COUNT(*)::int AS count
      FROM visits v
      JOIN LATERAL (
        SELECT ac.status
        FROM access_credentials ac
        WHERE ac.visit_id = v.id
        ORDER BY ac.created_at DESC
        LIMIT 1
      ) lc ON true
      WHERE v.deleted_at IS NULL
        AND v.status = :approvedStatus
        AND lc.status = :failedStatus
        ${officeId ? "AND v.office_id = :officeId" : ""}
    `;

    const results = await Visit.sequelize!.query(query, {
      replacements: {
        officeId,
        approvedStatus: VISIT_STATUS_APPROVED,
        failedStatus: CREDENTIAL_STATUS_FAILED,
      },
      type: QueryTypes.SELECT,
    });

    return Number((results[0] as any)?.count ?? 0);
  }

  public async getApprovedWithFailedCredentialLatest(
    officeId: number | undefined,
    limit: number,
  ) {
    const query = `
      SELECT
        v.id AS visit_id,
        v.reference_number,
        v.office_id,
        v.guest_id,
        v.updated_at AS visit_updated_at,
        lc.id AS credential_id,
        lc.provider AS credential_provider,
        lc.updated_at AS credential_updated_at,
        lc.metadata AS credential_metadata
      FROM visits v
      JOIN LATERAL (
        SELECT ac.id, ac.provider, ac.status, ac.updated_at, ac.metadata
        FROM access_credentials ac
        WHERE ac.visit_id = v.id
        ORDER BY ac.created_at DESC
        LIMIT 1
      ) lc ON true
      WHERE v.deleted_at IS NULL
        AND v.status = :approvedStatus
        AND lc.status = :failedStatus
        ${officeId ? "AND v.office_id = :officeId" : ""}
      ORDER BY lc.updated_at DESC
      LIMIT :limit
    `;

    return Visit.sequelize!.query(query, {
      replacements: {
        officeId,
        limit,
        approvedStatus: VISIT_STATUS_APPROVED,
        failedStatus: CREDENTIAL_STATUS_FAILED,
      },
      type: QueryTypes.SELECT,
    });
  }

  public async getStatusDistribution(
    officeId: number | undefined,
    start: Date,
    end: Date,
    hostId?: number,
    departmentId?: number,
    guestId?: number,
  ) {
    const counts = await Visit.findAll({
      attributes: [
        "status",
        [Visit.sequelize!.fn("COUNT", Visit.sequelize!.col("id")), "count"],
      ],
      where: {
        ...(officeId ? { office_id: officeId } : {}),
        ...(departmentId ? { department_id: departmentId } : {}),
        ...(hostId
          ? {
              [Op.or]: [
                { assigned_host_id: hostId },
                {
                  id: {
                    [Op.in]: literal(
                      `(SELECT visit_id FROM visit_assignments WHERE host_id = ${hostId})`,
                    ),
                  },
                },
              ],
            }
          : {}),
        ...(start && end ? { scheduled_start: { [Op.between]: [start, end] } } : {}),
        ...(guestId ? { guest_id: guestId } : {}),
      },
      group: ["status"],
      raw: true,
    });

    const total =
      counts.reduce((acc, curr: any) => acc + Number(curr.count), 0) || 1;
    return (counts as any[])
      .map((c) => ({
        status: c.status,
        count: Number(c.count),
        percent: Math.round((Number(c.count) / total) * 100),
      }))
      .sort((a, b) => b.count - a.count);
  }

  public async getDailyTrend(
    officeId: number | undefined,
    range: number | { startDate: Date; endDate: Date },
    hostId?: number,
    departmentId?: number,
    nowDate?: Date,
    guestId?: number,
  ) {
    let startDate: Date;
    let endDate: Date;

    const baseNow = nowDate || new Date();

    if (typeof range === "number") {
      endDate = new Date(baseNow);
      startDate = new Date(baseNow);
      startDate.setDate(startDate.getDate() - (range - 1));
    } else {
      startDate = range.startDate;
      endDate = range.endDate;
    }

    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    const query = `
      SELECT 
        TO_CHAR(DATE_TRUNC('day', "scheduled_start"), 'Mon DD') as "day",
        COUNT(*) as "count"
      FROM "visits"
      WHERE "scheduled_start" BETWEEN :start AND :end
      ${officeId ? 'AND "office_id" = :officeId' : ""}
      ${departmentId ? 'AND "department_id" = :departmentId' : ""}
      ${hostId ? 'AND ("assigned_host_id" = :hostId OR "id" IN (SELECT visit_id FROM visit_assignments WHERE host_id = :hostId))' : ""}
      ${guestId ? 'AND "guest_id" = :guestId' : ""}
      AND "deleted_at" IS NULL
      GROUP BY DATE_TRUNC('day', "scheduled_start")
      ORDER BY DATE_TRUNC('day', "scheduled_start") ASC
    `;

    const rawResults = (await Visit.sequelize!.query(query, {
      replacements: {
        start: startDate,
        end: endDate,
        officeId,
        departmentId,
        hostId,
        guestId,
      },
      type: QueryTypes.SELECT,
    })) as any[];

    // Fill in missing days to ensure a continuous chart
    const finalResults = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      const month = current.toLocaleString("en-US", { month: "short" });
      const day = current.getDate().toString().padStart(2, "0");
      const dayLabel = `${month} ${day}`;

      const match = rawResults.find((r) => r.day === dayLabel);
      finalResults.push({
        day: dayLabel,
        count: match ? Number(match.count) : 0,
      });
      current.setDate(current.getDate() + 1);
    }

    return finalResults;
  }

  public async getHourlyTrend(
    officeId: number | undefined,
    startDate: Date,
    endDate: Date,
    hostId?: number,
    departmentId?: number,
    guestId?: number,
  ) {
    const query = `
      SELECT 
        TO_CHAR(DATE_TRUNC('hour', "scheduled_start"), 'HH24:00') as "hour",
        COUNT(*) as "count"
      FROM "visits"
      WHERE "scheduled_start" BETWEEN :start AND :end
      ${officeId ? 'AND "office_id" = :officeId' : ""}
      ${departmentId ? 'AND "department_id" = :departmentId' : ""}
      ${hostId ? 'AND ("assigned_host_id" = :hostId OR "id" IN (SELECT visit_id FROM visit_assignments WHERE host_id = :hostId))' : ""}
      ${guestId ? 'AND "guest_id" = :guestId' : ""}
      AND "deleted_at" IS NULL
      GROUP BY DATE_TRUNC('hour', "scheduled_start")
      ORDER BY "hour" ASC
    `;

    const rawResults = (await Visit.sequelize!.query(query, {
      replacements: {
        start: startDate,
        end: endDate,
        officeId,
        departmentId,
        hostId,
        guestId,
      },
      type: QueryTypes.SELECT,
    })) as any[];

    // Ensure all 24 hours are represented
    const finalResults = [];
    for (let i = 0; i < 24; i++) {
      const hourLabel = i.toString().padStart(2, "0") + ":00";
      const match = rawResults.find((r) => r.hour === hourLabel);
      finalResults.push({
        hour: hourLabel,
        count: match ? Number(match.count) : 0,
      });
    }

    return finalResults;
  }

  public async getServiceDistribution(
    officeId: number | undefined,
    startDate: Date,
    endDate: Date,
    hostId?: number,
    departmentId?: number,
    guestId?: number,
  ) {
    const query = `
      SELECT s.name as "service", COUNT(v.id) as "count"
      FROM "visits" v
      JOIN "services" s ON v.service_id = s.id
      WHERE v.scheduled_start BETWEEN :start AND :end
      ${officeId ? "AND v.office_id = :officeId" : ""}
      ${departmentId ? 'AND v."department_id" = :departmentId' : ""}
      ${hostId ? "AND (v.assigned_host_id = :hostId OR v.id IN (SELECT visit_id FROM visit_assignments WHERE host_id = :hostId))" : ""}
      ${guestId ? 'AND v.guest_id = :guestId' : ""}
      AND v.deleted_at IS NULL
      GROUP BY s.name
      ORDER BY "count" DESC
    `;

    const [results] = await Visit.sequelize!.query(query, {
      replacements: { start: startDate, end: endDate, officeId, hostId, departmentId, guestId },
    });

    const total = (results as any[]).reduce(
      (sum, r) => sum + Number(r.count),
      0,
    );
    return (results as any[]).map((r) => ({
      service: r.service,
      count: Number(r.count),
      percent: total > 0 ? Math.round((Number(r.count) / total) * 100) : 0,
    }));
  }

  public async getOrganizationInsights(
    officeId?: number,
    start?: Date,
    end?: Date,
    departmentId?: number,
  ) {
    const query = `
      SELECT gp.company as "organization", COUNT(v.id) as "count"
      FROM "visits" v
      JOIN "guest_profiles" gp ON v.guest_id = gp.user_id
      WHERE gp.company IS NOT NULL
      ${start && end ? "AND v.scheduled_start BETWEEN :start AND :end" : ""}
      ${officeId ? "AND v.office_id = :officeId" : ""}
      ${departmentId ? "AND v.department_id = :departmentId" : ""}
      AND v.deleted_at IS NULL
      GROUP BY gp.company
      ORDER BY "count" DESC
      LIMIT 10
    `;
    const [results] = await Visit.sequelize!.query(query, {
      replacements: { start, end, officeId, departmentId },
    });
    return results;
  }

  public async getDepartmentInsights(
    officeId?: number,
    start?: Date,
    end?: Date,
    departmentId?: number,
  ) {
    const query = `
      SELECT d.name as "department", COUNT(v.id) as "count"
      FROM "visits" v
      JOIN "departments" d ON v.department_id = d.id
      WHERE 1=1
      ${start && end ? "AND v.scheduled_start BETWEEN :start AND :end" : ""}
      ${officeId ? "AND v.office_id = :officeId" : ""}
      ${departmentId ? "AND v.department_id = :departmentId" : ""}
      AND v.deleted_at IS NULL
      GROUP BY d.name
      ORDER BY "count" DESC
    `;
    const [results] = await Visit.sequelize!.query(query, {
      replacements: { start, end, officeId, departmentId },
    });
    return results;
  }

  public async getPurposeInsights(
    officeId?: number, 
    start?: Date, 
    end?: Date,
    departmentId?: number,
  ) {
    const query = `
      SELECT v.purpose, COUNT(v.id) as "count"
      FROM "visits" v
      WHERE v.purpose IS NOT NULL
      ${start && end ? "AND v.scheduled_start BETWEEN :start AND :end" : ""}
      ${officeId ? "AND v.office_id = :officeId" : ""}
      ${departmentId ? "AND v.department_id = :departmentId" : ""}
      AND v.deleted_at IS NULL
      GROUP BY v.purpose
      ORDER BY "count" DESC
      LIMIT 10
    `;
    const [results] = await Visit.sequelize!.query(query, {
      replacements: { start, end, officeId, departmentId },
    });
    return results;
  }

  public async getGuestTypeInsights(
    officeId?: number,
    start?: Date,
    end?: Date,
    departmentId?: number,
  ) {
    const query = `
      SELECT gp.is_vip, COUNT(v.id) as "count"
      FROM "visits" v
      JOIN "guest_profiles" gp ON v.guest_id = gp.user_id
      WHERE 1=1
      ${start && end ? "AND v.scheduled_start BETWEEN :start AND :end" : ""}
      ${officeId ? "AND v.office_id = :officeId" : ""}
      ${departmentId ? "AND v.department_id = :departmentId" : ""}
      AND v.deleted_at IS NULL
      GROUP BY gp.is_vip
    `;
    const [results] = await Visit.sequelize!.query(query, {
      replacements: { start, end, officeId, departmentId },
    });

    const total = (results as any[]).reduce(
      (sum, r) => sum + Number(r.count),
      0,
    );
    return (results as any[]).map((r) => ({
      type: r.is_vip ? "VIP" : "Standard",
      count: Number(r.count),
      percent: total > 0 ? Math.round((Number(r.count) / total) * 100) : 0,
    }));
  }

  public async getRatingInsights(officeId?: number, hostId?: number) {
    const query = `
      SELECT 
        AVG(rating) as "average_rating",
        COUNT(rating) as "total_ratings",
        COUNT(rating_comment) as "total_comments"
      FROM "visits"
      WHERE rating IS NOT NULL
      ${officeId ? "AND office_id = :officeId" : ""}
      ${hostId ? "AND (assigned_host_id = :hostId OR id IN (SELECT visit_id FROM visit_assignments WHERE host_id = :hostId))" : ""}
      AND deleted_at IS NULL
    `;
    const [results] = await Visit.sequelize!.query(query, {
      replacements: { officeId, hostId },
    });
    return (results as any[])[0];
  }

  public async getPunctualityInsights(
    officeId?: number,
    start?: Date,
    end?: Date,
    departmentId?: number,
  ) {
    const query = `
      SELECT 
        COUNT(*) as "total",
        COUNT(CASE WHEN checked_in_at <= scheduled_start THEN 1 END) as "on_time",
        COUNT(CASE WHEN checked_in_at > scheduled_start THEN 1 END) as "delayed",
        AVG(EXTRACT(EPOCH FROM (checked_in_at - scheduled_start))/60) as "avg_delay_minutes"
      FROM "visits"
      WHERE checked_in_at IS NOT NULL
      ${start && end ? "AND scheduled_start BETWEEN :start AND :end" : ""}
      ${officeId ? "AND office_id = :officeId" : ""}
      ${departmentId ? "AND department_id = :departmentId" : ""}
      AND deleted_at IS NULL
    `;
    const [results] = await Visit.sequelize!.query(query, {
      replacements: { start, end, officeId, departmentId },
    });
    return (results as any[])[0];
  }

  /**
   * Read-only pagination over the audit_logs table (see shared/services/audit.service.ts
   * for the write path). Every mutating module in the system already calls logAudit(),
   * so this surfaces that existing trail rather than introducing a new one.
   */
  public async getAuditLogs(
    filters: {
      entity?: string;
      action?: string;
      userId?: number;
      from?: Date;
      to?: Date;
    },
    page: number,
    limit: number,
  ) {
    const where: Record<string, any> = {};
    if (filters.entity) {
      where.entity = filters.entity;
    }
    if (filters.action) {
      where.action = filters.action;
    }
    if (filters.userId) {
      where.user_id = filters.userId;
    }
    if (filters.from || filters.to) {
      where.created_at = {
        ...(filters.from ? { [Op.gte]: filters.from } : {}),
        ...(filters.to ? { [Op.lte]: filters.to } : {}),
      };
    }

    const offset = (page - 1) * limit;
    return AuditLog.findAndCountAll({
      where,
      include: [{ model: User, as: "user", attributes: ["id", "full_name", "email"] }],
      order: [["created_at", "DESC"]],
      limit,
      offset,
    });
  }
}

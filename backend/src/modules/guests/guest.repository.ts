import { Op } from "sequelize";
import { resolveSortColumn, resolveSortOrder } from "../../core/utils/sorting";
import {
  GuestProfile,
  User,
  Visit,
  Host,
} from "../../infrastructure/database/models";
import { sequelize } from "../../infrastructure/database/sequelize";

export class GuestRepository {
  public async findByUserId(userId: number) {
    return GuestProfile.findOne({
      where: { user_id: userId },
      include: [{ model: User, as: "user", required: false }],
    });
  }

  public async findByUserIdOrCreate(userId: number) {
    const user = await User.findByPk(userId);
    if (!user) {
      return null;
    }

    const [profile] = await GuestProfile.findOrCreate({
      where: { user_id: userId },
      defaults: {
        user_id: userId,
        preferred_notification_channel: "EMAIL",
        is_vip: false,
      },
    });

    return this.findByUserId(profile.user_id);
  }

  public async updateProfile(userId: number, data: Record<string, unknown>) {
    const profile = await this.findByUserIdOrCreate(userId);
    await GuestProfile.update(data, { where: { user_id: userId } });
    return this.findByUserId(profile!.user_id);
  }

  public async listGuests(
    search: string | undefined,
    limit: number,
    offset: number,
    filter?: string,
    sortBy: string = "created_at",
    sortOrder: string = "DESC",
    scopedOfficeId?: number,
  ) {
    const include = [{ model: User, as: "user", required: true }];
    const where: any = {};

    /**
     * Restrict to guests who have actually visited the caller's office.
     *
     * Kept as an `AND` of its own rather than folded into `where.user_id`,
     * because the `frequent`/`active` filters below also write `where.user_id`
     * and the last assignment would win — silently widening the scope back to
     * every guest in the system the moment a receptionist clicked a filter
     * chip. Sequelize ANDs `[Op.and]` entries with the rest of the clause, so
     * both predicates survive together.
     */
    if (scopedOfficeId !== undefined && scopedOfficeId > 0) {
      where[Op.and] = [
        ...(where[Op.and] ?? []),
        {
          user_id: {
            [Op.in]: sequelize.literal(
              `(SELECT DISTINCT guest_id FROM visits WHERE office_id = ${sequelize.escape(scopedOfficeId)})`,
            ),
          },
        },
      ];
    }
    if (search) {
      where[Op.or] = [
        { company: { [Op.iLike]: `%${search}%` } },
        { government_id: { [Op.iLike]: `%${search}%` } },
        { emergency_contact_name: { [Op.iLike]: `%${search}%` } },
        { "$user.full_name$": { [Op.iLike]: `%${search}%` } },
        { "$user.email$": { [Op.iLike]: `%${search}%` } },
        { "$user.phone$": { [Op.iLike]: `%${search}%` } },
        {
          user_id: {
            [Op.in]: sequelize.literal(`(
              SELECT guest_id FROM visits v
              JOIN hosts h ON h.id = v.assigned_host_id
              JOIN users u ON u.id = h.user_id
              WHERE u.full_name ILIKE ${sequelize.escape(`%${search}%`)}
            )`)
          }
        }
      ];
    }

    // Server-side 'frequent'/'active' filtering, applied via a guest_id
    // subquery so it composes with the search where-clause above (Sequelize
    // ANDs top-level where keys together) and with pagination — this used to
    // be a documented gap, with the caller (guest.service.ts) always passing
    // `filter: undefined` and the frontend instead client-filtering the
    // CURRENT PAGE only, which silently disagreed with the server-computed
    // pagination (`meta.totalPages`) and hid matches on other pages.
    // Thresholds mirror getVisitStats/getVisitStatsForUsers exactly:
    // "frequent" = visits_count > 5 (all-time, any status), "active" =
    // upcoming_count > 0 (scheduled_start in the future).
    if (filter === "frequent" || filter === "active") {
      const subquery =
        filter === "frequent"
          ? `(SELECT guest_id FROM visits GROUP BY guest_id HAVING COUNT(*) > 5)`
          : `(SELECT DISTINCT guest_id FROM visits WHERE scheduled_start > NOW())`;
      where.user_id = { [Op.in]: sequelize.literal(subquery) };
    } else if (filter === "verified") {
      // "Verified Profiles" — a document_url has been captured. Same
      // reasoning as frequent/active: reception/guests/page.tsx's stat tile
      // used to count this over only the current page's rows.
      where.document_url = { [Op.ne]: null };
    }

    // sortBy reached Sequelize's `order:` straight from the query string —
    // an unknown column produced a Postgres error on demand. See
    // core/utils/sorting.ts.
    const safeOrder = resolveSortOrder(sortOrder);
    const order: any[] =
      sortBy === "name"
        ? [[{ model: User, as: "user" }, "full_name", safeOrder]]
        : [[resolveSortColumn(GuestProfile, sortBy), safeOrder]];

    return GuestProfile.findAndCountAll({
      where,
      include,
      limit,
      offset,
      distinct: true,
      order,
    });
  }

  /**
   * Has this guest ever visited that office? The membership test behind
   * per-guest office scoping — see GuestService.getGuestProfile.
   */
  public async hasVisitedOffice(userId: number, officeId: number): Promise<boolean> {
    const count = await Visit.count({ where: { guest_id: userId, office_id: officeId } });
    return count > 0;
  }

  public async getVisitStats(userId: number) {
    const visits = await Visit.findAll({
      where: { guest_id: userId },
      attributes: ["id", "status", "scheduled_start", "scheduled_end"],
      order: [["scheduled_start", "DESC"]],
      raw: true,
    });
    const [lastVisitHostRows] = await sequelize.query(
      `
        SELECT
          h.id,
          h.user_id,
          u.full_name,
          v.scheduled_start AS assigned_at
        FROM visits v
        LEFT JOIN hosts h ON h.id = v.assigned_host_id
        LEFT JOIN users u ON u.id = h.user_id
        WHERE v.guest_id = :userId
        ORDER BY v.scheduled_start DESC
        LIMIT 1
      `,
      { replacements: { userId } },
    );

    const now = new Date();
    const upcoming = visits.filter((v) => new Date(v.scheduled_start) > now);
    const nextVisit =
      upcoming.length > 0 ? upcoming[upcoming.length - 1] : null;

    const statusBreakdown: Record<string, number> = {};
    visits.forEach((v) => {
      statusBreakdown[v.status] = (statusBreakdown[v.status] || 0) + 1;
    });

    // Consistency check: Ensure status names match frontend expectation
    // (Handled by the status-catalog constants in DTO mapping)

    return {
      visits_count: visits.length,
      last_visit_at: visits[0]?.scheduled_start ?? null,
      last_visit_host:
        Array.isArray(lastVisitHostRows) &&
        lastVisitHostRows[0] &&
        (lastVisitHostRows[0] as any).id
          ? {
              id: Number((lastVisitHostRows[0] as any).id),
              user_id: Number((lastVisitHostRows[0] as any).user_id),
              full_name: (lastVisitHostRows[0] as any).full_name ?? null,
              assigned_at: (lastVisitHostRows[0] as any).assigned_at ?? null,
            }
          : null,
      next_visit_at: nextVisit?.scheduled_start ?? null,
      status_breakdown: statusBreakdown,
      upcoming_count: upcoming.length,
    };
  }

  public async getVisitStatsForUsers(userIds: number[]) {
    const visits = await Visit.findAll({
      where: { guest_id: { [Op.in]: userIds } },
      attributes: ["guest_id", "status", "scheduled_start", "scheduled_end"],
      order: [["scheduled_start", "DESC"]],
      raw: true,
    });

    const [lastVisitsWithHosts] = await sequelize.query(
      `
        SELECT DISTINCT ON (v.guest_id)
          v.guest_id,
          h.id,
          h.user_id,
          u.full_name,
          v.scheduled_start AS assigned_at
        FROM visits v
        LEFT JOIN hosts h ON h.id = v.assigned_host_id
        LEFT JOIN users u ON u.id = h.user_id
        WHERE v.guest_id IN (:userIds)
        ORDER BY v.guest_id, v.scheduled_start DESC
      `,
      { replacements: { userIds } },
    );

    const grouped = new Map<string, any>();
    const now = new Date();

    for (const userId of userIds) {
      grouped.set(String(userId), {
        visits_count: 0,
        last_visit_at: null,
        last_visit_host: null,
        next_visit_at: null,
        status_breakdown: {},
        upcoming_count: 0,
      });
    }

    for (const visit of visits as any[]) {
      const stats = grouped.get(String(visit.guest_id));
      if (!stats) continue;

      stats.visits_count++;
      if (!stats.last_visit_at) stats.last_visit_at = visit.scheduled_start;

      const vStart = new Date(visit.scheduled_start);
      if (vStart > now) {
        stats.upcoming_count++;
        if (!stats.next_visit_at || vStart < new Date(stats.next_visit_at)) {
          stats.next_visit_at = visit.scheduled_start;
        }
      }

      stats.status_breakdown[visit.status] =
        (stats.status_breakdown[visit.status] || 0) + 1;
    }

    for (const visit of (lastVisitsWithHosts as any[]) || []) {
      const guestId = String(visit.guest_id);
      const stats = grouped.get(guestId);
      if (!stats || stats.last_visit_host) continue;
      if (!visit.id) continue;

      stats.last_visit_host = {
        id: Number(visit.id),
        user_id: Number(visit.user_id),
        full_name: visit.full_name ?? null,
        assigned_at: visit.assigned_at ?? null,
      };
    }

    const normalized = new Map<number, any>();
    for (const userId of userIds) {
      normalized.set(
        Number(userId),
        grouped.get(String(userId)) ?? {
          visits_count: 0,
          last_visit_at: null,
          last_visit_host: null,
          next_visit_at: null,
          status_breakdown: {},
          upcoming_count: 0,
        },
      );
    }

    return normalized;
  }

  public async markLastVisit(userId: number, occurredAt: Date) {
    return GuestProfile.update(
      { last_visit_at: occurredAt },
      { where: { user_id: userId } },
    );
  }
}

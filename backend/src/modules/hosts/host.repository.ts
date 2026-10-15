import { Host } from "../../infrastructure/database/models/Host";
import { User } from "../../infrastructure/database/models/User";
import { HostProfile } from "../../infrastructure/database/models/HostProfile";
import { TimeSlot } from "../../infrastructure/database/models/TimeSlot";
import { Visit } from "../../infrastructure/database/models/Visit";
import { Approval } from "../../infrastructure/database/models/Approval";
import { Office } from "../../infrastructure/database/models/Office";
import { Department } from "../../infrastructure/database/models/Department";
import { resolveSortColumn, resolveSortOrder } from "../../core/utils/sorting";
import { AccessCredential } from "../../infrastructure/database/models/AccessCredential";
import { Service } from "../../infrastructure/database/models/Service";
import { Role } from "../../infrastructure/database/models/Role";
import { ServiceHost } from "../../infrastructure/database/models/ServiceHost";
import { Op } from "sequelize";
import { sequelize } from "../../infrastructure/database/sequelize";
import { ServiceRepository } from "../services/service.repository";
import {
  calculateHostStatsFromVisits,
  EMPTY_HOST_STATS,
} from "./host-metrics";

/**
 * Host Repository
 * Domain storage for host staff members and their associated user profiles.
 */
export class HostRepository {
  public async findAll(
    filters: {
      officeId?: number;
      departmentId?: number;
      userId?: number;
      activeOn?: string;
      page?: number;
      limit?: number;
      search?: string;
      roles?: string[];
      sortBy?: string;
      sortOrder?: string;
    } = {},
  ) {
    const whereClause: any = {};
    if (filters.officeId) whereClause.office_id = filters.officeId;
    if (filters.departmentId) whereClause.department_id = filters.departmentId;
    if (filters.userId) whereClause.user_id = filters.userId;

    const userWhere: any = {};
    const roleWhere: any = {};

    if (filters.search) {
      userWhere[Op.or] = [
        { full_name: { [Op.iLike]: `%${filters.search}%` } },
        { email: { [Op.iLike]: `%${filters.search}%` } },
      ];
    }

    if (filters.roles && Array.isArray(filters.roles) && filters.roles.length > 0) {
      roleWhere.name = { [Op.in]: filters.roles };
    }

    const limit = Math.max(1, filters.limit ?? 20);
    const page = Math.max(1, filters.page ?? 1);
    const offset = (page - 1) * limit;

    const sortBy = filters.sortBy ?? 'id';
    const sortOrder = filters.sortOrder ?? 'ASC';

    // See core/utils/sorting.ts — sortBy used to reach Sequelize's order clause
    // straight from the query string.
    const safeOrder = resolveSortOrder(sortOrder, 'ASC');
    const order: any[] = sortBy === "name"
      ? [[{ model: User, as: "user" }, "full_name", safeOrder]]
      : [[resolveSortColumn(Host, sortBy, 'id'), safeOrder]];

    return Host.findAndCountAll({
      where: whereClause,
      limit,
      offset,
      include: [
        {
          model: User,
          as: "user",
          where: (Object.keys(userWhere).length > 0 || Object.getOwnPropertySymbols(userWhere).length > 0) ? userWhere : undefined,
          include: [
            { model: HostProfile, as: "hostProfile" },
            { 
              model: Role, 
              as: "roles", 
              where: Object.keys(roleWhere).length > 0 ? roleWhere : undefined,
              required: Object.keys(roleWhere).length > 0 
            }
          ],
        },
        { model: Office, as: "office", required: false },
        { model: Department, as: "department", required: false },
        { 
          model: Service, 
          as: "services", 
          through: { attributes: [] },
          include: [{ model: Department, as: "Department", attributes: ["name"] }] 
        },
      ],
      order,
    });
  }

  public async getAvailableSlotsCountBatch(
    hostIds: number[],
    activeOnDate: string
  ): Promise<Record<string, number>> {
    const start = new Date(`${activeOnDate}T00:00:00.000Z`);
    const end = new Date(`${activeOnDate}T23:59:59.999Z`);
    const slotCounts = await TimeSlot.findAll({
      attributes: ["host_id"],
      where: {
        host_id: { [Op.in]: hostIds },
        start_time: { [Op.between]: [start, end] },
        slot_state: "AVAILABLE",
        is_booked: false,
      },
    });

    return slotCounts.reduce<Record<string, number>>((acc, slot: any) => {
      acc[String(slot.host_id)] = (acc[String(slot.host_id)] ?? 0) + 1;
      return acc;
    }, {});
  }

  public async getHostStatsBatch(hostIds: number[]) {
    if (!hostIds.length) {
      return new Map<number, any>();
    }

    const hostQueries = hostIds.map(async (hostId) => {
      const visits = await Visit.findAll({
        where: { assigned_host_id: hostId },
        attributes: ["id", "assigned_host_id", "status", "created_at"],
        include: [
          {
            model: Approval,
            as: "approvals",
            attributes: ["created_at", "status"],
          },
        ],
        order: [["created_at", "DESC"]],
        limit: 100, // Limit to recent 100 visits for bounded moving average metrics
        raw: false,
      });

      return { hostId, stats: calculateHostStatsFromVisits(visits) };
    });

    const results = await Promise.all(hostQueries);
    const finalStats = new Map<number, any>();
    
    for (const result of results) {
      finalStats.set(result.hostId, result.stats);
    }

    return finalStats;
  }

  public async getRecentAssignedVisitsBatch(hostIds: number[]) {
    if (!hostIds.length) {
      return new Map<number, any[]>();
    }

    const hostQueries = hostIds.map(async (hostId) => {
      const visits = await Visit.findAll({
        where: { assigned_host_id: hostId },
        attributes: [
          "id",
          "assigned_host_id",
          "status",
          "scheduled_start",
          "created_at",
        ],
        include: [
          {
            model: User,
            as: "guest",
            required: false,
            attributes: ["id", "full_name", "email"],
          },
          {
            model: Approval,
            as: "approvals",
            required: false,
            attributes: ["id", "status", "created_at"],
          },
          {
            model: AccessCredential,
            as: "credentials",
            required: false,
            attributes: ["id", "status", "provider"],
          },
        ],
        order: [
          ["scheduled_start", "DESC"],
          [{ model: Approval, as: "approvals" }, "created_at", "DESC"],
          [{ model: AccessCredential, as: "credentials" }, "created_at", "DESC"]
        ],
        limit: 3,
      });

      return {
        hostId,
        visits: visits.map((visit: any) => ({
          id: Number(visit.id),
          status: visit.status,
          assigned_at: visit.scheduled_start ?? visit.created_at ?? null,
          guest: visit.guest
            ? {
                id: Number(visit.guest.id),
                full_name: visit.guest.full_name ?? null,
                email: visit.guest.email ?? null,
              }
            : null,
          latest_approval:
            Array.isArray(visit.approvals) && visit.approvals[0]
              ? {
                  id: Number(visit.approvals[0].id),
                  status: visit.approvals[0].status,
                  created_at: visit.approvals[0].created_at ?? null,
                }
              : null,
          latest_credential:
            Array.isArray(visit.credentials) && visit.credentials[0]
              ? {
                  id: Number(visit.credentials[0].id),
                  status: visit.credentials[0].status,
                  provider: visit.credentials[0].provider ?? null,
                }
              : null,
        })),
      };
    });

    const results = await Promise.all(hostQueries);
    const normalized = new Map<number, any[]>();
    
    for (const result of results) {
      normalized.set(result.hostId, result.visits);
    }

    return normalized;
  }

  public async findById(id: number) {
    return Host.findByPk(id, {
      include: [
        {
          model: User,
          as: "user",
          include: [{ model: HostProfile, as: "hostProfile" }],
        },
        { model: Office, as: "office", required: false },
        { model: Department, as: "department", required: false },
        { 
          model: Service, 
          as: "services", 
          through: { attributes: [] },
          include: [{ model: Department, as: "Department", attributes: ["name"] }] 
        },
      ],
    });
  }

  public async findByUserId(userId: number) {
    return Host.findOne({
      where: { user_id: userId },
      include: [
        {
          model: User,
          as: "user",
          include: [{ model: HostProfile, as: "hostProfile" }],
        },
      ],
    });
  }

  public async updateServices(id: number, serviceIds: number[]) {
    const svcRepo = new ServiceRepository();
    return await sequelize.transaction(async (t) => {
      // Capture the OLD assignment set before destroying it — a service
      // dropped by this replace (present in the old set, absent from the
      // new one) needs its denormalized host_ids array resynced too, or it
      // keeps listing this host as eligible for auto-assignment even after
      // being removed from the service via this exact admin action.
      const existing = await ServiceHost.findAll({
        where: { host_id: id },
        attributes: ['service_id'],
        transaction: t,
      });
      const oldServiceIds = existing.map((r: any) => Number(r.service_id));

      await ServiceHost.destroy({ where: { host_id: id }, transaction: t });
      if (serviceIds.length > 0) {
        await ServiceHost.bulkCreate(
          serviceIds.map((serviceId) => ({
            host_id: id,
            service_id: serviceId,
          })),
          { transaction: t }
        );
      }

      // Sync every service whose ServiceHost membership could have changed —
      // both newly-assigned services and ones just removed from this host.
      const affected = new Set<number>([...oldServiceIds, ...serviceIds.map((s) => Number(s))]);
      for (const svcId of affected) {
        await svcRepo.syncHostIds(svcId, t);
      }
    });
  }

  public async addServices(id: number, serviceIds: number[]) {
    if (!Array.isArray(serviceIds) || serviceIds.length === 0) return;
    const svcRepo = new ServiceRepository();

    return await sequelize.transaction(async (t) => {
      const requested = Array.from(new Set(serviceIds.map((s) => Number(s)).filter(Boolean)));

      // find existing to avoid duplicates
      const existing = await ServiceHost.findAll({
        where: { host_id: id, service_id: { [Op.in]: requested } },
        attributes: ['service_id'],
        transaction: t,
      });

      const existingIds = existing.map((r: any) => Number(r.service_id));
      const toCreate = requested.filter((sid) => !existingIds.includes(sid));

      if (toCreate.length > 0) {
        await ServiceHost.bulkCreate(
          toCreate.map((serviceId) => ({ host_id: id, service_id: serviceId })),
          { transaction: t }
        );
      }

      // Sync affected services' denormalized arrays
      const affected = [...new Set(requested)];
      for (const svcId of affected) {
        await svcRepo.syncHostIds(svcId, t);
      }
    });
  }

  public async removeServices(id: number, serviceIds: number[]) {
    if (!Array.isArray(serviceIds) || serviceIds.length === 0) return;
    const svcRepo = new ServiceRepository();

    return await sequelize.transaction(async (t) => {
      const ids = Array.from(new Set(serviceIds.map((s) => Number(s)).filter(Boolean)));
      await ServiceHost.destroy({ where: { host_id: id, service_id: { [Op.in]: ids } }, transaction: t });

      // Sync affected services' denormalized arrays
      const affected = [...new Set(ids)];
      for (const svcId of affected) {
        await svcRepo.syncHostIds(svcId, t);
      }
    });
  }
}

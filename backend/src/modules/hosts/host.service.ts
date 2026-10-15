import { HostRepository } from './host.repository';
import { EMPTY_HOST_STATS } from './host-metrics';
import { AppError } from '../../core/errors/AppError';
import { ErrorCodes } from '../../core/errors/errorCodes';
import { hasGlobalOfficeScope, isSuperHost, isAdminRole, isHostRole, isReceptionRole, normalizeRoles, isSuperRole } from '../../shared/auth/roles';
import { requireActorOfficeId } from '../../shared/auth/scope-resolver';

type HostActor = { id: number; roles?: string[]; office_id?: number };

/**
 * Host Management Service
 */
export class HostService {
  private repository: HostRepository;

  constructor() {
    this.repository = new HostRepository();
  }

  public async listHosts(
    actor: HostActor,
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
    const roles = normalizeRoles(actor.roles ?? []);
    const scopedFilters = { ...filters };

    if (!hasGlobalOfficeScope(roles) && roles.some((role) => isAdminRole(role) || isReceptionRole(role) || isHostRole(role))) {
      const actorOfficeId = requireActorOfficeId(actor, 'Office-scoped host access requires an office assignment');

      // If they are explicitly searching for super roles, allow global lookup
      const isSearchingForSuper = filters.roles?.some(r => isSuperRole(r));

      if (!isSearchingForSuper) {
        if (scopedFilters.officeId && Number(scopedFilters.officeId) !== actorOfficeId) {
          throw new AppError('Host lookup is outside your office scope', ErrorCodes.AUTH_FORBIDDEN, 403);
        }
        scopedFilters.officeId = actorOfficeId;
      }
    }

    const { rows: hosts, count } = await this.repository.findAll(scopedFilters);
    const hostIds = hosts.map((h: any) => Number(h.id));

    const stats = await this.repository.getHostStatsBatch(hostIds);
    const recentVisitsByHost = await this.repository.getRecentAssignedVisitsBatch(hostIds);
    let counts: Record<string, number> = {};

    if (scopedFilters.activeOn) {
      counts = await this.repository.getAvailableSlotsCountBatch(hostIds, scopedFilters.activeOn);
    }

    const data = hosts.map((host: any) => ({
      ...host.toJSON(),
      available_slots_count: counts[String(host.id)] ?? 0,
      recent_assigned_visits: recentVisitsByHost.get(Number(host.id)) ?? [],
      stats: stats.get(Number(host.id)) || { ...EMPTY_HOST_STATS },
    }));

    return {
      data,
      meta: { total: count },
    };
  }

  public async getHostProfile(id: number) {
    const host = await this.repository.findById(id);
    if (!host) throw new AppError('Host staff member not found', ErrorCodes.SYSTEM_NOT_FOUND, 404);

    return this.shapeSingleHostProfile(host, id);
  }

  public async getHostProfileForActor(actor: HostActor, id: number) {
    const roles = normalizeRoles(actor.roles ?? []);
    const host = await this.repository.findById(id);
    if (!host) {
      throw new AppError('Host staff member not found', ErrorCodes.SYSTEM_NOT_FOUND, 404);
    }

    if (!hasGlobalOfficeScope(roles) && roles.some((role) => isAdminRole(role) || isReceptionRole(role) || isHostRole(role))) {
      const actorOfficeId = requireActorOfficeId(actor, 'Office-scoped host access requires an office assignment');

      if (Number((host as any).office_id ?? 0) !== actorOfficeId) {
        throw new AppError('Host lookup is outside your office scope', ErrorCodes.AUTH_FORBIDDEN, 403);
      }
    }

    return this.shapeSingleHostProfile(host, id);
  }

  private async shapeSingleHostProfile(host: any, id: number) {
    const stats = await this.repository.getHostStatsBatch([id]);
    const recentAssignedVisits = await this.repository.getRecentAssignedVisitsBatch([id]);

    return {
      ...host.toJSON(),
      stats: stats.get(id) || { ...EMPTY_HOST_STATS },
      recent_assigned_visits: recentAssignedVisits.get(id) ?? [],
    };
  }

  public async getHostByUserId(userId: number) {
    const host = await this.repository.findByUserId(userId);
    if (!host) throw new AppError('No host profile is linked to this user', ErrorCodes.SYSTEM_NOT_FOUND, 404);
    return host;
  }

  public async updateHostServices(actor: HostActor, id: number, serviceIds: number[]) {
    const roles = normalizeRoles(actor.roles ?? []);
    // GMS-NEW-1: was `isAdminRole(roles[0])` — only checked the FIRST role in
    // the array, so an actor whose admin role wasn't index 0 (e.g.
    // ['reception', 'admin']) was wrongly denied.
    if (!roles.some(isAdminRole) && !roles.includes('super_admin')) {
      throw new AppError('Only administrators can update host service assignments', ErrorCodes.AUTH_FORBIDDEN, 403);
    }

    const host = await this.repository.findById(id);
    if (!host) throw new AppError('Host member not found', ErrorCodes.SYSTEM_NOT_FOUND, 404);

    if (!hasGlobalOfficeScope(roles)) {
      const actorOfficeId = requireActorOfficeId(actor, 'Office scope required');
      if (Number(host.office_id) !== actorOfficeId) {
        throw new AppError('Host belongs to a different office scope', ErrorCodes.AUTH_FORBIDDEN, 403);
      }
    }

    await this.repository.updateServices(id, serviceIds);
  }

  public async addHostServices(actor: HostActor, id: number, serviceIds: number[]) {
    const roles = normalizeRoles(actor.roles ?? []);
    if (!roles.some(isAdminRole) && !roles.includes('super_admin')) {
      throw new AppError('Only administrators can update host service assignments', ErrorCodes.AUTH_FORBIDDEN, 403);
    }

    const host = await this.repository.findById(id);
    if (!host) throw new AppError('Host member not found', ErrorCodes.SYSTEM_NOT_FOUND, 404);

    if (!hasGlobalOfficeScope(roles)) {
      const actorOfficeId = requireActorOfficeId(actor, 'Office scope required');
      if (Number(host.office_id) !== actorOfficeId) {
        throw new AppError('Host belongs to a different office scope', ErrorCodes.AUTH_FORBIDDEN, 403);
      }
    }

    await this.repository.addServices(id, serviceIds);
  }

  public async removeHostServices(actor: HostActor, id: number, serviceIds: number[]) {
    const roles = normalizeRoles(actor.roles ?? []);
    if (!roles.some(isAdminRole) && !roles.includes('super_admin')) {
      throw new AppError('Only administrators can update host service assignments', ErrorCodes.AUTH_FORBIDDEN, 403);
    }

    const host = await this.repository.findById(id);
    if (!host) throw new AppError('Host member not found', ErrorCodes.SYSTEM_NOT_FOUND, 404);

    if (!hasGlobalOfficeScope(roles)) {
      const actorOfficeId = requireActorOfficeId(actor, 'Office scope required');
      if (Number(host.office_id) !== actorOfficeId) {
        throw new AppError('Host belongs to a different office scope', ErrorCodes.AUTH_FORBIDDEN, 403);
      }
    }

    await this.repository.removeServices(id, serviceIds);
  }
}

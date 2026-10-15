import { Op, literal } from "sequelize";
import { AppError } from "../../core/errors/AppError";
import { ErrorCodes } from "../../core/errors/errorCodes";
import { HostService } from "../hosts/host.service";
import {
  isAdminRole,
  isHostRole,
  isReceptionRole,
  isSuperAdmin,
  isSuperHost,
  isSuperReception,
  normalizeRoles,
} from "../../shared/auth/roles";
import { requireActorOfficeId } from "../../shared/auth/scope-resolver";
import { VISIT_STATUS_GROUPS } from "./visit-statuses";
import { VisitActor } from "./visit.types";

export class VisitScopePolicy {
  private readonly hostService: HostService;

  constructor(hostService?: HostService) {
    this.hostService = hostService ?? new HostService();
  }

  public async buildScopedFilter(
    actor: VisitActor,
    base: Record<string, any> = {},
  ) {
    const roles = normalizeRoles(actor.roles ?? []);
    const isGlobalStaff = isSuperAdmin(roles) || isSuperReception(roles) || isSuperHost(roles);
    const isOfficeStaff =
      roles.some(isAdminRole) || roles.some(isReceptionRole);
    const isHost = roles.some(isHostRole);

    const filter: any = { ...base };

    if (isGlobalStaff) {
      // no scope restriction
    } else if (isOfficeStaff) {
      filter.office_id = this.requireReceptionOfficeId(actor);
    } else if (isHost) {
      const host = await this.hostService.getHostByUserId(actor.id);
      const hostId = Number((host as any).id);
      filter[Op.or] = [
        { assigned_host_id: hostId },
        { id: { [Op.in]: literal(`(SELECT visit_id FROM visit_assignments WHERE host_id = ${hostId})`) } }
      ];
    } else {
      filter.guest_id = actor.id;
    }

    if (base.date === "today") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      filter.scheduled_start = { [Op.between]: [start, end] };
      delete filter.date;
    } else if (base.date === "past") {
      filter.scheduled_start = { [Op.lt]: new Date() };
      delete filter.date;
    }

    if (base.hasHost === "false") {
      filter.assigned_host_id = null;
      delete filter.hasHost;
    }

    if (base.host_id !== undefined) {
      const hId = Number(base.host_id);
      // Number('abc') is NaN, which was interpolated straight into the literal()
      // below as `host_id = NaN` -- a Postgres syntax error, i.e. a guaranteed
      // 500 on any request with a non-numeric host_id. Reject it as bad input
      // here instead of emitting invalid SQL.
      if (!Number.isInteger(hId) || hId <= 0) {
        throw new AppError(
          'host_id must be a positive integer',
          ErrorCodes.INVALID_INPUT,
          400,
        );
      }
      filter[Op.and] = filter[Op.and] || [];
      filter[Op.and].push({
        [Op.or]: [
          { assigned_host_id: hId },
          { id: { [Op.in]: literal(`(SELECT visit_id FROM visit_assignments WHERE host_id = ${hId})`) } }
        ]
      });
      delete filter.host_id;
    }

    if (base.has_credential === "true" || base.hasCredential === "true") {
      filter.__hasCredential = true;
      delete filter.has_credential;
      delete filter.hasCredential;
    }

    const statusGroup = base.status_group ?? base.statusGroup;
    if (statusGroup === "READY_ARRIVALS") {
      filter.status = { [Op.in]: [...VISIT_STATUS_GROUPS.READY_ARRIVALS] };
      delete filter.status_group;
      delete filter.statusGroup;
    }

    if (statusGroup === "ESCALATED") {
      filter.escalated_to_reception = true;
      delete filter.status_group;
      delete filter.statusGroup;
    }

    if (base.expiring_soon === "true" || base.expiringSoon === "true") {
      filter.__expiringSoon = true;
      delete filter.expiring_soon;
      delete filter.expiringSoon;
    }

    if (base.q) {
      filter.q = base.q;
    }

    return filter;
  }

  public async assertActorCanViewVisit(visit: any, actor: VisitActor) {
    const roles = normalizeRoles(actor.roles ?? []);
    if (isSuperAdmin(roles) || isSuperReception(roles) || isSuperHost(roles)) {
      return;
    }

    if (roles.some(isAdminRole) || roles.some(isReceptionRole)) {
      const officeId = this.requireReceptionOfficeId(actor);
      if (Number(visit.office_id) !== Number(officeId)) {
        throw new AppError(
          "Visit is outside your office scope",
          ErrorCodes.AUTH_FORBIDDEN,
          403,
        );
      }
      return;
    }

    if (roles.some(isHostRole)) {
      const host = await this.hostService.getHostByUserId(actor.id);
      const hostId = Number((host as any).id);
      const isCurrentHost = Number(visit.assigned_host_id ?? visit.TimeSlot?.host_id) === hostId;
      const isPastHost = Array.isArray(visit.assignments) && visit.assignments.some((a: any) => Number(a.host_id) === hostId);

      if (!isCurrentHost && !isPastHost) {
        throw new AppError(
          "This visit is not assigned to you",
          ErrorCodes.AUTH_FORBIDDEN,
          403,
        );
      }
      return;
    }

    if (Number(visit.guest_id) !== Number(actor.id)) {
      throw new AppError(
        "You do not have access to this visit",
        ErrorCodes.AUTH_FORBIDDEN,
        403,
      );
    }
  }

  public async assertActorCanManageVisit(visit: any, actor: VisitActor) {
    const roles = normalizeRoles(actor.roles ?? []);
    if (isSuperAdmin(roles) || isSuperReception(roles) || isSuperHost(roles)) {
      return;
    }

    if (roles.some(isAdminRole) || roles.some(isReceptionRole)) {
      const officeId = this.requireReceptionOfficeId(actor);
      if (Number(visit.office_id) !== Number(officeId)) {
        throw new AppError(
          "Visit is outside your office scope",
          ErrorCodes.AUTH_FORBIDDEN,
          403,
        );
      }
      return;
    }

    if (roles.some(isHostRole)) {
      const host = await this.hostService.getHostByUserId(actor.id);
      const hostId = Number((host as any).id);
      const isCurrentHost = Number(visit.assigned_host_id ?? visit.TimeSlot?.host_id) === hostId;
      const isPastHost = Array.isArray(visit.assignments) && visit.assignments.some((a: any) => Number(a.host_id) === hostId);

      if (!isCurrentHost) {
        if (isPastHost) {
          throw new AppError(
            "This visit was reassigned to another host and can no longer be managed by you.",
            ErrorCodes.AUTH_FORBIDDEN,
            403,
          );
        }
        throw new AppError(
          "This visit is not assigned to you",
          ErrorCodes.AUTH_FORBIDDEN,
          403,
        );
      }
      return;
    }

    throw new AppError(
      "You do not have permission to modify this visit",
      ErrorCodes.AUTH_FORBIDDEN,
      403,
    );
  }

  public requireReceptionOfficeId(actor: VisitActor) {
    return requireActorOfficeId(
      actor,
      "Reception account is missing an office assignment",
    );
  }
}

import { Request, Response } from "express";
import { HostService } from "./host.service";
import { sendPaginated, sendSuccess } from "../../core/utils/helpers";
import { resolveLimit } from "../../core/utils/pagination";
import { hostService as defaultHostService } from "../../composition";

/**
 * Host Controller
 * Handles HTTP requests for host-related staff lookups.
 */
export class HostController {
  private service: HostService;

  constructor(service: HostService = defaultHostService) {
    this.service = service;
  }

  public list = async (req: Request, res: Response): Promise<void> => {
    const query = req.query as Record<string, any>;
    const page = Number(query.page ?? 1);
    // Use resolveLimit: for dropdown-style requests (no page specified), use dropdown mode
    const hasPagination = query.page !== undefined || query.limit !== undefined;
    const limit = resolveLimit(
      query.limit,
      hasPagination ? "paginated" : "dropdown",
    );
    const officeId = query.office_id ? Number(query.office_id) : undefined;
    const departmentId = query.department_id
      ? Number(query.department_id)
      : undefined;
    const userId = query.user_id ? Number(query.user_id) : undefined;
    const activeOn = query.active_on as string | undefined;
    const roles = Array.isArray(query.roles)
      ? query.roles.map(String)
      : typeof query.roles === "string"
        ? [query.roles]
        : undefined;
    const q = typeof query.q === "string" ? query.q.trim() : undefined;
    const sortBy = typeof query.sort_by === "string" ? query.sort_by : "id";
    const sortOrder =
      typeof query.sort_order === "string" ? query.sort_order : "ASC";

    const { data, meta } = await this.service.listHosts(
      {
        id: req.user!.id,
        roles: req.userRoles,
        office_id: req.user?.office_id,
      },
      {
        officeId,
        departmentId,
        userId,
        activeOn,
        roles,
        page,
        limit,
        search: q,
        sortBy,
        sortOrder,
      },
    );

    sendPaginated(res, data, {
      total: meta.total,
      page,
      limit,
      totalPages: Math.ceil(meta.total / limit),
      filters: {
        office_id: officeId ?? null,
        department_id: departmentId ?? null,
        user_id: userId ?? null,
        active_on: activeOn ?? null,
        q: q || null,
      },
      sort: {
        by: sortBy,
        order: sortOrder,
      },
    });
  };

  public get = async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.getHostProfileForActor(
      {
        id: req.user!.id,
        roles: req.userRoles,
        office_id: req.user?.office_id,
      },
      Number(req.params.id),
    );
    sendSuccess(res, result);
  };

  public updateServices = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const { id } = req.params;
    const { service_ids } = req.body;

    await this.service.updateHostServices(
      {
        id: req.user!.id,
        roles: req.userRoles,
        office_id: req.user?.office_id,
      },
      Number(id),
      service_ids,
    );

    sendSuccess(res, { message: "Host services updated successfully" });
  };

  public addServices = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { service_ids } = req.body;

    await this.service.addHostServices(
      {
        id: req.user!.id,
        roles: req.userRoles,
        office_id: req.user?.office_id,
      },
      Number(id),
      service_ids,
    );

    sendSuccess(res, { message: "Host services added successfully" });
  };

  public removeServices = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const { id } = req.params;
    const { service_ids } = req.body || {};

    // Support both single-id param and body array removal
    const paramServiceId = req.params.serviceId
      ? [Number(req.params.serviceId)]
      : [];
    const toRemove =
      Array.isArray(service_ids) && service_ids.length > 0
        ? service_ids.map(Number)
        : paramServiceId;

    await this.service.removeHostServices(
      {
        id: req.user!.id,
        roles: req.userRoles,
        office_id: req.user?.office_id,
      },
      Number(id),
      toRemove,
    );

    sendSuccess(res, { message: "Host services removed successfully" });
  };
}

import { Request, Response } from 'express';
import { DepartmentService } from './department.service';
import { ok, created, sendPaginated } from '../../core/utils/helpers';
import { resolveLimit } from '../../core/utils/pagination';
import { departmentService as defaultDepartmentService } from '../../composition';

/**
 * Department Controller
 * Handles HTTP mapping for department-related endpoints.
 */
export class DepartmentController {
  private service: DepartmentService;

  constructor(service: DepartmentService = defaultDepartmentService) {
    this.service = service;
  }

  public list = async (req: Request, res: Response): Promise<void> => {
    const query = req.query as Record<string, any>;
    const officeId = query.office_id as number | undefined;
    const includeArchived = String(query.include_archived ?? "false") === 'true';
    const page = Number(query.page ?? 1);
    // Use resolveLimit for dropdown data - defaults to DROPDOWN_LIMIT (2000) when no limit specified
    const limit = resolveLimit(query.limit, 'dropdown');
    const q = typeof query.q === "string" ? query.q.trim() : undefined;
    const sortBy = typeof query.sort_by === "string" ? query.sort_by : "name";
    const sortOrder = typeof query.sort_order === "string" ? query.sort_order : "ASC";

    const { data, meta } = await this.service.listDepartments(
      officeId,
      includeArchived,
      {
        id: req.user!.id,
        roles: req.userRoles,
        office_id: req.user?.office_id,
      },
      page,
      limit,
      q,
      sortBy,
      sortOrder
    );
    if (query.page === undefined) {
      res.set("Cache-Control", "private, max-age=60, stale-while-revalidate=300");
    }

    sendPaginated(res, data, {
      total: meta.total,
      page,
      limit,
      totalPages: Math.ceil(meta.total / limit),
      filters: {
        office_id: officeId ?? null,
        include_archived: includeArchived,
        q: q || null,
      },
      sort: {
        by: sortBy,
        order: sortOrder,
      },
    });
  };

  public get = async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as unknown as number;
    const result = await this.service.getDepartment(id, {
      id: req.user!.id,
      roles: req.userRoles,
      office_id: req.user?.office_id,
    });
    ok(res, result);
  };

  public create = async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.createDepartment(req.body, {
      id: req.user!.id,
      roles: req.userRoles,
      office_id: req.user?.office_id,
    });
    created(res, result);
  };

  public update = async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as unknown as number;
    const result = await this.service.updateDepartment(id, req.body, {
      id: req.user!.id,
      roles: req.userRoles,
      office_id: req.user?.office_id,
    });
    ok(res, result);
  };

  public remove = async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as unknown as number;
    const result = await this.service.deleteDepartment(id, {
      id: req.user!.id,
      roles: req.userRoles,
      office_id: req.user?.office_id,
    });
    ok(res, result);
  };

  public restore = async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as unknown as number;
    const result = await this.service.restoreDepartment(id, {
      id: req.user!.id,
      roles: req.userRoles,
      office_id: req.user?.office_id,
    });
    ok(res, result);
  };
}

import { Request, Response } from "express";
import { OfficeService } from "./office.service";
import { ok, created, sendPaginated } from "../../core/utils/helpers";
import { CreateOfficeInput } from "./office.dto";
import { resolveLimit } from "../../core/utils/pagination";
import { officeService as defaultOfficeService } from "../../composition";

export class OfficeController {
  private service: OfficeService;

  constructor(service: OfficeService = defaultOfficeService) {
    this.service = service;
  }

  public listOffices = async (req: Request, res: Response): Promise<void> => {
    const query = req.query as Record<string, any>;
    const includeArchived =
      String(query.include_archived ?? "false") === "true";
    const page = Number(query.page ?? 1);
    // Use resolveLimit for dropdown data - defaults to DROPDOWN_LIMIT (2000) when no limit specified
    const limit = resolveLimit(query.limit, "dropdown");
    const q = typeof query.q === "string" ? query.q.trim() : undefined;
    const sortBy = typeof query.sort_by === "string" ? query.sort_by : "name";
    const sortOrder =
      typeof query.sort_order === "string" ? query.sort_order : "ASC";

    const { data, meta } = await this.service.getOffices(
      includeArchived,
      req.user
        ? {
            id: req.user.id,
            roles: req.userRoles,
            office_id: req.user.office_id,
          }
        : undefined,
      page,
      limit,
      q,
      sortBy,
      sortOrder,
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
        include_archived: includeArchived,
        q: q || null,
      },
      sort: {
        by: sortBy,
        order: sortOrder,
      },
    });
  };

  public getOffice = async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as unknown as number;
    const office = await this.service.getOfficeById(
      id,
      req.user
        ? {
            id: req.user.id,
            roles: req.userRoles,
            office_id: req.user.office_id,
          }
        : undefined,
    );
    ok(res, office);
  };

  public createOffice = async (req: Request, res: Response): Promise<void> => {
    const office = await this.service.createOffice(
      req.body as CreateOfficeInput,
    );
    created(res, office);
  };

  public updateOffice = async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as unknown as number;
    const office = await this.service.updateOffice(id, req.body);
    ok(res, office);
  };

  public archiveOffice = async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as unknown as number;
    const office = await this.service.archiveOffice(id);
    ok(res, office);
  };

  public restoreOffice = async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as unknown as number;
    const office = await this.service.restoreOffice(id);
    ok(res, office);
  };
}

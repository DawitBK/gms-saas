import { Request, Response } from "express";
import { ListServicesInteractor } from "./use-cases/ListServicesInteractor";
import { CreateServiceInteractor } from "./use-cases/CreateServiceInteractor";
import { UpdateServiceInteractor } from "./use-cases/UpdateServiceInteractor";
import { AddServiceHostsInteractor } from "./use-cases/AddServiceHostsInteractor";
import { RemoveServiceHostsInteractor } from "./use-cases/RemoveServiceHostsInteractor";
import { ArchiveServiceInteractor } from "./use-cases/ArchiveServiceInteractor";
import { RestoreServiceInteractor } from "./use-cases/RestoreServiceInteractor";
import { sendPaginated, created, ok } from "../../core/utils/helpers";
import { resolveLimit } from "../../core/utils/pagination";
import { CacheService } from "../../infrastructure/cache/cache.service";
import {
  listServicesInteractor as defaultListServicesInteractor,
  createServiceInteractor as defaultCreateServiceInteractor,
  updateServiceInteractor as defaultUpdateServiceInteractor,
  addServiceHostsInteractor as defaultAddServiceHostsInteractor,
  removeServiceHostsInteractor as defaultRemoveServiceHostsInteractor,
  archiveServiceInteractor as defaultArchiveServiceInteractor,
  restoreServiceInteractor as defaultRestoreServiceInteractor,
} from "../../composition";

/**
 * Service Controller
 * Entry point for visitor service management.
 *
 * DESIGN: Clean Architecture / Use Case (Interactor) Pattern.
 * This controller acts as a thin orchestrator, delegating all domain logic to specific interactors.
 */
export class ServiceController {
  private listInteractor: ListServicesInteractor;
  private createInteractor: CreateServiceInteractor;
  private updateInteractor: UpdateServiceInteractor;
  private addHostsInteractor: AddServiceHostsInteractor;
  private removeHostsInteractor: RemoveServiceHostsInteractor;
  private archiveInteractor: ArchiveServiceInteractor;
  private restoreInteractor: RestoreServiceInteractor;

  constructor(
    listInteractor: ListServicesInteractor = defaultListServicesInteractor,
    createInteractor: CreateServiceInteractor = defaultCreateServiceInteractor,
    updateInteractor: UpdateServiceInteractor = defaultUpdateServiceInteractor,
    addHostsInteractor: AddServiceHostsInteractor = defaultAddServiceHostsInteractor,
    removeHostsInteractor: RemoveServiceHostsInteractor = defaultRemoveServiceHostsInteractor,
    archiveInteractor: ArchiveServiceInteractor = defaultArchiveServiceInteractor,
    restoreInteractor: RestoreServiceInteractor = defaultRestoreServiceInteractor,
  ) {
    this.listInteractor = listInteractor;
    this.createInteractor = createInteractor;
    this.updateInteractor = updateInteractor;
    this.addHostsInteractor = addHostsInteractor;
    this.removeHostsInteractor = removeHostsInteractor;
    this.archiveInteractor = archiveInteractor;
    this.restoreInteractor = restoreInteractor;
  }

  public addHosts = async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const host_ids = req.body?.host_ids ?? [];
    const result = await this.addHostsInteractor.execute(
      id,
      host_ids,
      this.getActor(req),
    );
    await CacheService.delPattern("gms:svcs:*");
    ok(res, result);
  };

  public removeHost = async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const hostId = Number(req.params.hostId);
    const result = await this.removeHostsInteractor.execute(
      id,
      [hostId],
      this.getActor(req),
    );
    await CacheService.delPattern("gms:svcs:*");
    ok(res, result);
  };

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
    const includeArchived =
      String(query.include_archived ?? "false") === "true";

    const q = typeof query.q === "string" ? query.q.trim() : undefined;
    const sortBy = typeof query.sort_by === "string" ? query.sort_by : "name";
    const sortOrder =
      typeof query.sort_order === "string" ? query.sort_order : "ASC";

    const result = await this.listInteractor.execute(
      {
        officeId,
        includeArchived,
        page,
        limit,
        search: q,
        sortBy,
        sortOrder,
      },
      this.getActor(req),
    );
    if (!hasPagination) {
      res.set("Cache-Control", "private, max-age=60, stale-while-revalidate=300");
    }

    sendPaginated(res, result.services, {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      filters: {
        office_id: officeId ?? null,
        include_archived: includeArchived,
        q: q || null,
      },
      sort: { by: sortBy, order: sortOrder },
    });
  };

  public create = async (req: Request, res: Response): Promise<void> => {
    const result = await this.createInteractor.execute(
      req.body,
      this.getActor(req),
    );
    await CacheService.delPattern("gms:svcs:*");
    created(res, result);
  };

  public update = async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const result = await this.updateInteractor.execute(
      id,
      req.body,
      this.getActor(req),
    );
    await CacheService.delPattern("gms:svcs:*");
    ok(res, result);
  };

  public archive = async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const result = await this.archiveInteractor.execute(id, this.getActor(req));
    await CacheService.delPattern("gms:svcs:*");
    ok(res, result);
  };

  public restore = async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const result = await this.restoreInteractor.execute(id, this.getActor(req));
    await CacheService.delPattern("gms:svcs:*");
    ok(res, result);
  };

  /**
   * Maps the express request user to a domain ServiceActor.
   */
  private getActor(req: Request) {
    if (!req.user) return undefined;
    return {
      id: req.user.id,
      roles: req.userRoles,
      office_id: req.user.office_id,
    };
  }
}

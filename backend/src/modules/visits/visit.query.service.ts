import { AppError } from "../../core/errors/AppError";
import { ErrorCodes } from "../../core/errors/errorCodes";
import { mapVisitToDTO } from "./visit.dto";
import { VisitRepository } from "./visit.repository";
import { VisitScopePolicy } from "./visit.scope.policy";
import { VisitActor } from "./visit.types";

export class VisitQueryService {
  private readonly repository: VisitRepository;
  private readonly scopePolicy: VisitScopePolicy;

  constructor(repository?: VisitRepository, scopePolicy?: VisitScopePolicy) {
    this.repository = repository ?? new VisitRepository();
    this.scopePolicy = scopePolicy ?? new VisitScopePolicy();
  }

  public async getVisitById(id: number) {
    const visit = await this.repository.findById(id);
    if (!visit) {
      throw new AppError("Visit block missing or deleted", ErrorCodes.SYSTEM_NOT_FOUND, 404);
    }
    return mapVisitToDTO(visit);
  }

  public async getVisitForActor(id: number, actor: VisitActor) {
    const visit = await this.repository.findById(id);
    if (!visit) {
      throw new AppError("Visit block missing or deleted", ErrorCodes.SYSTEM_NOT_FOUND, 404);
    }

    await this.scopePolicy.assertActorCanViewVisit(visit as any, actor);
    return mapVisitToDTO(visit);
  }

  /**
   * Same authorization check as getVisitForActor, but tolerant of
   * soft-deleted visits. restoreVisit's whole job is to operate on a visit
   * that has ALREADY been soft-deleted, so the paranoid default findById
   * uses would always report "not found" for it and make restore
   * impossible for anyone, in-scope admin or not.
   */
  public async getVisitForActorIncludingDeleted(id: number, actor: VisitActor) {
    const visit = await this.repository.findByIdIncludingDeleted(id);
    if (!visit) {
      throw new AppError("Visit block missing or deleted", ErrorCodes.SYSTEM_NOT_FOUND, 404);
    }

    await this.scopePolicy.assertActorCanViewVisit(visit as any, actor);
    return mapVisitToDTO(visit);
  }

  public async getVisitQrSourceForActor(id: number, actor: VisitActor) {
    const visit = await this.repository.findById(id);
    if (!visit) {
      throw new AppError("Visit block missing or deleted", ErrorCodes.SYSTEM_NOT_FOUND, 404);
    }

    await this.scopePolicy.assertActorCanViewVisit(visit as any, actor);
    const credential = await this.repository.findLatestCredentialByVisitId(id);
    return {
      visit,
      credential,
      metadata: credential?.metadata ?? null,
    };
  }

  /**
   * Core Visit Retrieval & Intelligence
   * Returns a paginated list of visits for the current actor, accompanied by
   * high-fidelity organizational stats. This ensures that even when a user is 
   * paginating through thousands of records, the dashboard charts correctly 
   * reflect the entire dataset rather than just the current page.
   */
  public async listVisits(filter: any, page: number, limit: number) {
    const offset = (page - 1) * limit;
    const { rows, count } = await this.repository.findAllPaginated(
      filter,
      limit,
      offset,
    );

    const statusCounts = await this.repository.countByStatus(filter);
    const summary = (statusCounts as any[]).reduce(
      (acc, curr) => {
        acc[curr.status] = Number(curr.count);
        return acc;
      },
      {} as Record<string, number>,
    );

    const statusDistribution = (statusCounts as any[]).map((s) => ({
      status: s.status,
      count: Number(s.count),
      percent: Math.round((Number(s.count) / Number(count)) * 100),
    }));

    const dailyCounts = await this.repository.countByDay(filter, 7);
    const dailyTrend = (dailyCounts as any[]).map((d) => ({
      day: new Date(d.day).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      count: Number(d.count),
    }));

    return {
      data: rows.map(mapVisitToDTO),
      total: count,
      stats: {
        summary,
        statusDistribution,
        dailyTrend,
      },
    };
  }

  public async buildScopedFilter(
    actor: VisitActor,
    base: Record<string, any> = {},
  ) {
    return this.scopePolicy.buildScopedFilter(actor, base);
  }
}

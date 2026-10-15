import { ServiceRepository } from "../service.repository";
import { normalizeRoles, isAdminRole } from "../../../shared/auth/roles";
import { resolveScopedOfficeId } from "../../../shared/auth/scope-resolver";
import { AppError } from "../../../core/errors/AppError";
import { ErrorCodes } from "../../../core/errors/errorCodes";
import { resolveLimit } from "../../../core/utils/pagination";
import { CacheKeys, CacheService, CACHE_TTL } from "../../../infrastructure/cache/cache.service";

export interface ListServicesOptions {
  officeId?: number;
  page: number;
  limit: number;
  includeArchived?: boolean;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
}

export type ServiceActor = { id: number; roles?: string[]; office_id?: number };

/**
 * ListServicesInteractor
 *
 * Domain-specific use case for retrieving services with multi-tenant scoping
 * and role-based archival visibility.
 */
export class ListServicesInteractor {
  private repository: ServiceRepository;

  constructor() {
    this.repository = new ServiceRepository();
  }

  public async execute(options: ListServicesOptions, actor?: ServiceActor) {
    const page = Math.max(1, Number(options.page || 1));
    // Use resolveLimit to properly handle dropdown vs paginated contexts
    const limit = resolveLimit(options.limit, "dropdown");
    const offset = (page - 1) * limit;
    const scopedOfficeId = resolveScopedOfficeId(actor);
    const sortBy = options.sortBy || "name";
    const sortOrder = options.sortOrder || "ASC";

    // Security: Restrict archived view to admins
    if (
      options.includeArchived &&
      actor &&
      !normalizeRoles(actor.roles ?? []).some(isAdminRole)
    ) {
      throw new AppError(
        "Only admin roles can view archived services",
        ErrorCodes.AUTH_FORBIDDEN,
        403,
      );
    }

    // Multi-tenancy: Ensure office scope is respected
    if (
      scopedOfficeId !== undefined &&
      options.officeId &&
      Number(options.officeId) !== scopedOfficeId
    ) {
      throw new AppError(
        "Service lookup is outside your office scope",
        ErrorCodes.ORG_SCOPE_VIOLATION,
        403,
      );
    }

    const effectiveOfficeId = scopedOfficeId ?? options.officeId;

    const cacheKey = `${CacheKeys.services(effectiveOfficeId, Boolean(options.includeArchived))}:${page}:${limit}:${options.search ?? ""}:${sortBy}:${sortOrder}`;
    const result = await CacheService.remember(cacheKey, CACHE_TTL.SERVICES, async () =>
      effectiveOfficeId
        ? this.repository.findByOfficePaginated(
            effectiveOfficeId,
            limit,
            offset,
            options.includeArchived,
            options.search,
            sortBy,
            sortOrder,
          )
        : this.repository.findAllPaginated(
            limit,
            offset,
            options.includeArchived,
            options.search,
            sortBy,
            sortOrder,
          )
    );

    return {
      services: result.rows,
      total: result.count,
      page,
      limit,
      totalPages: Math.ceil(result.count / limit),
    };
  }
}

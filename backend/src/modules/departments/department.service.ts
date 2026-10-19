import { DepartmentRepository } from "./department.repository";
import { AppError } from "../../core/errors/AppError";
import { ErrorCodes } from "../../core/errors/errorCodes";
import { isAdminRole, normalizeRoles } from "../../shared/auth/roles";
import { resolveScopedOfficeId } from "../../shared/auth/scope-resolver";
import { logAudit } from "../../shared/services/audit.service";
import { CacheKeys, CacheService, CACHE_TTL } from "../../infrastructure/cache/cache.service";

type DepartmentActor = { id: number; roles?: string[]; office_id?: number };

/**
 * Department Service
 * Orchestrates business logic for office departments.
 */
export class DepartmentService {
  private repository: DepartmentRepository;

  constructor() {
    this.repository = new DepartmentRepository();
  }

  public async listDepartments(
    officeId?: number,
    includeArchived = false,
    actor?: DepartmentActor,
    page = 1,
    limit = 10000,
    search?: string,
    sortBy = "name",
    sortOrder = "ASC",
  ) {
    const scopedOfficeId = resolveScopedOfficeId(actor);
    if (
      includeArchived &&
      actor &&
      !normalizeRoles(actor.roles ?? []).some(isAdminRole)
    ) {
      throw new AppError(
        "Only admin roles can view archived departments",
        ErrorCodes.AUTH_FORBIDDEN,
        403,
      );
    }

    const effectiveOfficeId = scopedOfficeId ?? officeId;
    if (
      scopedOfficeId !== undefined &&
      officeId &&
      Number(officeId) !== scopedOfficeId
    ) {
      throw new AppError(
        "Department lookup is outside your office scope",
        ErrorCodes.AUTH_FORBIDDEN,
        403,
      );
    }

    const cacheKey = `${CacheKeys.departments(effectiveOfficeId, includeArchived)}:${page}:${limit}:${search ?? ""}:${sortBy}:${sortOrder}`;
    const { rows, count } = await CacheService.remember(cacheKey, CACHE_TTL.DEPARTMENTS, async () =>
      effectiveOfficeId
        ? this.repository.findByOffice(
            effectiveOfficeId,
            includeArchived,
            page,
            limit,
            search,
            sortBy,
            sortOrder,
          )
        : this.repository.findAll(
            includeArchived,
            page,
            limit,
            search,
            sortBy,
            sortOrder,
          )
    );

    return {
      data: rows,
      meta: { total: count },
    };
  }

  public async getDepartment(id: number, actor?: DepartmentActor) {
    const dept = await this.repository.findById(id);
    if (!dept)
      throw new AppError(
        "Department not found",
        ErrorCodes.SYSTEM_NOT_FOUND,
        404,
      );
    this.assertDepartmentInScope(actor, Number((dept as any).office_id));
    return dept;
  }

  public async createDepartment(data: any, actor?: DepartmentActor) {
    const effectiveOfficeId = this.resolveWriteOfficeId(actor, data.office_id);
    const dept = await this.repository.create({
      ...data,
      office_id: effectiveOfficeId,
    });
    if (!dept)
      throw new AppError(
        "Department not found",
        ErrorCodes.SYSTEM_NOT_FOUND,
        404,
      );
    await logAudit(
      actor?.id || null,
      "DEPARTMENT_CREATE",
      "Department",
      dept.id,
      null,
      data,
    );
    await CacheService.delPattern("gms:depts:*");
    return dept;
  }

  public async updateDepartment(
    id: number,
    data: any,
    actor?: DepartmentActor,
  ) {
    const existing = await this.repository.findById(id);
    if (!existing)
      throw new AppError(
        "Department not found",
        ErrorCodes.SYSTEM_NOT_FOUND,
        404,
      );
    this.assertDepartmentInScope(actor, Number((existing as any).office_id));

    const effectiveOfficeId = this.resolveWriteOfficeId(
      actor,
      data.office_id ?? (existing as any).office_id,
    );
    const dept = await this.repository.update(id, {
      ...data,
      office_id: effectiveOfficeId,
    });
    if (!dept)
      throw new AppError(
        "Department not found",
        ErrorCodes.SYSTEM_NOT_FOUND,
        404,
      );
    await logAudit(
      actor?.id || null,
      "DEPARTMENT_UPDATE",
      "Department",
      dept.id,
      null,
      data,
    );
    await CacheService.delPattern("gms:depts:*");
    return dept;
  }

  public async deleteDepartment(id: number, actor?: DepartmentActor) {
    const dept = await this.repository.findById(id);
    if (!dept)
      throw new AppError(
        "Department not found",
        ErrorCodes.SYSTEM_NOT_FOUND,
        404,
      );
    this.assertDepartmentInScope(actor, Number((dept as any).office_id));

    const deleted = await this.repository.delete(id);
    if (!deleted)
      throw new AppError(
        "Department not found",
        ErrorCodes.SYSTEM_NOT_FOUND,
        404,
      );
    await logAudit(
      actor?.id || null,
      "DEPARTMENT_ARCHIVE",
      "Department",
      id,
      {
        name: (dept as any).name,
        office_id: (dept as any).office_id ?? null,
      },
      { archived: true },
    );
    await CacheService.delPattern("gms:depts:*");
    return { deleted: true };
  }

  public async restoreDepartment(id: number, actor?: DepartmentActor) {
    const dept = await this.repository.findById(id, true);
    if (!dept)
      throw new AppError(
        "Department not found",
        ErrorCodes.SYSTEM_NOT_FOUND,
        404,
      );
    this.assertDepartmentInScope(actor, Number((dept as any).office_id));

    const restored = await this.repository.restore(id);
    if (!restored)
      throw new AppError(
        "Department not found",
        ErrorCodes.SYSTEM_NOT_FOUND,
        404,
      );
    await logAudit(
      actor?.id || null,
      "DEPARTMENT_RESTORE",
      "Department",
      id,
      { archived: true },
      {
        name: (dept as any).name,
        office_id: (dept as any).office_id ?? null,
        archived: false,
      },
    );
    await CacheService.delPattern("gms:depts:*");
    return { restored: true };
  }

  private resolveWriteOfficeId(
    actor: DepartmentActor | undefined,
    officeId?: number,
  ) {
    const scopedOfficeId = resolveScopedOfficeId(actor);
    if (scopedOfficeId !== undefined) {
      if (officeId && Number(officeId) !== scopedOfficeId) {
        throw new AppError(
          "Department changes are outside your office scope",
          ErrorCodes.AUTH_FORBIDDEN,
          403,
        );
      }
      return scopedOfficeId;
    }

    const normalized = Number(officeId);
    if (!Number.isFinite(normalized) || normalized <= 0) {
      throw new AppError(
        "A valid office_id is required for department changes",
        ErrorCodes.INVALID_INPUT,
        400,
      );
    }

    return normalized;
  }

  private assertDepartmentInScope(
    actor: DepartmentActor | undefined,
    officeId: number,
  ) {
    const scopedOfficeId = resolveScopedOfficeId(actor);
    if (scopedOfficeId !== undefined && Number(officeId) !== scopedOfficeId) {
      throw new AppError(
        "That department is outside your office scope",
        ErrorCodes.AUTH_FORBIDDEN,
        403,
      );
    }
  }
}

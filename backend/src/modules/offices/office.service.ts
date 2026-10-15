import { OfficeRepository } from './office.repository';
import { AppError } from '../../core/errors/AppError';
import { ErrorCodes } from '../../core/errors/errorCodes';
import { mapOfficeToDTO, CreateOfficeInput, OfficeDTO, UpdateOfficeInput } from './office.dto';
import { resolveScopedOfficeId } from '../../shared/auth/scope-resolver';
import { logAudit } from '../../shared/services/audit.service';
import { CacheKeys, CacheService, CACHE_TTL } from '../../infrastructure/cache/cache.service';

type OfficeActor = { id: number; roles?: string[]; office_id?: number };

export class OfficeService {
  private repository: OfficeRepository;

  constructor() {
    this.repository = new OfficeRepository();
  }

  public async getOffices(
    includeArchived = false,
    actor?: OfficeActor,
    page = 1,
    limit = 10000,
    search?: string,
    sortBy = "name",
    sortOrder = "ASC"
  ): Promise<{ data: OfficeDTO[], meta: { total: number } }> {
    const scopedOfficeId = resolveScopedOfficeId(actor);
    if (includeArchived && scopedOfficeId !== undefined) {
      throw new AppError('Only super_admin can view archived offices', ErrorCodes.AUTH_FORBIDDEN, 403);
    }

    const cacheKey = scopedOfficeId !== undefined
      ? `${CacheKeys.offices(includeArchived)}:scope:${scopedOfficeId}:${page}:${limit}:${search ?? ""}:${sortBy}:${sortOrder}`
      : `${CacheKeys.offices(includeArchived)}:${page}:${limit}:${search ?? ""}:${sortBy}:${sortOrder}`;

    const { rows, count } = await CacheService.remember(cacheKey, CACHE_TTL.OFFICES, async () =>
      scopedOfficeId !== undefined
        ? this.repository.findByIds([scopedOfficeId], includeArchived, page, limit, search, sortBy, sortOrder)
        : this.repository.findAll(includeArchived, page, limit, search, sortBy, sortOrder)
    );

    return {
      data: rows.map(mapOfficeToDTO),
      meta: { total: count },
    };
  }

  public async getOfficeById(id: number, actor?: OfficeActor): Promise<OfficeDTO> {
    const scopedOfficeId = resolveScopedOfficeId(actor);
    if (scopedOfficeId !== undefined && Number(id) !== scopedOfficeId) {
      throw new AppError('That office is outside your office scope', ErrorCodes.AUTH_FORBIDDEN, 403);
    }

    const office = await this.repository.findById(id);
    if (!office) throw new AppError('Office not found', ErrorCodes.SYSTEM_NOT_FOUND, 404);
    return mapOfficeToDTO(office);
  }

  public async createOffice(data: CreateOfficeInput, actor?: OfficeActor): Promise<OfficeDTO> {
    const office = await this.repository.create(data);
    await CacheService.delPattern('gms:offices:*');
    await logAudit(actor?.id || null, 'OFFICE_CREATE', 'Office', office.id, null, data);
    return mapOfficeToDTO(office);
  }

  public async updateOffice(id: number, data: UpdateOfficeInput, actor?: OfficeActor): Promise<OfficeDTO> {
    const office = await this.repository.update(id, data);
    if (!office) throw new AppError('Office not found', ErrorCodes.SYSTEM_NOT_FOUND, 404);
    await CacheService.delPattern('gms:offices:*');
    await CacheService.del(CacheKeys.officeById(Number(id)));
    await logAudit(actor?.id || null, 'OFFICE_UPDATE', 'Office', office.id, null, data);
    return mapOfficeToDTO(office);
  }

  public async archiveOffice(id: number): Promise<OfficeDTO> {
    const office = await this.repository.softDelete(id);
    if (!office) throw new AppError('Office not found', ErrorCodes.SYSTEM_NOT_FOUND, 404);
    await CacheService.delPattern('gms:offices:*');
    await CacheService.del(CacheKeys.officeById(Number(id)));
    return mapOfficeToDTO(office);
  }

  public async restoreOffice(id: number): Promise<OfficeDTO> {
    const office = await this.repository.restore(id);
    if (!office) throw new AppError('Office not found', ErrorCodes.SYSTEM_NOT_FOUND, 404);
    await CacheService.delPattern('gms:offices:*');
    await CacheService.del(CacheKeys.officeById(Number(id)));
    return mapOfficeToDTO(office);
  }

}

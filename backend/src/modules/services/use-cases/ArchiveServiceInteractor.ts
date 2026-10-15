import { ServiceRepository } from '../service.repository';
import { resolveScopedOfficeId } from '../../../shared/auth/scope-resolver';
import { AppError } from '../../../core/errors/AppError';
import { ErrorCodes } from '../../../core/errors/errorCodes';

export type ServiceActor = { id: number; roles?: string[]; office_id?: number };

/**
 * ArchiveServiceInteractor
 * 
 * Domain-specific use case for soft-deleting a service.
 */
export class ArchiveServiceInteractor {
  private repository: ServiceRepository;

  constructor() {
    this.repository = new ServiceRepository();
  }

  public async execute(id: number, actor?: ServiceActor) {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new AppError('Service not found', ErrorCodes.SYSTEM_NOT_FOUND, 404);
    }

    const scopedOfficeId = resolveScopedOfficeId(actor);
    if (scopedOfficeId !== undefined && Number((existing as any).office_id) !== scopedOfficeId) {
      throw new AppError('That service is outside your office scope', ErrorCodes.ORG_SCOPE_VIOLATION, 403);
    }

    const result = await this.repository.softDelete(id);
    if (!result) {
      throw new AppError('Archive operation failed', ErrorCodes.SYSTEM_DATABASE_ERROR, 500);
    }

    return { archived: true };
  }
}

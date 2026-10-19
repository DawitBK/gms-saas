import { ServiceRepository } from '../service.repository';
import { resolveScopedOfficeId } from '../../../shared/auth/scope-resolver';
import { AppError } from '../../../core/errors/AppError';
import { ErrorCodes } from '../../../core/errors/errorCodes';
import { logAudit } from '../../../shared/services/audit.service';

export type ServiceActor = { id: number; roles?: string[]; office_id?: number };

/**
 * RestoreServiceInteractor
 * 
 * Domain-specific use case for restoring an archived service.
 */
export class RestoreServiceInteractor {
  private repository: ServiceRepository;

  constructor() {
    this.repository = new ServiceRepository();
  }

  public async execute(id: number, actor?: ServiceActor) {
    const existing = await this.repository.findById(id, true);
    if (!existing) {
      throw new AppError('Service not found', ErrorCodes.SYSTEM_NOT_FOUND, 404);
    }

    const scopedOfficeId = resolveScopedOfficeId(actor);
    if (scopedOfficeId !== undefined && Number((existing as any).office_id) !== scopedOfficeId) {
      throw new AppError('That service is outside your office scope', ErrorCodes.ORG_SCOPE_VIOLATION, 403);
    }

    const result = await this.repository.restore(id);
    if (!result) {
      throw new AppError('Restore operation failed', ErrorCodes.SYSTEM_DATABASE_ERROR, 500);
    }

    await logAudit(
      actor?.id ?? null,
      'SERVICE_RESTORE',
      'Service',
      id,
      { archived: true },
      { name: (existing as any).name, office_id: (existing as any).office_id ?? null, archived: false },
    );

    return { restored: true };
  }
}

import { ServiceRepository } from '../service.repository';
import { resolveScopedOfficeId } from '../../../shared/auth/scope-resolver';
import { AppError } from '../../../core/errors/AppError';
import { ErrorCodes } from '../../../core/errors/errorCodes';

export type ServiceActor = { id: number; roles?: string[]; office_id?: number };

/**
 * UpdateServiceInteractor
 * 
 * Domain-specific use case for modifying an existing service.
 * Enforces office scoping and ensures the service exists before modification.
 */
export class UpdateServiceInteractor {
  private repository: ServiceRepository;

  constructor() {
    this.repository = new ServiceRepository();
  }

  public async execute(id: number, data: any, actor?: ServiceActor) {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new AppError('Service not found', ErrorCodes.SYSTEM_NOT_FOUND, 404);
    }

    this.assertServiceInScope(actor, Number((existing as any).office_id));

    // Determine the office_id for the updated record (scoped admins can't move services out of their office)
    const effectiveOfficeId = this.resolveWriteOfficeId(actor, data.office_id ?? (existing as any).office_id);

    const service = await this.repository.update(id, { ...data, office_id: effectiveOfficeId });
    if (!service) {
      throw new AppError('Service update failed', ErrorCodes.SYSTEM_DATABASE_ERROR, 500);
    }

    return service;
  }

  private resolveWriteOfficeId(actor: ServiceActor | undefined, officeId?: number) {
    const scopedOfficeId = resolveScopedOfficeId(actor);
    if (scopedOfficeId !== undefined) {
      if (officeId && Number(officeId) !== scopedOfficeId) {
        throw new AppError('Service changes are outside your office scope', ErrorCodes.ORG_SCOPE_VIOLATION, 403);
      }
      return scopedOfficeId;
    }
    return Number(officeId);
  }

  private assertServiceInScope(actor: ServiceActor | undefined, officeId: number) {
    const scopedOfficeId = resolveScopedOfficeId(actor);
    if (scopedOfficeId !== undefined && Number(officeId) !== scopedOfficeId) {
      throw new AppError('That service is outside your office scope', ErrorCodes.ORG_SCOPE_VIOLATION, 403);
    }
  }
}

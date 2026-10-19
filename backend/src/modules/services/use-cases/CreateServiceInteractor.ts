import { ServiceRepository } from '../service.repository';
import { resolveScopedOfficeId } from '../../../shared/auth/scope-resolver';
import { AppError } from '../../../core/errors/AppError';
import { ErrorCodes } from '../../../core/errors/errorCodes';
import { logAudit } from '../../../shared/services/audit.service';

export type ServiceActor = { id: number; roles?: string[]; office_id?: number };

/**
 * CreateServiceInteractor
 * 
 * Domain-specific use case for creating a new service record.
 * Handles automatic office assignment for scoped admins.
 */
export class CreateServiceInteractor {
  private repository: ServiceRepository;

  constructor() {
    this.repository = new ServiceRepository();
  }

  public async execute(data: any, actor?: ServiceActor) {
    const effectiveOfficeId = this.resolveWriteOfficeId(actor, data.office_id);
    
    // The repository already has associations loaded in the create response
    const payload = { ...data, office_id: effectiveOfficeId };
    const service = await this.repository.create(payload);

    // The repository owns its own transaction, so this is a best-effort
    // after-the-fact row (same as every other non-transactional call site).
    await logAudit(actor?.id ?? null, 'SERVICE_CREATE', 'Service', (service as any).id, null, payload);

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

    const normalized = Number(officeId);
    if (!Number.isFinite(normalized) || normalized <= 0) {
      throw new AppError('A valid office_id is required for service changes', ErrorCodes.INVALID_INPUT, 400);
    }

    return normalized;
  }
}

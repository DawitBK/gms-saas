import { ServiceRepository } from '../service.repository';
import { resolveScopedOfficeId } from '../../../shared/auth/scope-resolver';
import { AppError } from '../../../core/errors/AppError';
import { ErrorCodes } from '../../../core/errors/errorCodes';

export type ServiceActor = { id: number; roles?: string[]; office_id?: number };

export class AddServiceHostsInteractor {
  private repository: ServiceRepository;

  constructor() {
    this.repository = new ServiceRepository();
  }

  public async execute(id: number, hostIds: number[], actor?: ServiceActor) {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new AppError('Service not found', ErrorCodes.SYSTEM_NOT_FOUND, 404);
    }

    this.assertServiceInScope(actor, Number((existing as any).office_id));

    const service = await this.repository.addHosts(id, hostIds);
    if (!service) {
      throw new AppError('Failed to add hosts to service', ErrorCodes.SYSTEM_DATABASE_ERROR, 500);
    }

    return service;
  }

  private assertServiceInScope(actor: ServiceActor | undefined, officeId: number) {
    const scopedOfficeId = resolveScopedOfficeId(actor);
    if (scopedOfficeId !== undefined && Number(officeId) !== scopedOfficeId) {
      throw new AppError('That service is outside your office scope', ErrorCodes.ORG_SCOPE_VIOLATION, 403);
    }
  }
}

import { Request, Response } from 'express';
import { sendSuccess } from '../../core/utils/helpers';
import { CredentialService } from './credential.service';
import { credentialService as defaultCredentialService } from '../../composition';

export class CredentialController {
  private credentialService: CredentialService;

  constructor(credentialService: CredentialService = defaultCredentialService) {
    this.credentialService = credentialService;
  }

  public listForVisit = async (req: Request, res: Response): Promise<void> => {
    const result = await this.credentialService.listVisitCredentialsForActor(Number(req.params.visitId), {
      id: req.user!.id,
      roles: req.userRoles,
      office_id: req.user?.office_id,
    });
    sendSuccess(res, result);
  };

  public revokeForVisit = async (req: Request, res: Response): Promise<void> => {
    const result = await this.credentialService.revokeVisitCredentials(
      Number(req.params.visitId),
      req.user!.id,
      req.body?.reason,
      // Office/assignment scoping — see assertActorMayAccessVisitCredentials.
      { id: req.user!.id, roles: req.userRoles, office_id: req.user?.office_id },
    );
    sendSuccess(res, result);
  };

  public manualFallback = async (req: Request, res: Response): Promise<void> => {
    const result = await this.credentialService.provisionFallbackQr(
      Number(req.params.visitId),
      req.user!.id,
      { id: req.user!.id, roles: req.userRoles, office_id: req.user?.office_id },
    );
    sendSuccess(res, result);
  };
}

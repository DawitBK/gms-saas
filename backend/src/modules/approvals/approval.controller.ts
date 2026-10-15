import { Request, Response } from 'express';
import { sendSuccess } from '../../core/utils/helpers';
import { ApprovalService } from './approval.service';
import { approvalService as defaultApprovalService } from '../../composition';

export class ApprovalController {
  private approvalService: ApprovalService;

  constructor(approvalService: ApprovalService = defaultApprovalService) {
    this.approvalService = approvalService;
  }

  public decide = async (req: Request, res: Response): Promise<void> => {
    const result = await this.approvalService.decideVisit(
      Number(req.params.visitId),
      {
        id: req.user!.id,
        roles: req.userRoles,
        office_id: req.user?.office_id,
      },
      req.body
    );
    sendSuccess(res, result);
  };

  public listForVisit = async (req: Request, res: Response): Promise<void> => {
    const result = await this.approvalService.listVisitApprovals(Number(req.params.visitId), {
      id: req.user!.id,
      roles: req.userRoles,
      office_id: req.user?.office_id,
    });
    sendSuccess(res, result);
  };
}

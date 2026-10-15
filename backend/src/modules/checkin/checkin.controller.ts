import { Request, Response } from 'express';
import { CheckinService } from './checkin.service';
import { sendSuccess } from '../../core/utils/helpers';
import { checkinService as defaultCheckinService } from '../../composition';

export class CheckinController {
  private service: CheckinService;

  constructor(service: CheckinService = defaultCheckinService) {
    this.service = service;
  }

  public checkin = async (req: Request, res: Response): Promise<void> => {
    const { qr_code, manual_override, verification_metadata } = req.body;
    const result = await this.service.checkinByQr(
      qr_code,
      {
        id: req.user!.id,
        roles: req.userRoles,
        office_id: req.user?.office_id,
      },
      {
        manual_override,
        verification_metadata,
      }
    );
    sendSuccess(res, result);
  };

  public manualCheckin = async (req: Request, res: Response): Promise<void> => {
    const { visitId, notes } = req.body;
    const result = await this.service.manualCheckin(
      Number(visitId),
      {
        id: req.user!.id,
        roles: req.userRoles,
        office_id: req.user?.office_id,
      },
      { notes }
    );
    sendSuccess(res, result);
  };
}

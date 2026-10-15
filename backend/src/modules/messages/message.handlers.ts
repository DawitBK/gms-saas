import { Request, Response } from 'express';
import { sendSuccess } from '../../core/utils/helpers';
import * as messageService from './message.service';

export async function listVisitMessages(req: Request, res: Response): Promise<void> {
  const visitId = Number(req.params.id);
  const rows = await messageService.listMessagesForVisitActor(visitId, req.user!, req.userRoles!);
  sendSuccess(res, rows);
}

export async function postVisitMessage(req: Request, res: Response): Promise<void> {
  const visitId = Number(req.params.id);
  const { content } = req.body as { content: string };
  const created = await messageService.postMessageForVisitActor(visitId, req.user!, req.userRoles!, content);
  sendSuccess(res, created, 201);
}

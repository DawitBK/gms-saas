import { Request, Response } from 'express';
import { sendSuccess } from '../../core/utils/helpers';
import { UniFiWebhookService } from './unifi-webhook.service';
import { uniFiWebhookService as defaultUniFiWebhookService } from '../../composition';

export class UniFiWebhookController {
  private service: UniFiWebhookService;

  constructor(service: UniFiWebhookService = defaultUniFiWebhookService) {
    this.service = service;
  }

  public handle = async (req: Request, res: Response) => {
    const legacySecret = req.headers['x-unifi-webhook-secret'] as string | undefined;
    const signatureHeader =
      (req.headers['signature'] || req.headers['x-unifi-signature'] || req.headers['x-signature'] || req.headers['x-hub-signature']) as
        | string
        | undefined;
    const rawBody = (req as any).rawBody ?? Buffer.from(JSON.stringify(req.body));

    const result = await this.service.processWebhook(legacySecret, req.body, rawBody, signatureHeader);
    sendSuccess(res, result);
  };
}

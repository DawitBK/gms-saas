import { Router } from 'express';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { validateRequest } from '../../shared/middleware/validateRequest';
import { UniFiWebhookController } from './unifi-webhook.controller';
import { unifiWebhookSchema } from './unifi-webhook.schema';

const router = Router();
const controller = new UniFiWebhookController();

router.post('/webhooks/access', validateRequest(unifiWebhookSchema), asyncHandler(controller.handle));

export default router;

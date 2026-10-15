import { Router } from 'express';
import { NotificationController } from './notification.controller';
import { requireAuth } from '../../shared/middleware/auth.middleware';
import { authenticatedUserLimiter } from '../../shared/middleware/rateLimiter';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { validateRequest } from '../../shared/middleware/validateRequest';
import { collectionQuerySchema, idParamSchema } from '../../core/utils/shared.schema';

const router = Router();
const controller = new NotificationController();

router.get('/vapid-public-key', asyncHandler(controller.vapidPublicKey));

router.use(requireAuth, authenticatedUserLimiter);

// The only list route in the codebase that had no validateRequest at all —
// page and limit reached the controller as arbitrary strings.
router.get('/', validateRequest(collectionQuerySchema), asyncHandler(controller.list));
router.post('/push-subscription', asyncHandler(controller.savePushSubscription));
router.delete('/push-subscription', asyncHandler(controller.deletePushSubscription));
router.post('/read-all', asyncHandler(controller.markAllRead));
router.post('/:id/read', validateRequest(idParamSchema), asyncHandler(controller.markRead));

export default router;

import { Router } from 'express';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { requireAuth } from '../../shared/middleware/auth.middleware';
import { authenticatedUserLimiter } from '../../shared/middleware/rateLimiter';
import { requireRole } from '../../shared/middleware/rbac.middleware';
import { validateRequest } from '../../shared/middleware/validateRequest';
import { GuestController } from './guest.controller';
import {
  updateManagedGuestProfileSchema,
  updateOwnGuestProfileSchema,
} from './guest.schema';
import { bulkImportSchema } from '../../core/utils/bulk-import.schema';
import { collectionQuerySchema, idParamSchema } from '../../core/utils/shared.schema';

const router = Router();
const controller = new GuestController();
router.use(requireAuth, authenticatedUserLimiter);
router.get('/me', asyncHandler(controller.getOwnProfile));
router.patch('/me', validateRequest(updateOwnGuestProfileSchema), asyncHandler(controller.updateOwnProfile));
router.get('/:id', requireRole(['admin', 'reception', 'host']), validateRequest(idParamSchema), asyncHandler(controller.getGuestProfile));
router.patch('/:id', requireRole(['admin', 'reception']), validateRequest(idParamSchema), validateRequest(updateManagedGuestProfileSchema), asyncHandler(controller.updateGuestProfile));
router.get('/', requireRole(['admin', 'reception', 'host']), validateRequest(collectionQuerySchema), asyncHandler(controller.listGuests));
router.post('/bulk-import', requireRole(['admin']), validateRequest(bulkImportSchema), asyncHandler(controller.bulkImport));

export default router;

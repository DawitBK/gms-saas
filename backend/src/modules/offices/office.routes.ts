import { Router } from 'express';
import { OfficeController } from './office.controller';
import { optionalAuth, requireAuth } from '../../shared/middleware/auth.middleware';
import { requireRole } from '../../shared/middleware/rbac.middleware';
import { validateRequest } from '../../shared/middleware/validateRequest';
import { createOfficeSchema, updateOfficeSchema } from './office.schema';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { idParamSchema, paginationQuerySchema } from '../../core/utils/shared.schema';

const router = Router();
const controller = new OfficeController();

// Allow public access to list and view offices (booking page needs this without auth)
router.get(
  '/', 
  optionalAuth, 
  validateRequest(paginationQuerySchema),
  asyncHandler(controller.listOffices)
);

router.get(
  '/:id', 
  optionalAuth, 
  validateRequest(idParamSchema),
  asyncHandler(controller.getOffice)
);

// Only super admins can manage office records globally.
router.post(
  '/', 
  requireAuth, 
  requireRole(['super_admin']), 
  validateRequest(createOfficeSchema), 
  asyncHandler(controller.createOffice)
);

router.patch(
  '/:id', 
  requireAuth, 
  requireRole(['super_admin']), 
  validateRequest(idParamSchema.merge(updateOfficeSchema)), 
  asyncHandler(controller.updateOffice)
);

router.delete(
  '/:id', 
  requireAuth, 
  requireRole(['super_admin']), 
  validateRequest(idParamSchema),
  asyncHandler(controller.archiveOffice)
);

router.post(
  '/:id/restore', 
  requireAuth, 
  requireRole(['super_admin']), 
  validateRequest(idParamSchema),
  asyncHandler(controller.restoreOffice)
);

export default router;

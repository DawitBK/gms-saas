import { Router } from 'express';
import { DepartmentController } from './department.controller';
import { requireAuth } from '../../shared/middleware/auth.middleware';
import { authenticatedUserLimiter } from '../../shared/middleware/rateLimiter';
import { requireRole } from '../../shared/middleware/rbac.middleware';
import { createDepartmentSchema, updateDepartmentSchema } from './department.schema';
import { validateRequest } from '../../shared/middleware/validateRequest';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { idParamSchema, paginationQuerySchema } from '../../core/utils/shared.schema';

const router = Router();
const controller = new DepartmentController();

router.use(requireAuth, authenticatedUserLimiter);

router.get(
  '/', 
  validateRequest(paginationQuerySchema),
  asyncHandler(controller.list)
);

router.get(
  '/:id', 
  validateRequest(idParamSchema),
  asyncHandler(controller.get)
);

// Restrictions: Only admins can manage departments, reception can list
router.post(
  '/', 
  requireRole(['admin']), 
  validateRequest(createDepartmentSchema), 
  asyncHandler(controller.create)
);

router.patch(
  '/:id', 
  requireRole(['admin']), 
  validateRequest(idParamSchema.merge(updateDepartmentSchema)), 
  asyncHandler(controller.update)
);

router.delete(
  '/:id', 
  requireRole(['admin']), 
  validateRequest(idParamSchema),
  asyncHandler(controller.remove)
);

router.post(
  '/:id/restore', 
  requireRole(['admin']), 
  validateRequest(idParamSchema),
  asyncHandler(controller.restore)
);

export default router;

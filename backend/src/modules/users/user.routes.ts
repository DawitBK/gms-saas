/**
 * User Routes
 * 
 * Defines routing for all user management endpoints. Ensures all user operations 
 * are protected by authentication, and applies role-based access control (RBAC) 
 * for administrative functions.
 */
import { Router } from 'express';
import { UserController } from './user.controller';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { requireAuth } from '../../shared/middleware/auth.middleware';
import { authenticatedUserLimiter } from '../../shared/middleware/rateLimiter';
import { requireRole } from '../../shared/middleware/rbac.middleware';
import { validateRequest } from '../../shared/middleware/validateRequest';
import { createUserSchema, updateUserSchema, setRolesSchema } from './user.schema';
import { bulkImportSchema } from '../../core/utils/bulk-import.schema';
import { idParamSchema, paginationQuerySchema } from '../../core/utils/shared.schema';

const router = Router();
const controller = new UserController();

// All user endpoints strictly require authentication limits
router.use(requireAuth, authenticatedUserLimiter);

router.get('/profile', asyncHandler(controller.getProfile));

// Administrator access bounds securely
router.post(
  '/', 
  requireRole(['admin']), 
  validateRequest(createUserSchema), 
  asyncHandler(controller.createUser)
);

router.patch(
  '/:id', 
  requireRole(['admin']), 
  validateRequest(idParamSchema.merge(updateUserSchema)), 
  asyncHandler(controller.updateUser)
);

router.get(
  '/', 
  requireRole(['admin']), 
  validateRequest(paginationQuerySchema), 
  asyncHandler(controller.listUsers)
);

router.get(
  '/:id', 
  requireRole(['admin', 'reception']), 
  validateRequest(idParamSchema), 
  asyncHandler(controller.getUserById)
);

router.delete(
  '/:id', 
  requireRole(['admin']), 
  validateRequest(idParamSchema), 
  asyncHandler(controller.softDeleteUser)
);

router.post(
  '/:id/restore', 
  requireRole(['admin']), 
  validateRequest(idParamSchema), 
  asyncHandler(controller.restoreUser)
);

router.post(
  '/:id/roles', 
  requireRole(['admin']), 
  validateRequest(idParamSchema.merge(setRolesSchema)), 
  asyncHandler(controller.setRoles)
);

router.post(
  '/bulk-import',
  requireRole(['admin']),
  validateRequest(bulkImportSchema),
  asyncHandler(controller.bulkImport)
);

export default router;

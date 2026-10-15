import { Router } from 'express';
import { ServiceController } from './service.controller';
import { optionalAuth, requireAuth } from '../../shared/middleware/auth.middleware';
import { requireRole } from '../../shared/middleware/rbac.middleware';
import { createServiceSchema, updateServiceSchema } from './service.schema';
import { z } from 'zod';
import { validateRequest } from '../../shared/middleware/validateRequest';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { idParamSchema, paginationQuerySchema } from '../../core/utils/shared.schema';

const router = Router();
const controller = new ServiceController();

// Public listing of services (supports optional office_id filter)
router.get(
  '/', 
  optionalAuth, 
  validateRequest(paginationQuerySchema),
  asyncHandler(controller.list)
);

// Only system admins can create or delete services globally
router.post(
  '/', 
  requireAuth, 
  requireRole(['admin']), 
  validateRequest(createServiceSchema), 
  asyncHandler(controller.create)
);

router.patch(
  '/:id', 
  requireAuth, 
  requireRole(['admin']), 
  validateRequest(idParamSchema.merge(updateServiceSchema)), 
  asyncHandler(controller.update)
);

router.delete(
  '/:id', 
  requireAuth, 
  requireRole(['admin']), 
  validateRequest(idParamSchema),
  asyncHandler(controller.archive)
);

router.post(
  '/:id/restore', 
  requireAuth, 
  requireRole(['admin']), 
  validateRequest(idParamSchema),
  asyncHandler(controller.restore)
);

// Add hosts to a service (idempotent)
router.post(
  '/:id/hosts',
  requireAuth,
  requireRole(['admin']),
  validateRequest(idParamSchema.merge(z.object({ body: z.object({ host_ids: z.array(z.coerce.number()) }) }))),
  asyncHandler(controller.addHosts),
);

// Remove a host association from a service
router.delete(
  '/:id/hosts/:hostId',
  requireAuth,
  requireRole(['admin']),
  validateRequest(idParamSchema.merge(z.object({ params: z.object({ hostId: z.coerce.number().int().positive() }) }))),
  asyncHandler(controller.removeHost),
);

export default router;

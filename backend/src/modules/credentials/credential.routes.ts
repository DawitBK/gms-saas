import { Router } from 'express';
import { CredentialController } from './credential.controller';
import { requireAuth } from '../../shared/middleware/auth.middleware';
import { requireRole } from '../../shared/middleware/rbac.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { revokeCredentialSchema } from './credential.schema';
import { validateRequest } from '../../shared/middleware/validateRequest';
import { authenticatedUserLimiter, criticalActionLimiter } from '../../shared/middleware/rateLimiter';
import { z } from 'zod';

const router = Router();
const controller = new CredentialController();

router.use(requireAuth, authenticatedUserLimiter);

const visitParamSchema = z.object({
  params: z.object({
    visitId: z.string().regex(/^\d+$/).transform(Number),
  }),
});

router.get(
  '/visit/:visitId',
  validateRequest(visitParamSchema),
  asyncHandler(controller.listForVisit),
);
router.post(
  '/visit/:visitId/revoke',
  requireRole(['admin', 'host', 'reception']),
  criticalActionLimiter,
  validateRequest(revokeCredentialSchema),
  asyncHandler(controller.revokeForVisit)
);

router.post(
  '/visit/:visitId/fallback-qr',
  requireRole(['admin', 'host', 'reception']),
  criticalActionLimiter,
  validateRequest(visitParamSchema),
  asyncHandler(controller.manualFallback)
);

export default router;

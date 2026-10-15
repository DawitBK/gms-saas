import { Router } from 'express';
import { z } from 'zod';
import { CheckinController } from './checkin.controller';
import { requireAuth } from '../../shared/middleware/auth.middleware';
import { requireRole } from '../../shared/middleware/rbac.middleware';
import { validateRequest } from '../../shared/middleware/validateRequest';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { authenticatedUserLimiter, criticalActionLimiter } from '../../shared/middleware/rateLimiter';

const router = Router();
const controller = new CheckinController();

const checkinSchema = z.object({
  body: z.object({
    qr_code: z.string().min(1, 'QR code is required'),
    manual_override: z.boolean().optional(),
    verification_metadata: z.object({
      method: z.enum(['QR', 'ID_SCAN', 'MANUAL']),
      verified: z.boolean(),
      notes: z.string().optional(),
    }).optional(),
  }),
});

const manualCheckinSchema = z.object({
  body: z.object({
    visitId: z.union([z.number(), z.string()]),
    notes: z.string().optional(),
  }),
});

router.use(requireAuth, authenticatedUserLimiter);

// UniFi remains the primary source of truth for CHECKED_IN, but privileged staff may use manual override.
router.post(
  '/',
  requireRole(['admin', 'reception', 'host']),
  criticalActionLimiter,
  validateRequest(checkinSchema),
  asyncHandler(controller.checkin)
);

router.post(
  '/manual',
  requireRole(['admin', 'reception']),
  criticalActionLimiter,
  validateRequest(manualCheckinSchema),
  asyncHandler(controller.manualCheckin)
);

export default router;

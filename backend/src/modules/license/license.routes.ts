import { Router } from 'express';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { sendSuccess } from '../../core/utils/helpers';
import { requireAuth } from '../../shared/middleware/auth.middleware';
import { authenticatedUserLimiter } from '../../shared/middleware/rateLimiter';
import { buildLicenseStatus } from './license.service';

const router = Router();

// Any authenticated user: the frontend needs it for banners and to hide disabled modules.
router.use(requireAuth, authenticatedUserLimiter);

router.get(
  '/status',
  asyncHandler(async (_req: unknown, res: import('express').Response) => {
    sendSuccess(res, await buildLicenseStatus());
  }),
);

export default router;

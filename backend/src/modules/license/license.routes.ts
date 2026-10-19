import { Router } from 'express';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { sendSuccess } from '../../core/utils/helpers';
import { requireAuth } from '../../shared/middleware/auth.middleware';
import { authenticatedUserLimiter } from '../../shared/middleware/rateLimiter';
import { createInstallHandler, createInstallLimiter } from './license.install';
import { buildLicenseStatus } from './license.service';

const router = Router();

// Unauthenticated on purpose (section 9): the token's signature is the authority, and an operator may have no
// login yet on an unlicensed system. Rate-limited per address; verified exactly like a token SSO served.
router.post('/install', createInstallLimiter(), asyncHandler(createInstallHandler()));

// Any authenticated user: the frontend needs it for banners and to hide disabled modules.
router.use(requireAuth, authenticatedUserLimiter);

router.get(
  '/status',
  asyncHandler(async (_req: unknown, res: import('express').Response) => {
    sendSuccess(res, await buildLicenseStatus());
  }),
);

export default router;

import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { appConfig } from '../../config/app.config';
import { logger } from '../../core/logger/logger';
import { AppError } from '../../core/errors/AppError';
import { ErrorCodes } from '../../core/errors/errorCodes';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { sendSuccess } from '../../core/utils/helpers';
import { AuthService } from './auth.service';
import { constantTimeEquals } from '../../shared/utils/constant-time';

const createSessionSchema = z.object({
  email: z.string().email(),
  givenName: z.string().max(120).optional(),
  familyName: z.string().max(120).optional(),
  initialRoles: z.array(z.string().min(1).max(80)).max(20).optional(),
  initialOfficeId: z.number().int().positive().nullable().optional(),
});

const revokeSessionsSchema = z.object({
  email: z.string().email(),
});

const statusEmailSchema = z.object({
  email: z.string().email(),
});

/**
 * P1-10: source-address allowlist, checked before the key.
 *
 * POST /internal/sso/sessions mints a REAL GMS session for any email the caller
 * names — leak the key and you are every user in the building. The only genuine
 * caller is the SSO backend over loopback (bridge/gms.ts posts to
 * GMS_INTERNAL_BASE_URL, 127.0.0.1 in every documented deployment), so refusing
 * everything else removes the remote surface rather than trading anything away.
 */
const ALLOWED_INTERNAL_IPS = new Set(
  (appConfig.internalSso.allowedIps ?? '127.0.0.1,::1,::ffff:127.0.0.1')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean),
);
const ALLOWLIST_DISABLED = ALLOWED_INTERNAL_IPS.has('*');

const normalizeIp = (ip: string): string => (ip.startsWith('::ffff:') ? ip.slice(7) : ip);

/**
 * 60/min per IP. Comfortably above real SSO handoff volume, far below what
 * guessing a static secret needs. Only the first 6 characters of the presented
 * key are logged.
 */
const internalSsoRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(
      { ip: req.ip, keyPrefix: (req.header('x-internal-api-key') ?? '').slice(0, 6) },
      'internal SSO API rate limit exceeded',
    );
    res.status(429).json({ success: false, message: 'Too many internal SSO requests' });
  },
});

function requireSsoInternalKey(req: Request, _res: Response, next: NextFunction): void {
  const configured = appConfig.internalSso.apiKey;
  if (!configured) {
    throw new AppError('SSO bridge API is disabled', ErrorCodes.INVALID_OPERATION, 503);
  }

  if (!ALLOWLIST_DISABLED) {
    const sourceIp = normalizeIp(req.ip ?? '');
    if (!sourceIp || !ALLOWED_INTERNAL_IPS.has(sourceIp)) {
      logger.warn(
        { ip: req.ip, path: req.originalUrl, keyPrefix: (req.header('x-internal-api-key') ?? '').slice(0, 6) },
        'internal SSO API request from a non-allowlisted address — rejected before key comparison',
      );
      throw new AppError('Internal SSO API is not reachable from this address', ErrorCodes.AUTH_FORBIDDEN, 403);
    }
  }

  const provided = req.header('x-internal-api-key');
  if (!provided || !constantTimeEquals(provided, configured)) {
    logger.warn(
      { ip: req.ip, keyPrefix: (provided ?? '').slice(0, 6) },
      'internal SSO API request with a missing or invalid key',
    );
    throw new AppError('Invalid or missing internal API key', ErrorCodes.AUTH_UNAUTHORIZED, 401);
  }
  next();
}

const router = Router();
const authService = new AuthService();

// This is intentionally mounted beneath /api/v1/internal rather than the
// public auth router. It accepts only service-to-service traffic from SSO.
router.use(internalSsoRateLimit, requireSsoInternalKey);

router.post('/sessions', asyncHandler(async (req: Request, res: Response) => {
  const input = createSessionSchema.parse(req.body);
  const result = await authService.issueSsoSession(input, {
    userAgent: req.header('user-agent'),
    ipAddress: req.ip,
  });
  sendSuccess(res, {
    userId: result.user!.id,
    roles: result.user!.roles,
    officeId: result.user!.office_id ?? null,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  });
}));

router.post('/sessions/revoke', asyncHandler(async (req: Request, res: Response) => {
  const { email } = revokeSessionsSchema.parse(req.body);
  const revokedSessions = await authService.revokeSsoSessionsByEmail(email);
  sendSuccess(res, { revokedSessions });
}));

router.get('/offices', asyncHandler(async (_req: Request, res: Response) => {
  const offices = await authService.listSsoOffices();
  sendSuccess(res, { offices });
}));

router.get('/users/by-email/:email/status', asyncHandler(async (req: Request, res: Response) => {
  const { email } = statusEmailSchema.parse({ email: decodeURIComponent(String(req.params.email ?? '')) });
  const status = await authService.getSsoUserStatus(email);
  sendSuccess(res, status);
}));

export default router;

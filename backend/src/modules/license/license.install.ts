/**
 * POST /api/v1/license/install { "token": "<jws>" } (docs/operations/PLATFORM-LICENSING.md section 9).
 *
 * Unauthenticated by design, so it carries its own per-address rate limit (in memory: the limit only has to
 * slow guessing, and a Redis outage must not take licence installation down with it). The token is verified
 * exactly like one SSO served (signature against the trusted keys, typ, aud, sys), stored through the same
 * persistence, and can never lower the version already held.
 */
import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { AppError } from '../../core/errors/AppError';
import { ErrorCodes } from '../../core/errors/errorCodes';
import { sendSuccess } from '../../core/utils/helpers';
import { computeEntitlement } from './license.entitlement';
import { licenseStore, type LicenseStore } from './license.store';

/** A compact licence token is a few hundred bytes; verifyLicenseToken refuses more than this anyway. */
const MAX_TOKEN_LENGTH = 16_384;

export function createInstallLimiter(max = 10, windowMs = 15 * 60 * 1000) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many licence installation attempts. Try again later.' },
      });
    },
  });
}

export function createInstallHandler(store: LicenseStore = licenseStore) {
  return async (req: Request, res: Response) => {
    const raw = (req.body as { token?: unknown } | undefined)?.token;
    const token = typeof raw === 'string' ? raw.trim() : '';
    if (!token || token.length > MAX_TOKEN_LENGTH) {
      throw new AppError('A licence token is required.', ErrorCodes.INVALID_INPUT, 400);
    }

    const result = await store.install(token);
    if (result.outcome === 'rejected') {
      throw new AppError('The licence token was not accepted.', ErrorCodes.INVALID_INPUT, 400, { reason: result.reason });
    }
    if (result.outcome === 'unavailable') {
      throw new AppError(
        'The licence token could not be verified right now. Try again shortly.',
        ErrorCodes.SYSTEM_SERVICE_UNAVAILABLE,
        503,
      );
    }

    const snapshot = store.snapshot();
    const entitlement = computeEntitlement({ required: store.required, deployment: store.deployment, token: snapshot.claims });
    sendSuccess(res, {
      installed: result.outcome === 'installed',
      outcome: result.outcome,
      version: result.version ?? null,
      state: snapshot.state,
      licensed: entitlement.licensed,
      reason: entitlement.reason,
    });
  };
}

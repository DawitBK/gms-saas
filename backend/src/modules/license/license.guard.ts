/**
 * Licence enforcement middleware (docs/operations/PLATFORM-LICENSING.md sections 6 and 7).
 *
 * Mounted ONCE at the top of the `/api/v1` router, before every route group:
 *
 *   0. entitlement  (section 9) LICENSE_REQUIRED and no entitlement (no verified token, or a token that does not
 *                   cover this deployment's mode): everything answers 403 LICENSE_REQUIRED except the exempt
 *                   list in license.routing.ts (health, the licence status/install routes, sign-in, the SSO bridge).
 *   1. module gate  a gateable module that is not in the licence's `modules` answers
 *                   403 LICENSE_MODULE_DISABLED (any method). Core routes are never gated.
 *   2. read-only    state `expired`: POST/PUT/PATCH/DELETE answers 403 LICENSE_EXPIRED unless it is on
 *                   the allowlist (license.routing.ts). GET/HEAD/OPTIONS always pass.
 *
 * Where LICENSE_REQUIRED is false it enforces nothing in `unconfigured` / `unknown` (principles 1 and 2),
 * nothing when LICENSE_ENFORCEMENT=off, and in `warn` it only logs what it would have refused. Any
 * unexpected failure inside the guard lets the request through (and is logged at error level): a licence
 * feature must never be able to lock GMS by accident.
 */
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../core/errors/AppError';
import { ErrorCodes } from '../../core/errors/errorCodes';
import { logger } from '../../core/logger/logger';
import { computeEntitlement } from './license.entitlement';
import {
  isLicenseRequiredExempt,
  isReadOnlyAllowlisted,
  isSafeMethod,
  moduleForPath,
  normalizeLicensePath,
} from './license.routing';
import { licenseStore, type LicenseStore } from './license.store';

export const LICENSE_EXPIRED_MESSAGE = 'The licence has expired; the system is read-only. Contact your administrator.';
export const LICENSE_REQUIRED_MESSAGE = 'This system is not licensed. Contact your administrator.';
export const LICENSE_MODULE_DISABLED_MESSAGE = 'This feature is not included in your licence. Contact your administrator.';

/** `warn` mode logs each kind of would-be refusal at most once a minute. */
const WARN_LOG_GAP_MS = 60_000;

export function createLicenseGuard(store: LicenseStore = licenseStore, nowMs: () => number = () => Date.now()) {
  const lastWarnAt = new Map<string, number>();

  const warnOnly = (kind: string, req: Request) => {
    const last = lastWarnAt.get(kind) ?? 0;
    if (nowMs() - last < WARN_LOG_GAP_MS) return;
    lastWarnAt.set(kind, nowMs());
    logger.warn(
      { module: 'license', kind, method: req.method, path: req.path },
      'LICENSE_ENFORCEMENT=warn: this request would have been refused',
    );
  };

  return function licenseGuard(req: Request, _res: Response, next: NextFunction) {
    try {
      if (store.enforcement === 'off') return next();

      const snapshot = store.snapshot();
      const path = normalizeLicensePath(req.path);

      if (store.required) {
        const entitlement = computeEntitlement({
          required: true,
          deployment: store.deployment,
          token: snapshot.claims,
        });
        if (!entitlement.licensed && !isLicenseRequiredExempt(path)) {
          if (store.enforcement === 'warn') {
            warnOnly(`required:${entitlement.reason}`, req);
          } else {
            return next(
              new AppError(LICENSE_REQUIRED_MESSAGE, ErrorCodes.LICENSE_REQUIRED, 403, { reason: entitlement.reason }),
            );
          }
        }
      }

      if (snapshot.state === 'unconfigured' || snapshot.state === 'unknown') return next();

      const moduleKey = moduleForPath(path);
      const enabled = snapshot.claims?.modules ?? null;
      if (moduleKey && enabled && !enabled.includes(moduleKey)) {
        if (store.enforcement === 'warn') {
          warnOnly(`module:${moduleKey}`, req);
        } else {
          return next(
            new AppError(LICENSE_MODULE_DISABLED_MESSAGE, ErrorCodes.LICENSE_MODULE_DISABLED, 403, { module: moduleKey }),
          );
        }
      }

      if (snapshot.state === 'expired' && !isSafeMethod(req.method) && !isReadOnlyAllowlisted(req.method, path)) {
        if (store.enforcement === 'warn') {
          warnOnly('expired', req);
        } else {
          return next(
            new AppError(LICENSE_EXPIRED_MESSAGE, ErrorCodes.LICENSE_EXPIRED, 403, {
              graceEndsAt: snapshot.graceEndsAt,
            }),
          );
        }
      }

      return next();
    } catch (err) {
      logger.error({ module: 'license', err }, 'Licence guard failed; letting the request through');
      return next();
    }
  };
}

export const licenseGuard = createLicenseGuard();

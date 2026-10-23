/**
 * Read-only containment while an incident lock is in force (incident.lock.ts). Mounted at the top of the `/api/v1` router, ahead of the licence guard.
 *
 * Refuses POST/PUT/PATCH/DELETE with 403 INCIDENT_READ_ONLY unless the request is one the licence's own states already let through: sign-in and
 * sign-out and the account-security calls (READ_ONLY_ALLOWLIST), health, the licence routes and the SSO bridge (LICENSE_REQUIRED_EXEMPT). Safe methods
 * always pass. No INCIDENT_LOCK_FILE: no effect. Never throws: a failure lets the request through.
 */
import type { NextFunction, Request, Response } from 'express';
import { appConfig } from '../../config/app.config';
import { AppError } from '../../core/errors/AppError';
import { ErrorCodes } from '../../core/errors/errorCodes';
import { INCIDENT_READ_ONLY_MESSAGE, readIncidentLock, type IncidentLockInfo } from './incident.lock';
import { isLicenseRequiredExempt, isReadOnlyAllowlisted, isSafeMethod, normalizeLicensePath } from './license.routing';

/** The licence status/install routes are exempt already; this adds the rest of /license (it is the licence's own surface). */
const isLicenseRoute = (path: string): boolean => path === '/license' || path.startsWith('/license/');

export function createIncidentGuard(lock: () => IncidentLockInfo | null = () => readIncidentLock(appConfig.incident.lockFile)) {
  return function incidentGuard(req: Request, _res: Response, next: NextFunction) {
    try {
      if (isSafeMethod(req.method)) return next();
      const path = normalizeLicensePath(req.path);
      if (isReadOnlyAllowlisted(req.method, path) || isLicenseRequiredExempt(path) || isLicenseRoute(path)) return next();
      const info = lock();
      if (!info) return next();
      return next(new AppError(INCIDENT_READ_ONLY_MESSAGE, ErrorCodes.INCIDENT_READ_ONLY, 403, { reason: info.kind ?? undefined }));
    } catch {
      return next();
    }
  };
}

export const incidentGuard = createIncidentGuard();

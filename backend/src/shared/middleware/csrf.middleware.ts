import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { constantTimeEquals } from '../utils/constant-time';
import { appConfig } from '../../config/app.config';
import { AppError } from '../../core/errors/AppError';
import { ErrorCodes } from '../../core/errors/errorCodes';

/**
 * Every value sent for `key`, not just the first.
 *
 * A browser sends one Cookie header containing every cookie whose Path matches,
 * and it may legitimately contain the SAME name twice at different Paths. This
 * used `.find()`, so a stale `gms_csrf_token` left at an old Path (say `/` from
 * before the path was narrowed) shadowed the live one and every CSRF check
 * failed with no way to tell why. SSO hit exactly this and fixed it the same
 * way -- see the `cookieValues` helper in its admin/router.ts.
 */
const parseCookieValues = (cookieHeader: string | undefined, key: string): string[] => {
  const out: string[] = [];
  for (const part of (cookieHeader ?? '').split(';')) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${key}=`)) continue;
    out.push(trimmed.slice(key.length + 1));
  }
  return out;
};

export const attachCsrfCookie = (res: Response) => {
  const csrfToken = randomUUID();
  res.cookie('gms_csrf_token', csrfToken, {
    httpOnly: false,
    sameSite: 'strict',
    secure: appConfig.isProduction,
    path: '/',
  });
  return csrfToken;
};

export const clearCsrfCookie = (res: Response) => {
  res.clearCookie('gms_csrf_token', { path: '/' });
};

export const requireCsrf = (req: Request, _res: Response, next: NextFunction) => {
  const csrfCookies = parseCookieValues(req.headers.cookie, 'gms_csrf_token');
  const csrfHeader = req.headers['x-csrf-token'];

  if (!csrfCookies.length || typeof csrfHeader !== 'string' || !csrfHeader) {
    return next(new AppError('CSRF validation failed', ErrorCodes.AUTH_UNAUTHORIZED, 401));
  }

  // Accept a match against ANY cookie sent under this name (see
  // parseCookieValues), and compare in constant time. The previous `!==` on a
  // single value leaked match-position through timing; negligible on its own
  // for a double-submit token, but there is no reason to keep it.
  const matched = csrfCookies.some((value) => constantTimeEquals(value, csrfHeader));

  if (!matched) {
    return next(new AppError('CSRF validation failed', ErrorCodes.AUTH_UNAUTHORIZED, 401));
  }

  next();
};

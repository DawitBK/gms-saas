import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { appConfig } from '../../config/app.config';
import { AppError } from '../../core/errors/AppError';
import { ErrorCodes } from '../../core/errors/errorCodes';
import { isOfficeScopedRole, isSuperRole, normalizeRoleName, normalizeRoles } from '../auth/roles';
import { isSessionRevoked, RevocationCheckUnavailableError } from '../services/session-revocation.service';

/**
 * Auth Middleware
 * 
 * Hydrates the request object with user identity and authorization context from JWTs.
 * Features:
 * - Role Narrowing: Uses X-Selected-Role to limit effective permissions per session.
 * - Global Bypass: Allows super_admin and other global roles to bypass office-scoping checks.
 * - Multi-Role Support: Correctly handles users with overlapping staff and super roles.
 * - Token Validation: Enforces expiration and signature integrity.
 */
interface JwtPayload {
  id: number;
  email?: string;
  roles?: string[];
  // P2-4: `permissions?: string[]` removed. Tokens minted before this change may
  // still carry an empty array; it is simply ignored, so old and new tokens are
  // both valid and no rollout ordering is needed.
  office_id?: number;
  iat?: number;
}

async function hydrateRequestFromToken(
  req: Request,
  token: string,
  next: NextFunction,
) {
  try {
    const decoded = jwt.verify(token, appConfig.jwt.secret as string, { algorithms: ['HS256'] }) as JwtPayload;
    const userId = Number(decoded.id);
    if (!Number.isFinite(userId) || userId <= 0) {
      return next(new AppError('Invalid token payload', ErrorCodes.AUTH_UNAUTHORIZED, 401));
    }

    // FIX: this is the ONLY revocation check that exists anywhere in the
    // system. Suspending/offboarding a user or forcing a sign-out now
    // actually invalidates their already-issued tokens instead of leaving
    // them valid for their full remaining lifetime.
    if (typeof decoded.iat === 'number') {
      try {
        const revoked = await isSessionRevoked(userId, decoded.iat);
        if (revoked) {
          return next(new AppError('Session has been revoked', ErrorCodes.AUTH_UNAUTHORIZED, 401));
        }
      } catch (err) {
        if (err instanceof RevocationCheckUnavailableError) {
          return next(new AppError('Authentication is temporarily unavailable', ErrorCodes.SYSTEM_SERVICE_UNAVAILABLE, 503));
        }
        throw err;
      }
    }

    const decodedRoles = normalizeRoles(decoded.roles ?? []);
    const selectedRoleHeader = normalizeRoleName(req.headers['x-selected-role']);
    if (selectedRoleHeader && !decodedRoles.includes(selectedRoleHeader)) {
      return next(new AppError('Selected role is not available for this session', ErrorCodes.AUTH_FORBIDDEN, 403));
    }

    const effectiveRoles = selectedRoleHeader ? [selectedRoleHeader] : decodedRoles;

    // Only enforce office_id requirement for office-scoped roles when the user's total
    // identity (all roles in token) has NO global (super) role. 
    // A user with e.g. both 'admin' and 'super_admin' roles should never be blocked 
    // by office-scope enforcement — their global privilege is intrinsic to their session.
    const hasGlobalScope = decodedRoles.some((role) => isSuperRole(role));
    if (!hasGlobalScope) {
      const missingOfficeScopedRole = effectiveRoles.find((role) => isOfficeScopedRole(role) && !decoded.office_id);
      if (missingOfficeScopedRole) {
        return next(new AppError(`${missingOfficeScopedRole} account is missing an office assignment`, ErrorCodes.AUTH_FORBIDDEN, 403));
      }
    }

    req.user = { id: userId, email: decoded.email ?? '', office_id: decoded.office_id };
    req.userRoles = effectiveRoles;
    req.allRoles = decodedRoles;
    req.log = req.log?.child({ userId, roles: effectiveRoles }) ?? req.log;

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(new AppError('Token has expired', ErrorCodes.AUTH_TOKEN_EXPIRED, 401));
    }
    return next(new AppError('Invalid token signature', ErrorCodes.AUTH_UNAUTHORIZED, 401));
  }
}

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError('No token provided', ErrorCodes.AUTH_UNAUTHORIZED, 401));
  }

  return hydrateRequestFromToken(req, authHeader.split(' ')[1], next);
};

export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }

  return hydrateRequestFromToken(req, authHeader.split(' ')[1], next);
};

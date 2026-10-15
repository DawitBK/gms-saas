import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../core/errors/AppError';
import { ErrorCodes } from '../../core/errors/errorCodes';
import { hasGlobalOfficeScope, isStaffRole, userHasAllowedRole } from '../auth/roles';

export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.userRoles) {
      return next(new AppError('Session lacks role definitions', ErrorCodes.AUTH_FORBIDDEN, 403));
    }

    const hasRole = userHasAllowedRole(req.userRoles, allowedRoles);
    if (!hasRole) {
      return next(new AppError(`Insufficient role. Required: ${allowedRoles.join(',')}`, ErrorCodes.AUTH_FORBIDDEN, 403));
    }

    next();
  };
};

/**
 * P2-4: `requirePermission` was DELETED here, deliberately.
 *
 * It was applied to zero routes, and it could never have worked if it had been:
 * generateTokens hardcoded `permissions: []` into every token GMS has ever
 * issued, so `req.permissions` was always empty and the middleware would have
 * denied everything it guarded. Its only real effect was on readers — anyone
 * auditing GMS's authorization saw a granular permission gate sitting in the
 * middleware layer and reasonably assumed permissions were enforced somewhere.
 * They never were.
 *
 * GMS's authorization model is role-based, via `requireRole` above, plus
 * per-resource scoping in the service layer (VisitScopePolicy and friends). That
 * is the decision, not an omission. If granular permissions are wanted later they
 * need a real role -> permission mapping (DMS's resolveUnionPermissions is the
 * reference) and route-level application — a project, not a side effect of
 * deleting dead code.
 */

/**
 * Office boundary for routes that take a target office in the request (P1-9).
 *
 * Its only current mount is `POST /visits` (visit.routes.ts), where `office_id`
 * is a required body field — so unlike the read paths, which are scoped by
 * `VisitScopePolicy.buildScopedFilter`, this really is the office check for
 * creating a visit. It previously had three ways to pass without checking
 * anything:
 *
 *  1. `if (!req.user?.office_id) return next();` — labelled "guests are external
 *     visitors", but it keyed on the ABSENCE of an office rather than on actually
 *     being a guest. auth.middleware only demands `office_id` for roles in
 *     OFFICE_SCOPED_ROLES, and only when the token carries no super role, so real
 *     staff principals reach here with no office and were waved straight through.
 *  2. `if (targetOfficeId && …)` — no target office in the request meant no
 *     check. A deny-list on an optional parameter is not a boundary; it happened
 *     to be safe here only because this one route's schema makes `office_id`
 *     required.
 *  3. A super_admin sending `X-Selected-Role: reception` has
 *     `req.userRoles === ['reception']`, so `hasGlobalOfficeScope` is false — and
 *     then, having no `office_id` of their own, they landed in (1) and bypassed
 *     the check entirely. Narrowing a role made the boundary disappear instead of
 *     applying it.
 *
 * Now the guest case is identified positively (no staff role at all), staff must
 * present a resolvable target office, and a narrowed principal with no office is
 * refused with an actionable message rather than silently let through.
 *
 * Note on scope: this deliberately does NOT change auth.middleware's own
 * `hasGlobalScope` (computed from the full token role set), which gates a
 * different question — whether `office_id` must be present on the token at all.
 * Narrowing that one would 403 *every* request from a super user who narrowed to
 * an office role, which is a far wider behaviour change than this finding calls
 * for. The narrowing-is-real semantics are enforced here, at the boundary that
 * actually authorizes the write.
 */
export const enforceOfficeScope = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    const effectiveRoles = req.userRoles ?? [];
    const allRoles = req.allRoles ?? [];

    // Narrowing is honoured: global scope is decided by the roles this request is
    // actually being made with, not by everything the token could do.
    if (hasGlobalOfficeScope(effectiveRoles)) {
      return next();
    }

    const isStaff = effectiveRoles.some(isStaffRole);

    // A genuine external visitor: no staff role at all. They book for themselves
    // and are not bound to an office. Identified by what they ARE, not by a
    // missing claim.
    if (!isStaff) {
      return next();
    }

    const actorOfficeId = req.user?.office_id;
    if (!actorOfficeId) {
      // Two ways to get here, and both must fail closed rather than pass.
      const narrowedFromGlobal = hasGlobalOfficeScope(allRoles);
      if (narrowedFromGlobal) {
        return next(new AppError(
          'This role was narrowed to an office-scoped role, but the account has no office assignment to scope it to. Remove the X-Selected-Role header to act with full scope, or assign the account an office.',
          ErrorCodes.AUTH_FORBIDDEN,
          403,
        ));
      }
      return next(new AppError(
        'This account is missing an office assignment and cannot act on office-scoped data',
        ErrorCodes.AUTH_FORBIDDEN,
        403,
      ));
    }

    const rawTargetOfficeId = req.params.office_id ?? req.body?.office_id ?? req.query.office_id;

    // No target office in the request is now a refusal, not a pass: this
    // middleware cannot confirm the request stays inside the actor's office, and
    // "cannot confirm" must not mean "allow".
    if (rawTargetOfficeId === undefined || rawTargetOfficeId === null || rawTargetOfficeId === '') {
      return next(new AppError(
        'office_id is required on this request so it can be checked against your office',
        ErrorCodes.AUTH_FORBIDDEN,
        403,
      ));
    }

    // Compare numerically — JWT payloads and query strings disagree about types.
    // A non-numeric value must not compare equal to anything (NaN !== NaN would
    // reject, but be explicit rather than relying on that).
    const target = Number(rawTargetOfficeId);
    if (!Number.isInteger(target) || target <= 0) {
      return next(new AppError(
        'office_id must be a positive integer',
        ErrorCodes.AUTH_FORBIDDEN,
        403,
      ));
    }

    if (Number(actorOfficeId) !== target) {
      return next(new AppError('You are strictly bounded and cannot interact across external office boundaries', ErrorCodes.AUTH_FORBIDDEN, 403));
    }

    next();
  };
};

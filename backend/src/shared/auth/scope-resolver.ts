import { AppError } from '../../core/errors/AppError';
import { ErrorCodes } from '../../core/errors/errorCodes';
import { hasGlobalOfficeScope, isOfficeScopedRole, normalizeRoles } from './roles';

export type ScopedActor = { id?: number; roles?: string[]; allRoles?: string[]; office_id?: number };

export function resolveScopedOfficeId(actor?: ScopedActor) {
  if (!actor) {
    return undefined;
  }

  const roles = normalizeRoles(actor.roles ?? []);

  if (!roles.length || hasGlobalOfficeScope(roles)) {
    return undefined;
  }

  if (!roles.some(isOfficeScopedRole)) {
    return undefined;
  }

  if (!actor.office_id) {
    throw new AppError(
      'Office-scoped staff account is missing an office assignment',
      ErrorCodes.AUTH_FORBIDDEN,
      403,
    );
  }

  return Number(actor.office_id);
}

export function requireActorOfficeId(
  actor: ScopedActor,
  missingOfficeMessage = 'Office-scoped access requires an office assignment',
) {
  const roles = normalizeRoles(actor.roles ?? []);
  if (hasGlobalOfficeScope(roles)) {
    return Number(actor.office_id ?? 0); // Return a default or 0 if global
  }

  if (!actor.office_id || Number(actor.office_id) <= 0) {
    throw new AppError(missingOfficeMessage, ErrorCodes.AUTH_FORBIDDEN, 403);
  }

  return Number(actor.office_id);
}

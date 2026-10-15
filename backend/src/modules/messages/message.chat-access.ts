import { Host } from '../../infrastructure/database/models';
import { AppError } from '../../core/errors/AppError';
import { ErrorCodes } from '../../core/errors/errorCodes';
import { hasGlobalOfficeScope, isHostRole, normalizeRoles } from '../../shared/auth/roles';

/** Minimal visit fields required for chat authorization */
export type VisitChatRow = {
  id: number;
  guest_id: number;
  office_id: number;
  assigned_host_id: number | null;
  status: string;
};

export const BLOCKED_NEW_MESSAGE_STATUSES = new Set(['DECLINED', 'CANCELLED', 'EXPIRED', 'NO_SHOW']);

export async function loadHostUserId(assignedHostId: number | null): Promise<number | null> {
  if (!assignedHostId) return null;
  const host = await Host.findByPk(assignedHostId, { attributes: ['user_id'] });
  return host ? Number((host as { user_id?: number }).user_id) : null;
}

export function assertCanAccessVisitChat(
  userId: number,
  roles: string[],
  officeId: number | undefined,
  visit: VisitChatRow,
  hostUserId: number | null
): void {
  const normalizedRoles = normalizeRoles(roles);
  if (hasGlobalOfficeScope(normalizedRoles.filter((role) => role !== 'super_host'))) return;
  if (normalizedRoles.includes('guest') && Number(visit.guest_id) === userId) return;
  if (
    normalizedRoles.includes('reception') &&
    officeId !== undefined &&
    Number(visit.office_id) === Number(officeId)
  ) {
    return;
  }
  if (normalizedRoles.some(isHostRole) && hostUserId !== null && hostUserId === userId) return;

  throw new AppError('You cannot access this visit conversation', ErrorCodes.AUTH_FORBIDDEN, 403);
}

export function assertCanPostVisitMessage(visitStatus: string): void {
  if (BLOCKED_NEW_MESSAGE_STATUSES.has(visitStatus)) {
    throw new AppError('Messaging is closed for this visit', ErrorCodes.INVALID_INPUT, 400);
  }
}

export function collectChatRecipientUserIds(guestUserId: number, hostUserId: number | null): number[] {
  const set = new Set<number>();
  set.add(Number(guestUserId));
  if (hostUserId !== null) set.add(hostUserId);
  return [...set];
}

import { VisitLifecycleStatus } from './status-catalog';
import { AppError } from '../errors/AppError';
import { ErrorCodes } from '../errors/errorCodes';

/**
 * Visit State Machine
 * 
 * Enforces strict, deterministic transitions for the visit lifecycle.
 * This is the 'Iron-Clad' core of the guest flow.
 */
export class VisitStateMachine {
  private static readonly TRANSITIONS: Record<VisitLifecycleStatus, VisitLifecycleStatus[]> = {
    PENDING: ['APPROVED', 'DECLINED', 'CANCELLED', 'EXPIRED', 'ESCALATED', 'REASSIGNED', 'REASSIGNED_RESCHEDULED'],
    APPROVED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED', 'EXPIRED', 'ESCALATED', 'REASSIGNED', 'REASSIGNED_RESCHEDULED'],
    DECLINED: ['PENDING'], // Allow re-opening for correction
    // ESCALATED: a guest who declines the proposed new time sends the visit to reception (guestDecision in visit.command.service.ts).
    RESCHEDULED: ['PENDING', 'APPROVED', 'CANCELLED', 'ESCALATED', 'REASSIGNED', 'REASSIGNED_RESCHEDULED'],
    REASSIGNED: ['PENDING', 'APPROVED', 'DECLINED', 'CANCELLED', 'ESCALATED', 'REASSIGNED', 'REASSIGNED_RESCHEDULED'],
    REASSIGNED_RESCHEDULED: ['PENDING', 'APPROVED', 'DECLINED', 'CANCELLED', 'ESCALATED', 'REASSIGNED', 'REASSIGNED_RESCHEDULED'],
    CHECKED_IN: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
    IN_PROGRESS: ['COMPLETED', 'ESCALATED'],
    COMPLETED: [], // Terminal State
    CANCELLED: ['PENDING'], // Allow re-opening if cancelled in error
    NO_SHOW: ['RESCHEDULED', 'CANCELLED'],
    ESCALATED: ['APPROVED', 'DECLINED', 'CHECKED_IN', 'CANCELLED', 'REASSIGNED'],
    EXPIRED: ['RESCHEDULED', 'CANCELLED']
  };

  /**
   * Validates if a transition from currentStatus to nextStatus is permitted.
   * Throws an AppError if the move is illegal.
   */
  public static validateTransition(currentStatus: VisitLifecycleStatus, nextStatus: VisitLifecycleStatus): void {
    if (currentStatus === nextStatus) return; // No change is always valid

    const allowed = this.TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(nextStatus)) {
      throw new AppError(
        `Illegal lifecycle transition: Cannot move visit from ${currentStatus} to ${nextStatus}`,
        ErrorCodes.INVALID_OPERATION,
        400
      );
    }
  }

  /**
   * Returns true if the status is a terminal (final) state.
   */
  public static isTerminal(status: VisitLifecycleStatus): boolean {
    return ['COMPLETED', 'DECLINED', 'CANCELLED', 'EXPIRED', 'NO_SHOW'].includes(status);
  }

  /**
   * Returns true if the visit is currently 'Active' (occupying building resources).
   */
  public static isActive(status: VisitLifecycleStatus): boolean {
    return ['CHECKED_IN', 'IN_PROGRESS'].includes(status);
  }
}

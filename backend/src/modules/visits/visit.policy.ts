import { AppError } from '../../core/errors/AppError';
import { ErrorCodes } from '../../core/errors/errorCodes';
import { EventTypes } from '../../infrastructure/events/eventTypes';
import { VisitStateMachine } from '../../core/status/VisitStateMachine';
import { 
  VisitLifecycleStatus,
  VISIT_STATUS_APPROVED,
  VISIT_STATUS_CANCELLED,
  VISIT_STATUS_CHECKED_IN,
  VISIT_STATUS_COMPLETED,
  VISIT_STATUS_DECLINED,
  VISIT_STATUS_ESCALATED,
  VISIT_STATUS_NO_SHOW
} from '../../core/status/status-catalog';

/**
 * Visit Status Event Map
 * Maps lifecycle statuses to infrastructure events.
 */
export const VISIT_STATUS_EVENT_MAP: Record<string, EventTypes | undefined> = {
  [VISIT_STATUS_APPROVED]: EventTypes.VISIT_APPROVED,
  [VISIT_STATUS_DECLINED]: EventTypes.VISIT_DECLINED,
  [VISIT_STATUS_CANCELLED]: EventTypes.VISIT_CANCELLED,
  [VISIT_STATUS_CHECKED_IN]: EventTypes.VISIT_CHECKED_IN,
  [VISIT_STATUS_COMPLETED]: EventTypes.VISIT_COMPLETED,
  [VISIT_STATUS_NO_SHOW]: EventTypes.VISIT_NO_SHOW,
  [VISIT_STATUS_ESCALATED]: EventTypes.VISIT_SLA_ESCALATED,
};

/**
 * Validates that a visit is not in a terminal state.
 */
export function assertNotTerminalVisitStatus(status: string) {
  if (VisitStateMachine.isTerminal(status as VisitLifecycleStatus)) {
    throw new AppError('Visit is already in a terminal state', ErrorCodes.INVALID_OPERATION, 400);
  }
}

/**
 * Validates that a visit slot is in the future.
 */
export function assertVisitSlotStartsInFuture(slot: any, message: string) {
  const startTime = new Date((slot as any)?.start_time);
  if (!Number.isFinite(startTime.getTime()) || startTime.getTime() <= Date.now()) {
    throw new AppError(message, ErrorCodes.INVALID_INPUT, 400);
  }
}

/**
 * Validates a lifecycle transition using the VisitStateMachine.
 */
export function assertValidVisitTransition(currentStatus: string, newStatus: string) {
  try {
    VisitStateMachine.validateTransition(
      currentStatus as VisitLifecycleStatus,
      newStatus as VisitLifecycleStatus
    );
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      `Cannot move a visit from ${currentStatus} to ${newStatus}`,
      ErrorCodes.VISIT_ILLEGAL_TRANSITION,
      400
    );
  }
}

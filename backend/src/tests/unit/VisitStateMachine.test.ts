import { VisitStateMachine } from '../../core/status/VisitStateMachine';
import { VisitLifecycleStatus } from '../../core/status/status-catalog';

describe('VisitStateMachine', () => {
  test('allows valid transition PENDING -> APPROVED', () => {
    expect(() => VisitStateMachine.validateTransition('PENDING' as VisitLifecycleStatus, 'APPROVED' as VisitLifecycleStatus)).not.toThrow();
  });

  test('rejects invalid transition COMPLETED -> PENDING', () => {
    expect(() => VisitStateMachine.validateTransition('COMPLETED' as VisitLifecycleStatus, 'PENDING' as VisitLifecycleStatus)).toThrow();
  });

  test('a guest who declines a host-rescheduled visit can send it to reception (RESCHEDULED -> ESCALATED)', () => {
    expect(() => VisitStateMachine.validateTransition('RESCHEDULED' as VisitLifecycleStatus, 'ESCALATED' as VisitLifecycleStatus)).not.toThrow();
    // ...and the other moves out of a rescheduled visit are unchanged
    for (const next of ['PENDING', 'APPROVED', 'CANCELLED', 'REASSIGNED', 'REASSIGNED_RESCHEDULED']) {
      expect(() => VisitStateMachine.validateTransition('RESCHEDULED' as VisitLifecycleStatus, next as VisitLifecycleStatus)).not.toThrow();
    }
    expect(() => VisitStateMachine.validateTransition('RESCHEDULED' as VisitLifecycleStatus, 'CHECKED_IN' as VisitLifecycleStatus)).toThrow();
  });

  test('isTerminal identifies terminal states', () => {
    expect(VisitStateMachine.isTerminal('COMPLETED' as VisitLifecycleStatus)).toBe(true);
    expect(VisitStateMachine.isTerminal('PENDING' as VisitLifecycleStatus)).toBe(false);
  });

  test('isActive identifies active states', () => {
    expect(VisitStateMachine.isActive('CHECKED_IN' as VisitLifecycleStatus)).toBe(true);
    expect(VisitStateMachine.isActive('COMPLETED' as VisitLifecycleStatus)).toBe(false);
  });
});

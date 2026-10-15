import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { ApprovalService } from '../modules/approvals/approval.service';
import * as outboxService from '../infrastructure/events/outbox.service';

jest.mock('../core/db/transaction', () => ({
  withTransaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback({ id: 'test-transaction' }),
}));

describe('ApprovalService outbox integration', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps approval path synchronous and does not enqueue credential provisioning directly', async () => {
    const service = new ApprovalService();
    let txArg: any = null;
    const findVisitForDecision = jest.fn(async (_visitId: number, tx: unknown) => {
      txArg = tx;
      return { id: 77, status: 'PENDING', guest_id: 12 };
    });

    (service as any).approvalRepository = {
      findVisitForDecision,
      create: jest.fn(async () => ({ id: 900, visit_id: 77, approver_id: 3, status: 'APPROVED', reason: null })),
    };
    (service as any).visitService = {
      processStatusChange: jest.fn(async () => ({ visit: { id: 77, status: 'APPROVED' }, changed: true })),
    };
    jest.spyOn(outboxService, 'enqueueJob').mockResolvedValue(undefined as any);
    (service as any).notificationService = {
      createNotification: jest.fn(async () => undefined),
    };

    const result = await service.decideVisit(77, { id: 3, roles: ['admin'] }, { decision: 'APPROVED' } as any);

    expect(result.approval).toBeTruthy();
    expect(result.approval?.status).toBe('APPROVED');
    expect((service as any).visitService.processStatusChange).toHaveBeenCalledWith(
      77,
      { id: 3, roles: ['admin'] },
      'APPROVED',
      expect.anything()
    );
    expect(outboxService.enqueueJob).not.toHaveBeenCalled();
    expect(findVisitForDecision).toHaveBeenCalledWith(77, expect.anything());
    expect(txArg).toBeTruthy();
  });

  it('keeps decline notification behavior and still records the decline email in the outbox', async () => {
    const service = new ApprovalService();

    (service as any).approvalRepository = {
      findVisitForDecision: jest.fn(async () => ({ id: 88, status: 'PENDING', guest_id: 19 })),
      create: jest.fn(async () => ({ id: 901, visit_id: 88, approver_id: 4, status: 'DECLINED', reason: 'Capacity full' })),
    };
    (service as any).visitService = {
      processStatusChange: jest.fn(async () => ({ visit: { id: 88, status: 'DECLINED' }, changed: true })),
    };
    jest.spyOn(outboxService, 'enqueueJob').mockResolvedValue(undefined as any);
    (service as any).notificationService = {
      createNotification: jest.fn(async () => undefined),
    };

    const result = await service.decideVisit(88, { id: 4, roles: ['admin'] }, { decision: 'DECLINED' } as any);

    expect(result.approval).toBeTruthy();
    expect(result.approval?.status).toBe('DECLINED');
    expect((service as any).notificationService.createNotification).toHaveBeenCalledWith(
      19,
      'Visit Declined',
      'Your visit request was declined. Please contact reception for help.',
      'VISIT_DECLINED'
    );
    expect(outboxService.enqueueJob).toHaveBeenCalledWith(
      'EMAILS',
      'VisitDeclinedEmail',
      { visitId: 88, guestId: 19, template: 'CANCELLED' },
      expect.anything(),
      { type: 'Visit', id: 88 }
    );
    expect(outboxService.enqueueJob).toHaveBeenCalledWith(
      'SMS',
      'VisitDeclinedSms',
      { visitId: 88, guestId: 19, template: 'CANCELLED' },
      expect.anything(),
      { type: 'Visit', id: 88 }
    );
  });
});

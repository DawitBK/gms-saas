import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { CheckinService } from '../modules/checkin/checkin.service';
import { AuditLog, Visit } from '../infrastructure/database/models';
import * as auditService from '../shared/services/audit.service';
import * as outboxService from '../infrastructure/events/outbox.service';

jest.mock('../infrastructure/queue/queue', () => ({
  QUEUE_NAMES: {
    EMAIL_NOTIFICATION: 'EMAILS',
  },
  enqueueJob: jest.fn(async () => undefined),
}));

describe('CheckinService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('verifies an approved QR without changing visit status when manual override is not requested', async () => {
    const service = new CheckinService();
    const now = Date.now();
    jest.spyOn(Visit, 'findOne').mockResolvedValue({
      id: 44,
      guest_id: 12,
      office_id: 1,
      status: 'APPROVED',
      scheduled_start: new Date(now - 10 * 60 * 1000),
      scheduled_end: new Date(now + 10 * 60 * 1000),
    } as any);

    (service as any).visitService = {
      getVisitForActor: jest.fn(async () => ({ id: 44, status: 'APPROVED' })),
      processStatusChange: jest.fn(),
    };

    const result = await service.checkinByQr(
      '550e8400-e29b-41d4-a716-446655440000',
      { id: 5, roles: ['reception'], office_id: 1 }
    );

    expect(result.status).toBe('APPROVED');
    expect((result as any).checkin_outcome).toBe('VALIDATED_ONLY');
    expect((service as any).visitService.getVisitForActor).toHaveBeenCalledWith(44, {
      id: 5,
      roles: ['reception'],
      office_id: 1,
    });
    expect((service as any).visitService.processStatusChange).not.toHaveBeenCalled();
  });

  it('allows privileged staff to force a manual check-in override', async () => {
    const service = new CheckinService();
    const now = Date.now();
    jest.spyOn(Visit, 'findOne').mockResolvedValue({
      id: 55,
      guest_id: 16,
      office_id: 2,
      status: 'APPROVED',
      scheduled_start: new Date(now - 10 * 60 * 1000),
      scheduled_end: new Date(now + 10 * 60 * 1000),
    } as any);

    (service as any).visitService = {
      getVisitForActor: jest.fn(),
      processStatusChange: jest.fn(async () => ({ visit: { id: 55, status: 'CHECKED_IN' }, changed: true })),
    };
    (service as any).guestService = {
      markGuestVisit: jest.fn(async () => undefined),
    };
    (service as any).credentialRepository = {
      findActiveByVisitId: jest.fn(async () => ({ id: 1, status: 'ACTIVE' })),
    };

    const result = await service.checkinByQr(
      '550e8400-e29b-41d4-a716-446655440001',
      { id: 9, roles: ['host'], office_id: 2 },
      { manual_override: true }
    );

    expect(result.status).toBe('CHECKED_IN');
    expect((result as any).checkin_outcome).toBe('CHECKED_IN');
    expect((service as any).visitService.processStatusChange).toHaveBeenCalledWith(
      55,
      { id: 9, roles: ['host'], office_id: 2 },
      'CHECKED_IN'
    );
  });

  it('skips duplicate audit log, confirmation email, and markGuestVisit when processStatusChange reports a no-op (race with another check-in)', async () => {
    // FIX regression coverage: two near-simultaneous check-ins for the same
    // visit (double-click, retry, or a UniFi webhook racing this manual
    // one) both used to run the audit/email/markGuestVisit side effects
    // unconditionally, even for the "losing" call that only produced a
    // no-op transition. processStatusChange now reports changed:false for
    // that case, and checkinByQr must skip its own side effects on it.
    const service = new CheckinService();
    const now = Date.now();
    jest.spyOn(Visit, 'findOne').mockResolvedValue({
      id: 66,
      guest_id: 20,
      office_id: 3,
      status: 'APPROVED',
      scheduled_start: new Date(now - 10 * 60 * 1000),
      scheduled_end: new Date(now + 10 * 60 * 1000),
    } as any);

    (service as any).visitService = {
      getVisitForActor: jest.fn(),
      processStatusChange: jest.fn(async () => ({ visit: { id: 66, status: 'CHECKED_IN' }, changed: false })),
    };
    const markGuestVisit = jest.fn(async () => undefined);
    (service as any).guestService = { markGuestVisit };
    (service as any).credentialRepository = {
      findActiveByVisitId: jest.fn(async () => ({ id: 1, status: 'ACTIVE' })),
    };

    const logAuditSpy = jest.spyOn(auditService, 'logAudit').mockResolvedValue(undefined as any);
    const enqueueJobSpy = jest.spyOn(outboxService, 'enqueueJob').mockResolvedValue(undefined as any);

    const result = await service.checkinByQr(
      '550e8400-e29b-41d4-a716-446655440002',
      { id: 12, roles: ['reception'], office_id: 3 },
      { manual_override: true }
    );

    expect(result.status).toBe('CHECKED_IN');
    expect((result as any).checkin_outcome).toBe('CHECKED_IN');
    expect(logAuditSpy).not.toHaveBeenCalled();
    expect(enqueueJobSpy).not.toHaveBeenCalled();
    expect(markGuestVisit).not.toHaveBeenCalled();
  });

  it('accepts a scan URL and extracts the QR token before lookup', async () => {
    const service = new CheckinService();
    const now = Date.now();
    const findOneSpy = jest.spyOn(Visit, 'findOne').mockResolvedValue({
      id: 44,
      guest_id: 12,
      office_id: 1,
      status: 'APPROVED',
      scheduled_start: new Date(now - 10 * 60 * 1000),
      scheduled_end: new Date(now + 10 * 60 * 1000),
    } as any);

    (service as any).visitService = {
      getVisitForActor: jest.fn(async () => ({ id: 44, status: 'APPROVED' })),
      processStatusChange: jest.fn(),
    };

    await service.checkinByQr(
      'http://localhost:7201/scan/visit?qr=550e8400-e29b-41d4-a716-446655440000',
      { id: 5, roles: ['reception'], office_id: 1 }
    );

    expect(findOneSpy).toHaveBeenCalledWith({
      where: { qr_code: '550e8400-e29b-41d4-a716-446655440000' },
    });
  });

  describe('manual override audit trail', () => {
    const buildService = (changed = true) => {
      const service = new CheckinService();
      jest.spyOn(Visit, 'findByPk').mockResolvedValue({
        id: 77,
        guest_id: 30,
        office_id: 4,
        status: 'APPROVED',
      } as any);
      (service as any).visitService = {
        processStatusChange: jest.fn(async () => ({ visit: { id: 77, status: 'CHECKED_IN' }, changed })),
      };
      (service as any).guestService = { markGuestVisit: jest.fn(async () => undefined) };
      (service as any).credentialRepository = {
        findActiveByVisitId: jest.fn(async () => ({ id: 1, status: 'ACTIVE' })),
      };
      jest.spyOn(outboxService, 'enqueueJob').mockResolvedValue(undefined as any);
      return service;
    };

    it('writes a SECURITY_POLICY_EXCEPTION row when no physical UniFi access grant exists', async () => {
      const service = buildService();
      const findOne = jest.spyOn(AuditLog, 'findOne').mockResolvedValue(null as any);
      const logAuditSpy = jest.spyOn(auditService, 'logAudit').mockResolvedValue(undefined as any);

      await service.manualCheckin(77, { id: 12, roles: ['reception'], office_id: 4 }, { notes: 'Door was offline' });

      // Looks the grant up on the real column names (entity / string entity_id).
      expect(findOne).toHaveBeenCalledWith({
        where: { entity: 'Visit', entity_id: '77', action: 'UNIFI_ACCESS_GRANTED' },
      });
      const actions = logAuditSpy.mock.calls.map((c) => c[1]);
      expect(actions).toEqual(['SECURITY_POLICY_EXCEPTION', 'CHECKIN_MANUAL_OVERRIDE']);
      expect(logAuditSpy.mock.calls[0].slice(0, 4)).toEqual([12, 'SECURITY_POLICY_EXCEPTION', 'Visit', 77]);
      expect(logAuditSpy.mock.calls[0][5]).toMatchObject({
        severity: 'MEDIUM',
        reconciliation_required: true,
        notes: 'Door was offline',
      });
    });

    it('writes only CHECKIN_MANUAL_OVERRIDE when the door controller already recorded the grant', async () => {
      const service = buildService();
      jest.spyOn(AuditLog, 'findOne').mockResolvedValue({ id: 1 } as any);
      const logAuditSpy = jest.spyOn(auditService, 'logAudit').mockResolvedValue(undefined as any);

      await service.manualCheckin(77, { id: 12, roles: ['reception'], office_id: 4 });

      expect(logAuditSpy.mock.calls.map((c) => c[1])).toEqual(['CHECKIN_MANUAL_OVERRIDE']);
    });

    it('still records the exception if the reconciliation lookup itself fails', async () => {
      const service = buildService();
      jest.spyOn(AuditLog, 'findOne').mockRejectedValue(new Error('db down') as never);
      const logAuditSpy = jest.spyOn(auditService, 'logAudit').mockResolvedValue(undefined as any);

      await service.manualCheckin(77, { id: 12, roles: ['reception'], office_id: 4 });

      expect(logAuditSpy.mock.calls.map((c) => c[1])).toContain('SECURITY_POLICY_EXCEPTION');
    });

    it('writes no audit rows for a no-op (lost race) manual check-in', async () => {
      const service = buildService(false);
      const findOne = jest.spyOn(AuditLog, 'findOne').mockResolvedValue(null as any);
      const logAuditSpy = jest.spyOn(auditService, 'logAudit').mockResolvedValue(undefined as any);

      await service.manualCheckin(77, { id: 12, roles: ['reception'], office_id: 4 });

      expect(findOne).not.toHaveBeenCalled();
      expect(logAuditSpy).not.toHaveBeenCalled();
    });

    it('also records the exception on the QR-screen manual_override path', async () => {
      const service = buildService();
      const now = Date.now();
      jest.spyOn(Visit, 'findOne').mockResolvedValue({
        id: 77,
        guest_id: 30,
        office_id: 4,
        status: 'APPROVED',
        scheduled_start: new Date(now - 60_000),
        scheduled_end: new Date(now + 60_000),
      } as any);
      jest.spyOn(AuditLog, 'findOne').mockResolvedValue(null as any);
      const logAuditSpy = jest.spyOn(auditService, 'logAudit').mockResolvedValue(undefined as any);

      await service.checkinByQr(
        '550e8400-e29b-41d4-a716-446655440077',
        { id: 12, roles: ['reception'], office_id: 4 },
        { manual_override: true },
      );

      expect(logAuditSpy.mock.calls.map((c) => c[1])).toEqual(['SECURITY_POLICY_EXCEPTION', 'CHECKIN_PERFORMED']);
    });
  });
});

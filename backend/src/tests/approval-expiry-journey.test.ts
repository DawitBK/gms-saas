import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { appConfig } from '../config/app.config';
import { ApprovalService } from '../modules/approvals/approval.service';
import { UniFiWebhookService } from '../modules/unifi-webhooks/unifi-webhook.service';
import * as auditService from '../shared/services/audit.service';
import * as outboxService from '../infrastructure/events/outbox.service';

describe('Approval to expiry journey', () => {
  let approvalService: ApprovalService;
  let webhookService: UniFiWebhookService;
  let previousWebhookSecret: string | undefined;

  beforeEach(() => {
    approvalService = new ApprovalService();
    webhookService = new UniFiWebhookService();
    previousWebhookSecret = appConfig.unifiAccess.webhookSecret;
    appConfig.unifiAccess.webhookSecret = 'test-secret';
    jest.spyOn(auditService, 'logAudit').mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    appConfig.unifiAccess.webhookSecret = previousWebhookSecret;
    jest.restoreAllMocks();
  });

  it('covers approval, UniFi access grant, and credential expiry handling', async () => {
    (approvalService as any).approvalRepository = {
      findVisitForDecision: jest.fn(async () => ({ id: 77, status: 'PENDING', guest_id: 12 })),
      create: jest.fn(async () => ({ id: 900, visit_id: 77, approver_id: 3, status: 'APPROVED', reason: null })),
      findByVisitId: jest.fn(),
    };
    (approvalService as any).visitService = {
      processStatusChange: jest.fn(async () => ({ visit: { id: 77, status: 'APPROVED' }, changed: true })),
    };
    (approvalService as any).credentialService = {
      ensureCredentialsForVisit: jest.fn(async () => ({ id: 501, status: 'ACTIVE' })),
    };
    jest.spyOn(outboxService, 'enqueueJob').mockResolvedValue(undefined as any);
    (approvalService as any).notificationService = {
      createNotification: jest.fn(async () => undefined),
    };

    const approvalResult = await approvalService.decideVisit(77, { id: 3, roles: ['admin'] }, { decision: 'APPROVED' } as any);
    expect(approvalResult.approval).toBeTruthy();
    expect(approvalResult.approval?.status).toBe('APPROVED');
    expect(outboxService.enqueueJob).not.toHaveBeenCalled();

    const credentialRecord = {
      id: 501,
      status: 'ACTIVE',
      metadata: { pin_code: '112233' },
      Visit: {
        id: 77,
        guest_id: 12,
        status: 'APPROVED',
      },
    };

    (webhookService as any).repository = {
      findEvent: jest.fn(async () => null),
      createEvent: jest.fn(async () => ({ id: 1 })),
      updateEventStatus: jest.fn(async () => undefined),
      findCredentialByExternalId: jest.fn(async () => null),
      findCredentialByExternalIdentityId: jest.fn(async (identityId: string) =>
        identityId === 'visitor-123' ? credentialRecord : null
      ),
      findCredentialByPinCode: jest.fn(async () => credentialRecord),
      findVisitByQrCode: jest.fn(async () => null),
      findVisitById: jest.fn(async () => null),
      updateCredential: jest.fn(async () => credentialRecord),
    };
    (webhookService as any).visitService = {
      processStatusChange: jest.fn(async () => ({ visit: { id: 77, status: 'CHECKED_IN' }, changed: true })),
    };
    (webhookService as any).notificationService = {
      createNotification: jest.fn(async () => undefined),
    };
    (webhookService as any).guestService = {
      markGuestVisit: jest.fn(async () => undefined),
    };

    const accessGrant = await webhookService.processWebhook('test-secret', {
      event: 'access.door.unlock',
      event_object_id: 'evt-door-1',
      data: {
        actor: { id: 'not-a-visitor-identity', type: 'user', name: 'Ada Lovelace' },
        location: { id: 'door-a', location_type: 'door', name: 'Main Door' },
        object: {
          authentication_type: 'PIN_CODE',
          authentication_value: '112233',
          result: 'Access Granted',
        },
      },
    });

    expect(accessGrant.status).toBe('PROCESSED');
    expect((((webhookService as any).visitService.processStatusChange) as any)).toHaveBeenCalledWith(
      77,
      expect.objectContaining({ id: 0, roles: ['super_admin'] }),
      'CHECKED_IN'
    );

    const expiryEvent = await webhookService.processWebhook('test-secret', {
      event_id: 'evt-expiry-1',
      event_type: 'credential.expired',
      identity_id: 'visitor-123',
      occurred_at: '2026-03-27T12:00:00.000Z',
    });

    expect(expiryEvent.status).toBe('PROCESSED');
    expect((((webhookService as any).repository.updateCredential) as any)).toHaveBeenCalledWith(
      501,
      expect.objectContaining({ status: 'EXPIRED' })
    );
  });

  it('treats duplicate access and exit events as already applied instead of replaying side effects', async () => {
    (webhookService as any).repository = {
      findEvent: jest.fn(async () => null),
      createEvent: jest.fn(async () => ({ id: 1 })),
      updateEventStatus: jest.fn(async () => undefined),
      findCredentialByExternalId: jest.fn(async () => null),
      findCredentialByExternalIdentityId: jest.fn(async () => ({
        id: 777,
        status: 'ACTIVE',
        metadata: { sync_confirmed_at: '2026-03-27T12:00:00.000Z' },
        Visit: {
          id: 88,
          guest_id: 12,
          status: 'CHECKED_IN',
        },
      })),
      findCredentialByPinCode: jest.fn(async () => null),
      findVisitByQrCode: jest.fn(async () => null),
      findVisitById: jest.fn(async (id: number) => ({
        id,
        guest_id: 12,
        status: id === 88 ? 'CHECKED_IN' : 'COMPLETED',
      })),
      updateCredential: jest.fn(async () => undefined),
    };
    (webhookService as any).visitService = {
      processStatusChange: jest.fn(async () => ({ visit: { id: 88, status: 'COMPLETED' }, changed: true })),
    };
    (webhookService as any).notificationService = {
      createNotification: jest.fn(async () => undefined),
    };
    (webhookService as any).guestService = {
      markGuestVisit: jest.fn(async () => undefined),
    };

    const duplicateAccess = await webhookService.processWebhook('test-secret', {
      event_id: 'evt-dup-access',
      event_type: 'access.granted',
      visit_id: 88,
    });

    const duplicateExit = await webhookService.processWebhook('test-secret', {
      event_id: 'evt-dup-exit',
      event_type: 'guest.exit',
      visit_id: 99,
    });

    const duplicateCredentialSync = await webhookService.processWebhook('test-secret', {
      event_id: 'evt-dup-sync',
      event_type: 'credential.synced',
      identity_id: 'visitor-123',
    });

    expect(duplicateAccess.status).toBe('IGNORED');
    expect(duplicateExit.status).toBe('IGNORED');
    expect(duplicateCredentialSync.status).toBe('IGNORED');
    expect((((webhookService as any).visitService.processStatusChange) as any)).not.toHaveBeenCalled();
    expect((((webhookService as any).notificationService.createNotification) as any)).not.toHaveBeenCalled();
    expect((((webhookService as any).guestService.markGuestVisit) as any)).not.toHaveBeenCalled();
    expect((((webhookService as any).repository.updateCredential) as any)).not.toHaveBeenCalled();
  });

  it('does not double-notify or double-audit when processStatusChange reports a no-op (lost a race with another check-in)', async () => {
    // FIX regression coverage: the pre-lock status checks in
    // handleAccessGranted can't see a concurrent mutation (e.g. a manual
    // check-in committing between this webhook's read and its own FOR
    // UPDATE lock). processStatusChange now reports changed:false for that
    // race, and handleAccessGranted must skip its notification/
    // markGuestVisit/audit side effects rather than replaying them.
    (webhookService as any).repository = {
      findEvent: jest.fn(async () => null),
      createEvent: jest.fn(async () => ({ id: 2 })),
      updateEventStatus: jest.fn(async () => undefined),
      findCredentialByExternalId: jest.fn(async () => null),
      findCredentialByExternalIdentityId: jest.fn(async () => null),
      findCredentialByPinCode: jest.fn(async () => null),
      findVisitByQrCode: jest.fn(async () => null),
      findVisitById: jest.fn(async () => ({
        id: 55,
        guest_id: 30,
        status: 'APPROVED',
      })),
      updateCredential: jest.fn(async () => undefined),
    };
    (webhookService as any).visitService = {
      processStatusChange: jest.fn(async () => ({ visit: { id: 55, status: 'CHECKED_IN' }, changed: false })),
    };
    const createNotification = jest.fn(async () => undefined);
    (webhookService as any).notificationService = { createNotification };
    const markGuestVisit = jest.fn(async () => undefined);
    (webhookService as any).guestService = { markGuestVisit };

    const result = await webhookService.processWebhook('test-secret', {
      event_id: 'evt-race-access',
      event_type: 'access.granted',
      visit_id: 55,
    });

    expect(result.status).toBe('IGNORED');
    expect((((webhookService as any).visitService.processStatusChange) as any)).toHaveBeenCalledWith(
      55,
      expect.objectContaining({ id: 0, roles: ['super_admin'] }),
      'CHECKED_IN'
    );
    expect(createNotification).not.toHaveBeenCalled();
    expect(markGuestVisit).not.toHaveBeenCalled();
    expect(auditService.logAudit).not.toHaveBeenCalledWith(
      null,
      'UNIFI_ACCESS_GRANTED',
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
  });

  it('ignores exit-direction denied events so guests do not receive false denial alerts', async () => {
    (webhookService as any).repository = {
      findEvent: jest.fn(async () => null),
      createEvent: jest.fn(async () => ({ id: 1 })),
      updateEventStatus: jest.fn(async () => undefined),
      findCredentialByExternalId: jest.fn(async () => null),
      findCredentialByExternalIdentityId: jest.fn(async () => null),
      findCredentialByPinCode: jest.fn(async () => null),
      findVisitByQrCode: jest.fn(async () => null),
      findVisitById: jest.fn(async () => ({
        id: 77,
        guest_id: 12,
        status: 'APPROVED',
      })),
      updateCredential: jest.fn(async () => undefined),
    };
    (webhookService as any).visitService = {
      processStatusChange: jest.fn(async () => ({ visit: { id: 77, status: 'CHECKED_IN' }, changed: true })),
    };
    (webhookService as any).notificationService = {
      createNotification: jest.fn(async () => undefined),
    };
    (webhookService as any).guestService = {
      markGuestVisit: jest.fn(async () => undefined),
    };

    const deniedExit = await webhookService.processWebhook('test-secret', {
      event_id: 'evt-exit-denied',
      event_type: 'access.denied',
      visit_id: 77,
      metadata: {
        target: [{ type: 'device_config', display_name: 'exit' }],
      },
    } as any);

    expect(deniedExit.status).toBe('IGNORED');
    expect((((webhookService as any).notificationService.createNotification) as any)).not.toHaveBeenCalled();
  });
});

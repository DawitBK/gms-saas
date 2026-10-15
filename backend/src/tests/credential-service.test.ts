import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { CredentialService } from '../modules/credentials/credential.service';
import * as outboxService from '../infrastructure/events/outbox.service';

jest.mock('../core/db/transaction', () => ({
  withTransaction: async (callback: (transaction: unknown) => Promise<unknown>) =>
    callback({ id: 'tx-credential-test', LOCK: { UPDATE: 'UPDATE' } }),
}));

describe('CredentialService provisioning flow', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('continues provisioning for checked-in visits and schedules the reminder against the assigned host', async () => {
    const service = new CredentialService();

    (service as any).credentialRepository = {
      findVisitContextForUpdate: jest.fn(async () => ({
        id: 90,
        guest_id: 12,
        assigned_host_id: 44,
        status: 'CHECKED_IN',
        qr_code: '550e8400-e29b-41d4-a716-446655440000',
        office_id: 3,
        scheduled_start: new Date('2026-04-03T10:00:00.000Z'),
        scheduled_end: new Date('2026-04-03T10:30:00.000Z'),
        guest: {
          full_name: 'Guest Name',
          email: 'guest@example.com',
          phone: '+1555900000001',
          guestProfile: { company: 'Acme' },
        },
      })),
      findProvisioningCandidateByVisitId: jest.fn(async () => null),
      isPinCodeInActiveUse: jest.fn(async () => false),
      createPin: jest.fn(async () => ({ id: 15, pin_code: '123456' })),
      createCredential: jest.fn(async () => ({ id: 81, metadata: { qr_code: '550e8400-e29b-41d4-a716-446655440000' } })),
      updateCredential: jest.fn(async () => ({ id: 81, status: 'ACTIVE' })),
      updatePin: jest.fn(async () => undefined),
    };
    (service as any).unifiService = {
      preparePinCode: jest.fn(async (pin: string) => pin),
      resolveDoorIds: jest.fn(() => ['door-1']),
      provisionGuestAccess: jest.fn(async () => ({
        provider: 'INTERNAL',
        externalCredentialId: 'cred-1',
        externalIdentityId: 'identity-1',
        doorIds: ['door-1'],
        metadata: { pin_code: '123456' },
      })),
    };
    (service as any).notificationService = {
      createNotification: jest.fn(async () => undefined),
    };
    jest.spyOn(outboxService, 'enqueueJob').mockResolvedValue(undefined as any);

    const result = await service.ensureCredentialsForVisit(90, 49);

    expect(result.status).toBe('ACTIVE');
    expect(outboxService.enqueueJob).toHaveBeenCalledWith(
      'REMINDERS',
      'ApprovedVisitReminder',
      expect.objectContaining({
        visitId: 90,
        guestId: 12,
        hostId: 44,
      })
    );
  });

  it('reuses an existing pending credential reservation without creating duplicates', async () => {
    const service = new CredentialService();

    const existingPending = {
      id: 501,
      status: 'PENDING',
      pin: { id: 777, pin_code: '987654' },
      metadata: { qr_code: '550e8400-e29b-41d4-a716-446655440111' },
    };

    const repo = {
      findVisitContextForUpdate: jest.fn(async () => ({
        id: 90,
        guest_id: 12,
        assigned_host_id: 44,
        status: 'APPROVED',
        qr_code: '550e8400-e29b-41d4-a716-446655440111',
        office_id: 3,
        scheduled_start: new Date('2026-04-03T10:00:00.000Z'),
        scheduled_end: new Date('2026-04-03T10:30:00.000Z'),
        guest: {
          full_name: 'Guest Name',
          email: 'guest@example.com',
          phone: '+1555900000001',
          guestProfile: { company: 'Acme' },
        },
      })),
      findProvisioningCandidateByVisitId: jest.fn(async () => existingPending),
      createPin: jest.fn(async () => ({ id: 15, pin_code: '123456' })),
      createCredential: jest.fn(async () => ({ id: 81, metadata: { qr_code: '550e8400-e29b-41d4-a716-446655440111' } })),
      updateCredential: jest.fn(async () => ({ id: 501, status: 'ACTIVE' })),
      updatePin: jest.fn(async () => undefined),
    };

    (service as any).credentialRepository = repo;
    (service as any).unifiService = {
      preparePinCode: jest.fn(async (pin: string) => pin),
      resolveDoorIds: jest.fn(() => ['door-1']),
      provisionGuestAccess: jest.fn(async () => ({
        provider: 'INTERNAL',
        externalCredentialId: 'cred-1',
        externalIdentityId: 'identity-1',
        doorIds: ['door-1'],
        metadata: { pin_code: '987654' },
      })),
    };
    (service as any).notificationService = {
      createNotification: jest.fn(async () => undefined),
    };
    jest.spyOn(outboxService, 'enqueueJob').mockResolvedValue(undefined as any);

    const result = await service.ensureCredentialsForVisit(90, 49);

    expect(result.status).toBe('ACTIVE');
    expect(repo.createCredential).not.toHaveBeenCalled();
    expect(repo.createPin).not.toHaveBeenCalled();
    expect((repo.findProvisioningCandidateByVisitId as any)).toHaveBeenCalledWith(
      90,
      expect.anything(),
    );
  });
});

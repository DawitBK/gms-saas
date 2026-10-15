import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { UniFiAccessService } from '../infrastructure/unifi/unifi.service';
import { appConfig } from '../config/app.config';

describe('UniFiAccessService', () => {
  let service: UniFiAccessService;
  const originalQrMode = appConfig.unifiAccess.qrMode;
  const originalIsProduction = appConfig.isProduction;

  beforeEach(() => {
    service = new UniFiAccessService();
    appConfig.unifiAccess.qrMode = 'unifi' as any;
  });

  afterEach(() => {
    appConfig.unifiAccess.qrMode = originalQrMode;
    appConfig.isProduction = originalIsProduction;
  });

  it('provisions visitor access through the documented visitor, QR, and PIN endpoints', async () => {
    const mockClient = {
      isConfigured: true,
      createVisitor: jest.fn(async () => ({ id: 'visitor-123' })),
      assignQrCode: jest.fn(async () => null),
      downloadQrCode: jest.fn(async () => Uint8Array.from([137, 80, 78, 71]).buffer),
      generatePinCode: jest.fn(async () => '884422'),
      assignPinCode: jest.fn(async () => null),
      unassignQrCode: jest.fn(),
      unassignPinCode: jest.fn(),
      deleteVisitor: jest.fn(),
      fetchSystemLogs: jest.fn(),
    };

    (service as any).client = mockClient;

    const result = await service.provisionGuestAccess({
      visitId: 18,
      guestName: 'Ada Lovelace',
      guestEmail: 'ada@example.com',
      guestPhone: '+1555911000000',
      guestCompany: 'Analytical Engines',
      qrCode: '550e8400-e29b-41d4-a716-446655440000',
      officeId: 1,
      validFrom: new Date('2026-03-27T10:00:00.000Z'),
      validUntil: new Date('2026-03-27T12:00:00.000Z'),
      doorIds: ['door-a', 'door-b'],
    });

    expect(mockClient.createVisitor as any).toHaveBeenCalled();
    expect(mockClient.assignQrCode as any).toHaveBeenCalledWith('visitor-123');
    expect(mockClient.generatePinCode as any).toHaveBeenCalled();
    expect(mockClient.assignPinCode as any).toHaveBeenCalledWith('visitor-123', '884422');
    expect(result.externalIdentityId).toBe('visitor-123');
    expect(result.metadata?.qr_code).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(result.metadata?.pin_code).toBe('884422');
    expect(result.metadata?.unifi_qr_assigned).toBe(true);
    expect(result.metadata?.unifi_pin_assigned).toBe(true);
    expect(result.metadata?.qr_delivery_source).toBe('unifi');
    expect(String(result.metadata?.unifi_qr_image_data_uri ?? '')).toContain('data:image/png;base64,');
  });

  it('revokes access by unassigning QR, unassigning PIN, and deleting the visitor', async () => {
    const mockClient = {
      isConfigured: true,
      createVisitor: jest.fn(),
      assignQrCode: jest.fn(),
      downloadQrCode: jest.fn(),
      generatePinCode: jest.fn(),
      assignPinCode: jest.fn(),
      unassignQrCode: jest.fn(async () => null),
      unassignPinCode: jest.fn(async () => null),
      deleteVisitor: jest.fn(async () => null),
      fetchSystemLogs: jest.fn(),
    };

    (service as any).client = mockClient;

    await service.revokeGuestAccess('visitor-456');

    expect(mockClient.unassignQrCode as any).toHaveBeenCalledWith('visitor-456');
    expect(mockClient.unassignPinCode as any).toHaveBeenCalledWith('visitor-456');
    expect(mockClient.deleteVisitor as any).toHaveBeenCalledWith('visitor-456');
  });

  it('uses a UniFi-generated pin in production even when a local fallback pin is supplied', async () => {
    const mockClient = {
      isConfigured: true,
      generatePinCode: jest.fn(async () => '4821'),
    };

    (service as any).client = mockClient;
    appConfig.isProduction = true;

    await expect(service.preparePinCode('123456')).resolves.toBe('4821');
    expect(mockClient.generatePinCode as any).toHaveBeenCalled();
  });

  it('falls back to the locally generated pin in production when UniFi pin generation is unreachable', async () => {
    const outage = Object.assign(new Error('fetch failed'), {
      cause: { code: 'ECONNREFUSED' },
    });
    const mockClient = {
      isConfigured: true,
      generatePinCode: jest.fn(async () => {
        throw outage;
      }),
    };

    (service as any).client = mockClient;
    appConfig.isProduction = true;

    await expect(service.preparePinCode('123456')).resolves.toBe('123456');
    expect(mockClient.generatePinCode as any).toHaveBeenCalled();
  });

  it('falls back to an internal credential in production when UniFi provisioning is unreachable', async () => {
    const outage = Object.assign(new Error('fetch failed'), {
      cause: { code: 'ETIMEDOUT' },
    });
    const mockClient = {
      isConfigured: true,
      createVisitor: jest.fn(async () => {
        throw outage;
      }),
      assignQrCode: jest.fn(),
      downloadQrCode: jest.fn(),
      generatePinCode: jest.fn(),
      assignPinCode: jest.fn(),
      unassignQrCode: jest.fn(),
      unassignPinCode: jest.fn(),
      deleteVisitor: jest.fn(),
      fetchSystemLogs: jest.fn(),
    };

    (service as any).client = mockClient;
    appConfig.isProduction = true;

    const result = await service.provisionGuestAccess({
      visitId: 18,
      guestName: 'Ada Lovelace',
      guestEmail: 'ada@example.com',
      guestPhone: '+1555911000000',
      guestCompany: 'Analytical Engines',
      qrCode: '550e8400-e29b-41d4-a716-446655440000',
      pinCode: '884422',
      officeId: 1,
      validFrom: new Date('2026-03-27T10:00:00.000Z'),
      validUntil: new Date('2026-03-27T12:00:00.000Z'),
      doorIds: ['door-a', 'door-b'],
    });

    expect(result.provider).toBe('INTERNAL');
    expect(result.externalIdentityId).toBeNull();
    expect(result.metadata?.fallback).toBe(true);
    expect(result.metadata?.unifi_outage_fallback).toBe(true);
    expect(result.metadata?.pin_code).toBe('884422');
    expect(result.metadata?.qr_delivery_source).toBe('system');
  });
});

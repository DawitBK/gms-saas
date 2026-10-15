import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { processSmsJobData } from '../infrastructure/queue/workers/sms.worker';
import { AccessCredential, User, Visit } from '../infrastructure/database/models';
import { SmsService } from '../infrastructure/sms/sms.service';

describe('SMS worker templates', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends booking sms using the guest phone and visit qr link (no raw QR code)', async () => {
    jest.spyOn(User, 'findByPk').mockResolvedValue({
      full_name: 'Jane Doe',
      phone: '+1555911000000',
    } as any);
    jest.spyOn(Visit, 'findByPk').mockResolvedValue({
      qr_code: '550e8400-e29b-41d4-a716-446655440000',
      scheduled_end: new Date('2026-04-03T15:00:00.000Z'),
    } as any);
    jest.spyOn(AccessCredential, 'findOne').mockResolvedValue(null);
    const sendSpy = jest.spyOn(SmsService.prototype, 'send').mockResolvedValue(undefined);

    await processSmsJobData('VisitCreatedSms', {
      to: '+1555911000000',
      message: 'QR link: https://portal.examplecorp.com/scan',
    });

    const sentPayload = sendSpy.mock.calls[0][0];
    expect(sentPayload.to).toBe('+1555911000000');
    expect(sentPayload.message).toContain('QR link:');
    expect(sentPayload.message).not.toContain('QR: 550e8400-e29b-41d4-a716-446655440000.');
  });

  it('sends approval sms with pin and qr link (no raw QR code) when credential data exists', async () => {
    jest.spyOn(User, 'findByPk').mockResolvedValue({
      full_name: 'Jane Doe',
      phone: '+1555911000000',
    } as any);
    jest.spyOn(Visit, 'findByPk').mockResolvedValue({
      qr_code: '550e8400-e29b-41d4-a716-446655440000',
      scheduled_end: new Date('2026-04-03T15:00:00.000Z'),
    } as any);
    jest.spyOn(AccessCredential, 'findOne').mockResolvedValue({
      metadata: { pin_code: '884422' },
    } as any);
    const sendSpy = jest.spyOn(SmsService.prototype, 'send').mockResolvedValue(undefined);

    await processSmsJobData('VisitApprovedSms', {
      to: '+1555911000000',
      message: 'PIN: 884422. QR link: https://portal.examplecorp.com/scan',
    });

    const sentPayload = sendSpy.mock.calls[0][0];
    expect(sentPayload.to).toBe('+1555911000000');
    expect(sentPayload.message).toContain('PIN: 884422.');
    expect(sentPayload.message).toContain('QR link:');
    expect(sentPayload.message).not.toContain('QR: 550e8400-e29b-41d4-a716-446655440000.');
  });
});

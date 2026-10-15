import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { processEmailJobData } from '../infrastructure/queue/workers/email.worker';
import { AccessCredential, User, Visit } from '../infrastructure/database/models';
import { EmailService } from '../infrastructure/email/email.service';
import { appConfig } from '../config/app.config';

describe('Email worker templates', () => {
  const originalClientUrl = appConfig.clientUrl;
  const originalIsProduction = appConfig.isProduction;

  afterEach(() => {
    appConfig.clientUrl = originalClientUrl;
    appConfig.isProduction = originalIsProduction;
    jest.restoreAllMocks();
  });

  it('sends approval email with the visit qr code', async () => {
    jest.spyOn(User, 'findByPk').mockResolvedValue({
      full_name: 'Jane Doe',
      email: 'jane@example.com',
    } as any);
    jest.spyOn(Visit, 'findByPk').mockResolvedValue({
      qr_code: '550e8400-e29b-41d4-a716-446655440000',
      scheduled_end: new Date('2026-04-03T15:00:00.000Z'),
    } as any);
    jest.spyOn(AccessCredential, 'findOne').mockResolvedValue({
      metadata: {
        pin_code: '884422',
        qr_delivery_source: 'unifi',
        unifi_qr_image_data_uri: 'data:image/png;base64,dGVzdA==',
      },
    } as any);
    const sendSpy = jest.spyOn(EmailService.prototype, 'send').mockResolvedValue(undefined);

    await processEmailJobData('VisitApprovedEmail', {
      visitId: 20,
      guestId: 8,
      template: 'APPROVED',
    });

    const sentEmail = sendSpy.mock.calls[0]?.[0];
    expect(sentEmail?.to).toBe('jane@example.com');
    expect(sentEmail?.subject).toBe('Your visit has been approved');
    expect(String(sentEmail?.html ?? '')).toContain('data:image/png;base64,dGVzdA==');
    expect(String(sentEmail?.html ?? '')).toContain('/scan/visit?qr=550e8400-e29b-41d4-a716-446655440000');
    expect(sentEmail?.attachments).toEqual([
      expect.objectContaining({
        filename: 'visit-20-qr.png',
        contentType: 'image/png',
        disposition: 'attachment',
      }),
    ]);
  });

  it('sends escalated email when reception intervention is required', async () => {
    jest.spyOn(User, 'findByPk').mockResolvedValue({
      full_name: 'Jane Doe',
      email: 'jane@example.com',
    } as any);
    jest.spyOn(Visit, 'findByPk').mockResolvedValue({
      qr_code: '550e8400-e29b-41d4-a716-446655440001',
      scheduled_end: new Date('2026-04-03T16:00:00.000Z'),
    } as any);
    jest.spyOn(AccessCredential, 'findOne').mockResolvedValue(null);
    const sendSpy = jest.spyOn(EmailService.prototype, 'send').mockResolvedValue(undefined);

    await processEmailJobData('VisitEscalated', {
      visitId: 21,
      guestId: 8,
      template: 'ESCALATED',
    });

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'jane@example.com',
        subject: 'Reception is reviewing your visit',
        html: expect.stringContaining('Reception follow-up required'),
        attachments: [
          expect.objectContaining({
            filename: 'visit-21-qr.png',
            contentType: 'image/png',
          }),
        ],
      })
    );
  });

  it('omits localhost scan links when production is still pointed at loopback', async () => {
    appConfig.clientUrl = 'http://localhost:7201' as any;
    appConfig.isProduction = true as any;

    jest.spyOn(User, 'findByPk').mockResolvedValue({
      full_name: 'Jane Doe',
      email: 'jane@example.com',
    } as any);
    jest.spyOn(Visit, 'findByPk').mockResolvedValue({
      qr_code: '550e8400-e29b-41d4-a716-446655440111',
      scheduled_end: new Date('2026-04-03T15:00:00.000Z'),
    } as any);
    jest.spyOn(AccessCredential, 'findOne').mockResolvedValue({
      metadata: { pin_code: '884422' },
    } as any);
    const sendSpy = jest.spyOn(EmailService.prototype, 'send').mockResolvedValue(undefined);

    await processEmailJobData('VisitApprovedEmail', {
      visitId: 20,
      guestId: 8,
      template: 'APPROVED',
    });

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
    html: expect.not.stringContaining('http://localhost:7201/scan/visit?qr=550e8400-e29b-41d4-a716-446655440111'),
      })
    );
  });
});

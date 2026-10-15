import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import nodemailer from 'nodemailer';
import { appConfig } from '../config/app.config';
import { EmailService } from '../infrastructure/email/email.service';
import * as sentryService from '../shared/services/sentry.service';

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: jest.fn(),
  },
}));

describe('EmailService', () => {
  const originalSendgrid = { ...appConfig.sendgrid };
  const originalSmtp = { ...appConfig.smtp };
  const originalIsProduction = appConfig.isProduction;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    appConfig.isProduction = false as any;
    appConfig.sendgrid.apiKey = undefined as any;
    appConfig.sendgrid.fromEmail = undefined as any;
    appConfig.smtp.host = undefined as any;
    appConfig.smtp.port = 587 as any;
    appConfig.smtp.user = undefined as any;
    appConfig.smtp.pass = undefined as any;
    appConfig.smtp.fromEmail = undefined as any;
    global.fetch = jest.fn() as any;
  });

  afterEach(() => {
    appConfig.sendgrid.apiKey = originalSendgrid.apiKey;
    appConfig.sendgrid.fromEmail = originalSendgrid.fromEmail;
    appConfig.smtp.host = originalSmtp.host;
    appConfig.smtp.port = originalSmtp.port;
    appConfig.smtp.user = originalSmtp.user;
    appConfig.smtp.pass = originalSmtp.pass;
    appConfig.smtp.fromEmail = originalSmtp.fromEmail;
    appConfig.isProduction = originalIsProduction;
    global.fetch = originalFetch;
  });

  it('falls back to SMTP when SendGrid is not configured', async () => {
    const sendMail: any = jest.fn(async () => undefined);
    (nodemailer.createTransport as unknown as jest.Mock).mockReturnValue({ sendMail });

    appConfig.smtp.host = 'smtp.example.com' as any;
    appConfig.smtp.port = 2525 as any;
    appConfig.smtp.fromEmail = 'no-reply@example.com' as any;

    const service = new EmailService();
    await service.send({
      to: 'guest@example.com',
      subject: 'Approved',
      html: '<p>Hello</p>',
    });

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 2525,
      secure: false,
      auth: undefined,
    });
    expect(sendMail.mock.calls[0][0]).toEqual({
      from: 'no-reply@example.com',
      to: 'guest@example.com',
      subject: 'Approved',
      text: 'Hello',
      html: '<p>Hello</p>',
    });
  });

  it('prefers SMTP when both SendGrid and SMTP are configured', async () => {
    const sendMail: any = jest.fn(async () => undefined);
    (nodemailer.createTransport as unknown as jest.Mock).mockReturnValue({ sendMail });
    global.fetch = jest.fn(async () => ({ ok: true })) as any;

    appConfig.sendgrid.apiKey = 'sendgrid-key' as any;
    appConfig.sendgrid.fromEmail = 'sendgrid@example.com' as any;
    appConfig.smtp.host = 'smtp.example.com' as any;
    appConfig.smtp.port = 2525 as any;
    appConfig.smtp.fromEmail = 'smtp@example.com' as any;

    const service = new EmailService();
    await service.send({
      to: 'guest@example.com',
      subject: 'Approved',
      html: '<p>Hello</p>',
    });

    // SMTP is the primary provider in every environment now (previously
    // development prioritized SendGrid, which silently masked a broken/
    // unverified SendGrid sender identity because SendGrid returning a
    // non-error response short-circuited the send before SMTP was ever
    // tried). SendGrid remains available strictly as a fallback.
    expect(nodemailer.createTransport).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('prefers SMTP first and falls back to SendGrid on SMTP failure', async () => {
    const sendMail: any = jest.fn(async () => {
      throw new Error('smtp offline');
    });
    (nodemailer.createTransport as unknown as jest.Mock).mockReturnValue({ sendMail });
    global.fetch = jest.fn(async () => ({ ok: true })) as any;

    appConfig.isProduction = true as any;
    appConfig.sendgrid.apiKey = 'sendgrid-key' as any;
    appConfig.sendgrid.fromEmail = 'sendgrid@example.com' as any;
    appConfig.smtp.host = 'smtp.example.com' as any;
    appConfig.smtp.port = 2525 as any;
    appConfig.smtp.fromEmail = 'smtp@example.com' as any;

    const service = new EmailService();
    await service.send({
      to: 'guest@example.com',
      subject: 'Approved',
      html: '<p>Hello</p>',
    });

    expect(nodemailer.createTransport).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalled();
  });

  it('captures provider failures for Sentry visibility', async () => {
    const captureSpy = jest.spyOn(sentryService, 'captureException').mockImplementation(() => undefined);
    global.fetch = jest.fn(async () => ({ ok: false, status: 401, text: async () => 'unauthorized' })) as any;

    appConfig.sendgrid.apiKey = 'sendgrid-key' as any;
    appConfig.sendgrid.fromEmail = 'sendgrid@example.com' as any;

    const service = new EmailService();

    await expect(
      service.send({
        to: 'guest@example.com',
        subject: 'Approved',
        html: '<p>Hello</p>',
      })
    ).rejects.toThrow('SendGrid request failed (401): unauthorized');

    expect(captureSpy).toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  OTP_PAYLOAD_KEYS,
  openSealedOtp,
  otpEmailJobPayload,
  redactOtpFields,
  resolveJobOtp,
  sealOtp,
} from '../shared/utils/otp';
import { AuthService } from '../modules/auth/auth.service';
import { AuthRepository } from '../modules/auth/auth.repository';
import * as outboxService from '../infrastructure/events/outbox.service';

/**
 * One-time codes must never reach outbox_events.payload (or a BullMQ job) in
 * clear text: they are sealed when queued, opened by the e-mail worker at send
 * time, and redacted once the row is dispatched (outbox-otp-redaction.test.ts).
 */
describe('sealed one-time codes for the queue hand-off', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  it('round-trips and does not contain the code', () => {
    const sealed = sealOtp('048213', 17);
    expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]+$/);
    expect(sealed).not.toContain('048213');
    expect(openSealedOtp(sealed, 17)).toBe('048213');
  });

  it('uses a fresh nonce each time', () => {
    expect(sealOtp('123456', 1)).not.toBe(sealOtp('123456', 1));
  });

  it('refuses another account, tampering and garbage', () => {
    const sealed = sealOtp('123456', 17);
    expect(openSealedOtp(sealed, 18)).toBeNull();
    expect(openSealedOtp(sealed.slice(0, -2) + (sealed.endsWith('AA') ? 'BB' : 'AA'), 17)).toBeNull();
    expect(openSealedOtp('v1.', 17)).toBeNull();
    expect(openSealedOtp('123456', 17)).toBeNull();
    expect(openSealedOtp(null, 17)).toBeNull();
    expect(openSealedOtp(undefined, 17)).toBeNull();
  });

  it('builds a job payload with no plaintext code', () => {
    const payload = otpEmailJobPayload(9, '654321', 'PASSWORD_RESET');
    expect(payload).toEqual({ guestId: 9, otp_sealed: expect.any(String), template: 'PASSWORD_RESET' });
    expect(JSON.stringify(payload)).not.toContain('654321');
    expect('otp' in payload).toBe(false);
  });

  describe('resolveJobOtp', () => {
    it('opens a sealed payload', () => {
      expect(resolveJobOtp(otpEmailJobPayload(9, '654321', 'TWO_FACTOR_AUTH'))).toBe('654321');
    });
    it('still accepts a legacy plaintext payload queued by the previous build', () => {
      expect(resolveJobOtp({ guestId: 9, otp: '654321' })).toBe('654321');
    });
    it('returns null for a redacted payload or a malformed code', () => {
      expect(resolveJobOtp({ guestId: 9 })).toBeNull();
      expect(resolveJobOtp({ guestId: 9, otp: 'abc' })).toBeNull();
      expect(resolveJobOtp({ guestId: 9, otp_sealed: 'v1.zzzz' })).toBeNull();
    });
  });

  describe('redactOtpFields', () => {
    it('removes every code key and marks the copy, without mutating the input', () => {
      const input = { guestId: 1, template: 'PASSWORD_RESET', otp: '111111', otp_sealed: 'v1.x' };
      const out = redactOtpFields(input) as Record<string, unknown>;
      for (const key of OTP_PAYLOAD_KEYS) expect(key in out).toBe(false);
      expect(out).toEqual({ guestId: 1, template: 'PASSWORD_RESET', otp_redacted: true });
      expect(input.otp).toBe('111111');
    });
    it('returns a payload without a code untouched', () => {
      const input = { visitId: 3 };
      expect(redactOtpFields(input)).toBe(input);
    });
  });
});

describe('AuthService queues no plaintext code', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  it('password reset: the e-mail job carries otp_sealed, and it opens to the code stored as a hash', async () => {
    const update = jest.fn(async (_values: Record<string, unknown>) => undefined);
    jest.spyOn(AuthRepository.prototype, 'findUserByEmail').mockResolvedValue({
      id: 31,
      toJSON: () => ({ id: 31, reset_password_otp: null, reset_password_otp_at: null }),
      update,
    } as any);
    const enqueue = jest.spyOn(outboxService, 'enqueueJob').mockResolvedValue(undefined as any);

    await new AuthService().requestPasswordReset('someone@example.com');

    const payload = enqueue.mock.calls[0][2] as Record<string, unknown>;
    expect(payload.template).toBe('PASSWORD_RESET');
    expect(payload.guestId).toBe(31);
    expect('otp' in payload).toBe(false);
    const code = resolveJobOtp(payload as any) as string;
    expect(code).toMatch(/^\d{6}$/);
    expect(JSON.stringify(payload)).not.toContain(code);
    // The users table still gets only the keyed digest of that same code.
    const stored = update.mock.calls[0][0].reset_password_otp as string;
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    expect(stored).not.toContain(code);
  });

  it('resend verification: the e-mail job carries otp_sealed, not otp', async () => {
    jest.spyOn(AuthRepository.prototype, 'findUserByEmail').mockResolvedValue({
      id: 5,
      toJSON: () => ({ id: 5, email_verified: false }),
    } as any);
    jest.spyOn(AuthRepository.prototype, 'updateUserOtp').mockResolvedValue(undefined as any);
    const enqueue = jest.spyOn(outboxService, 'enqueueJob').mockResolvedValue(undefined as any);

    await new AuthService().resendVerification('guest@example.com');

    const payload = enqueue.mock.calls[0][2] as Record<string, unknown>;
    expect(payload.template).toBe('REGISTRATION_VERIFICATION');
    expect('otp' in payload).toBe(false);
    expect(resolveJobOtp(payload as any)).toMatch(/^\d{6}$/);
  });
});

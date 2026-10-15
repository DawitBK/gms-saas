import { generateOtp, hashOtp, otpMatches, otpChallengeIsLive, OTP_PATTERN } from '../shared/utils/otp';
import { constantTimeEquals } from '../shared/utils/constant-time';

/**
 * Covers the 2026-09-04 change that stopped storing one-time codes in
 * plaintext, and the shared constant-time primitive it leans on.
 *
 * The case that matters most for the deployment is the legacy one: gmsprod has
 * live plaintext codes in `users.registration_otp` and friends at the moment
 * the new build starts, and the people holding those codes are mid-registration
 * or mid-password-reset. If the switch invalidated them, those users would be
 * stuck — password reset is exactly the route someone uses when they already
 * cannot get in. So "an old plaintext row still verifies" is not a
 * nice-to-have, it is the property that makes this shippable without a
 * maintenance window.
 */
describe('OTP storage', () => {
  const USER = 4242;

  describe('generation', () => {
    it('produces a six-digit code across the full keyspace', () => {
      for (let i = 0; i < 200; i += 1) {
        expect(generateOtp()).toMatch(OTP_PATTERN);
      }
    });
  });

  describe('hashed storage (post-2026-09-04)', () => {
    it('stores a 64-char hex digest, not the code', () => {
      const stored = hashOtp('123456', USER);
      expect(stored).toMatch(/^[0-9a-f]{64}$/);
      expect(stored).not.toContain('123456');
    });

    it('verifies the code that produced it', () => {
      expect(otpMatches(hashOtp('123456', USER), '123456', USER)).toBe(true);
    });

    it('rejects a different code', () => {
      expect(otpMatches(hashOtp('123456', USER), '123457', USER)).toBe(false);
    });

    it('is deterministic for the same code and user', () => {
      expect(hashOtp('000000', USER)).toBe(hashOtp('000000', USER));
    });

    it('binds the digest to the account, so a row lifted from one user does not verify against another', () => {
      const stored = hashOtp('123456', USER);
      expect(otpMatches(stored, '123456', USER + 1)).toBe(false);
    });

    it('refuses to verify a hashed row when no user id is supplied', () => {
      // Guards against a future call site forgetting the third argument and
      // silently getting a permanent false rather than an obvious failure.
      expect(otpMatches(hashOtp('123456', USER), '123456')).toBe(false);
    });
  });

  describe('legacy plaintext rows written before the change', () => {
    it('still verifies, so codes in flight at deploy time keep working', () => {
      expect(otpMatches('123456', '123456', USER)).toBe(true);
    });

    it('still rejects a wrong code', () => {
      expect(otpMatches('123456', '654321', USER)).toBe(false);
    });
  });

  describe('the null-vs-null hole this primitive was written to close', () => {
    it.each([
      [null, null],
      [undefined, undefined],
      [null, '123456'],
      ['123456', null],
      ['', ''],
      ['123456', ''],
      [123456, 123456],
    ])('rejects stored=%p submitted=%p', (stored, submitted) => {
      expect(otpMatches(stored, submitted, USER)).toBe(false);
    });
  });

  describe('challenge liveness', () => {
    it('treats a missing or unparseable timestamp as no live challenge', () => {
      expect(otpChallengeIsLive(null, 60_000)).toBe(false);
      expect(otpChallengeIsLive(undefined, 60_000)).toBe(false);
      expect(otpChallengeIsLive('not a date', 60_000)).toBe(false);
    });

    it('accepts a fresh timestamp and rejects an expired one', () => {
      expect(otpChallengeIsLive(new Date(), 60_000)).toBe(true);
      expect(otpChallengeIsLive(new Date(Date.now() - 120_000), 60_000)).toBe(false);
    });
  });
});

describe('constantTimeEquals', () => {
  it('matches equal values', () => {
    expect(constantTimeEquals('hunter2', 'hunter2')).toBe(true);
    expect(constantTimeEquals(Buffer.from('abc'), Buffer.from('abc'))).toBe(true);
  });

  it('rejects different values of the SAME length', () => {
    expect(constantTimeEquals('hunter2', 'hunter3')).toBe(false);
  });

  it('rejects different values of DIFFERENT lengths without throwing', () => {
    // The whole point: timingSafeEqual throws on a length mismatch, which is
    // why every call site used to guard it with a short-circuiting length
    // check that leaked the expected value's length.
    expect(constantTimeEquals('short', 'a-much-longer-secret')).toBe(false);
  });

  it('rejects a missing operand', () => {
    expect(constantTimeEquals(null, 'x')).toBe(false);
    expect(constantTimeEquals('x', undefined)).toBe(false);
    expect(constantTimeEquals(undefined, undefined)).toBe(false);
  });

  it('rejects the empty string against a real secret', () => {
    expect(constantTimeEquals('', 'the-real-secret')).toBe(false);
  });
});

'use strict';

/**
 * Per-account OTP attempt counters.
 *
 * WHY: nothing in GMS counted failed OTP submissions. The only throttle on
 * `POST /auth/reset-password` and `POST /auth/verify-2fa` was the per-IP
 * `authLimiter`, which does not bound attempts against a SINGLE account from
 * many sources — and, until the companion fix in
 * `shared/middleware/rateLimiter.ts`, could be switched off entirely by an
 * ambient `DISABLE_RATE_LIMIT=true`. A six-digit code is a 10^6 keyspace and
 * the reset code is valid for 30 minutes, so with no per-account ceiling it was
 * grindable and the account never locked.
 *
 * These two columns back `AuthService.registerOtpFailure`, which burns the
 * outstanding code once the ceiling (5) is reached — forcing the attacker back
 * through the throttled `requestPasswordReset` rather than letting them keep
 * hammering one live code.
 *
 * Deliberately NOT NULL DEFAULT 0: the service reads
 * `Number(user[field] ?? 0) + 1`, so a NULL would work, but a real default
 * keeps the column honest for anyone querying it directly and avoids a
 * three-state (null / 0 / n) column for a plain counter.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'reset_password_otp_attempts', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn('users', 'two_factor_otp_attempts', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'two_factor_otp_attempts');
    await queryInterface.removeColumn('users', 'reset_password_otp_attempts');
  },
};

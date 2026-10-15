'use strict';

/**
 * The third OTP counter — the one that was missed.
 *
 * 20260822000000 added per-account attempt ceilings for the password-reset and
 * two-factor codes, and left the registration code without one. That is the
 * OTP with the largest consequence: `verifyRegistration` finalises the account
 * and then AUTO-ISSUES A FULL LOGIN SESSION ("Auto-login after verification"),
 * so guessing it is not a step toward an account, it is the account — with no
 * password required at any point, and with everything registration collects
 * attached to it (government ID, uploaded document, phone).
 *
 * Until this column existed, `registerOtpFailure` could not even be called for
 * registration: its `kind` parameter was typed `"reset_password" | "two_factor"`
 * because there was nowhere to write a registration count. The only thing
 * standing between an attacker and a 10^6 keyspace was the shared per-IP
 * `authLimiter` — 10 requests a minute across nine routes — which bounds one
 * source and not one account, and is defeated by spreading the guesses.
 *
 * Same shape as its two siblings so `registerOtpFailure` can treat all three
 * identically: NOT NULL DEFAULT 0, reset to 0 when the code is burned.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('users');
    if (table.registration_otp_attempts) return;

    await queryInterface.addColumn('users', 'registration_otp_attempts', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('users');
    if (!table.registration_otp_attempts) return;
    await queryInterface.removeColumn('users', 'registration_otp_attempts');
  },
};

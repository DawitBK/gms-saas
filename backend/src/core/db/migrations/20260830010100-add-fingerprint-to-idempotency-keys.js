'use strict';

/**
 * Adds a request fingerprint to idempotency_keys so a reused Idempotency-Key
 * against a genuinely DIFFERENT request (different user, different endpoint,
 * or different body) is rejected with 409 instead of silently replaying the
 * first request's cached response.
 *
 * user_id/endpoint/request_hash are nullable: rows created by an
 * already-in-flight request during a rolling deploy (old code, no
 * fingerprint) must not break the read path in idempotency.middleware.ts —
 * a null request_hash is treated there as "nothing to compare against", not
 * as a stored empty hash.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('idempotency_keys', 'user_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('idempotency_keys', 'endpoint', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.addColumn('idempotency_keys', 'request_hash', {
      type: Sequelize.STRING(64), // hex-encoded sha256
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('idempotency_keys', 'request_hash');
    await queryInterface.removeColumn('idempotency_keys', 'endpoint');
    await queryInterface.removeColumn('idempotency_keys', 'user_id');
  },
};

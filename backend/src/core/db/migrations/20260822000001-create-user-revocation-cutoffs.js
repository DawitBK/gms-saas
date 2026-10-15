'use strict';

/**
 * Durable session-revocation cutoffs (P1-13).
 *
 * WHY: revocation lived only in Redis, and the WRITE path failed open in
 * silence — `if (!redisClient) { logger.warn(...); return; }` returned as though
 * the revocation had succeeded. During a Redis outage the read path correctly
 * rejected every authenticated request, but any revocation ISSUED during that
 * outage was lost permanently: nothing retried it, no caller was told, and the
 * moment Redis came back the offboarded user's tokens worked again. Suspending or
 * offboarding someone at the wrong minute simply did not take effect.
 *
 * This table is the durable record. `revokeUserSessions` writes here FIRST and
 * only then mirrors to Redis (which stays the hot path — one GET per
 * authenticated request), and `isSessionRevoked` falls back to reading here when
 * Redis is unreachable, so a Redis outage degrades to slower auth instead of
 * either 503-ing every request or silently forgetting revocations.
 *
 * One row per user, upserted: only the latest cutoff matters, and a cutoff only
 * ever moves forward.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('user_revocation_cutoffs', {
      user_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        allowNull: false,
      },
      // Unix seconds, matching the JWT `iat` this is compared against. Storing
      // the same unit the comparison uses avoids a timezone/precision conversion
      // on the auth hot path.
      cutoff_at: {
        type: Sequelize.BIGINT,
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('user_revocation_cutoffs');
  },
};

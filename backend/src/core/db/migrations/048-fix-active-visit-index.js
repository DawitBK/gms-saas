'use strict';

/**
 * Migration to refine the active visit unique index.
 * It now excludes all terminal states (CANCELLED, DECLINED, NO_SHOW, COMPLETED, EXPIRED)
 * and explicitly ignores soft-deleted visits to allow re-booking released slots without
 * database-level conflicts.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS visits_active_time_slot_booking_idx;
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX visits_active_time_slot_booking_idx
      ON visits (time_slot_id)
      WHERE time_slot_id IS NOT NULL
        AND deleted_at IS NULL
        AND status NOT IN ('CANCELLED', 'DECLINED', 'NO_SHOW', 'COMPLETED', 'EXPIRED');
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS visits_active_time_slot_booking_idx;
    `);

    // Revert to 031 state
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX visits_active_time_slot_booking_idx
      ON visits (time_slot_id)
      WHERE time_slot_id IS NOT NULL
        AND status NOT IN ('CANCELLED', 'DECLINED');
    `);
  },
};

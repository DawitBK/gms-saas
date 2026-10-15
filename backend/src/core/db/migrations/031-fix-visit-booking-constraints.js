'use strict';

/**
 * Booking should lock a concrete time slot, not block every overlapping visit in an office.
 * This migration removes the overly broad office-wide EXCLUDE constraint, repairs malformed
 * active visits with null schedules, and enforces one active visit per time slot instead.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE visits
      SET status = 'CANCELLED',
          updated_at = NOW()
      WHERE status NOT IN ('CANCELLED', 'DECLINED')
        AND (scheduled_start IS NULL OR scheduled_end IS NULL);
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE visits
      DROP CONSTRAINT IF EXISTS visits_no_overlap_per_office;
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS visits_active_time_slot_booking_idx;
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX visits_active_time_slot_booking_idx
      ON visits (time_slot_id)
      WHERE time_slot_id IS NOT NULL
        AND status NOT IN ('CANCELLED', 'DECLINED');
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS visits_active_time_slot_booking_idx;
    `);

    await queryInterface.sequelize.query(`
      CREATE EXTENSION IF NOT EXISTS btree_gist;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE visits
        ADD CONSTRAINT visits_no_overlap_per_office
        EXCLUDE USING gist (
          office_id WITH =,
          tstzrange(scheduled_start, scheduled_end, '[)') WITH &&
        )
        WHERE (
          status NOT IN ('CANCELLED', 'DECLINED')
          AND scheduled_start IS NOT NULL
          AND scheduled_end IS NOT NULL
        );
    `);
  },
};

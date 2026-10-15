'use strict';

/**
 * Restores DB-level double-booking protection for visits that have no
 * time_slot_id.
 *
 * WHY: migration 031 (fix-visit-booking-constraints) deliberately dropped the
 * office-wide EXCLUDE constraint in favor of a narrower unique index on
 * `time_slot_id`, because booking should lock a concrete time slot, not
 * block every overlapping visit in an office. That's the right call for
 * slot-based bookings. But `time_slot_id` is nullable — any visit scheduled
 * with a `scheduled_start`/`scheduled_end` window and no slot has had ZERO
 * DB-level overlap protection since 031 landed, silently. This migration
 * reinstates the original office-wide overlap guard, scoped with
 * `WHERE time_slot_id IS NULL` so it only covers the case 031/048 left
 * uncovered — it does not touch or re-restrict slot-based bookings at all.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE EXTENSION IF NOT EXISTS btree_gist;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE visits
        ADD CONSTRAINT visits_no_overlap_per_office_unslotted
        EXCLUDE USING gist (
          office_id WITH =,
          tstzrange(scheduled_start, scheduled_end, '[)') WITH &&
        )
        WHERE (
          time_slot_id IS NULL
          AND deleted_at IS NULL
          AND status NOT IN ('CANCELLED', 'DECLINED', 'NO_SHOW', 'COMPLETED', 'EXPIRED')
          AND scheduled_start IS NOT NULL
          AND scheduled_end IS NOT NULL
        );
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE visits DROP CONSTRAINT IF EXISTS visits_no_overlap_per_office_unslotted;
    `);
  },
};

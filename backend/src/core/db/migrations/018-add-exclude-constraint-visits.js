'use strict';

/**
 * Phase 9: Database-Level EXCLUDE constraint via PostgreSQL GIST index.
 *
 * This is the most critical constraint in the system. Even if the application-layer
 * pessimistic lock fails (network partition, worker crash), the database itself
 * will REJECT any INSERT/UPDATE that produces an overlapping booking for the same office.
 *
 * The constraint: no two active visits can share the same office_id with overlapping
 * [scheduled_start, scheduled_end) time ranges.
 */
module.exports = {
  async up(queryInterface) {
    // Requires the btree_gist extension (available in all modern Postgres versions)
    await queryInterface.sequelize.query(`
      CREATE EXTENSION IF NOT EXISTS btree_gist;
    `);

    // Add the EXCLUDE constraint — excludes rows where BOTH:
    //   office_id = office_id  AND  tstzrange overlaps
    // The filter ensures cancelled/declined visits and unscheduled drafts
    // don't participate in the overlap constraint.
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

    // Also enforce unique slot booking at the DB level (belt-and-suspenders)
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX idx_time_slots_unique_booking
        ON time_slots (host_id, start_time)
        WHERE is_booked = TRUE;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE visits DROP CONSTRAINT IF EXISTS visits_no_overlap_per_office;
    `);
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS idx_time_slots_unique_booking;
    `);
  },
};

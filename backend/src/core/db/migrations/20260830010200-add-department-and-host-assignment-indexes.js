'use strict';

/**
 * Two missing indexes found during the Phase 7-9 code review:
 *
 * - visits.department_id has no dedicated index anywhere — it's an FK column
 *   (Sequelize/Postgres does not auto-index FK columns on createTable), and
 *   nothing in the 054-add-performance-indexes.js batch covers it.
 *
 * - visit_assignments.host_id has no host_id-leading index — the two
 *   existing indexes on this table (idx_visit_assignments_current on
 *   (visit_id, is_current), idx_visit_assignments_visit on (visit_id,
 *   created_at)) both lead with visit_id, but host-assignment.repository.ts's
 *   findLastCurrentAssignmentsForHosts filters by host_id first
 *   (`WHERE host_id IN (...) AND is_current = true ORDER BY assigned_at DESC`).
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_visits_department_id ON visits (department_id);
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_visit_assignments_host_current_assigned
        ON visit_assignments (host_id, is_current, assigned_at DESC);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS idx_visit_assignments_host_current_assigned;
    `);
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS idx_visits_department_id;
    `);
  },
};

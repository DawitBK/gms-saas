'use strict';

/**
 * Enforce exactly one in-flight/active credential record per visit.
 * Before adding the index, collapse historical duplicates by keeping the
 * newest row per visit in (PENDING, ACTIVE) and marking older rows FAILED.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY visit_id
            ORDER BY
              CASE WHEN status = 'ACTIVE' THEN 0 ELSE 1 END,
              COALESCE(provisioned_at, updated_at, created_at) DESC,
              id DESC
          ) AS rn
        FROM access_credentials
        WHERE status IN ('PENDING', 'ACTIVE')
      ),
      duplicates AS (
        SELECT id
        FROM ranked
        WHERE rn > 1
      )
      UPDATE access_credentials ac
      SET
        status = 'FAILED',
        updated_at = NOW(),
        metadata = COALESCE(ac.metadata, '{}'::jsonb) || jsonb_build_object(
          'failure_reason', 'AUTO_DEDUPLICATED_DURING_MIGRATION',
          'migration_tag', '20260507090000-add-unique-active-pending-credential-per-visit'
        )
      FROM duplicates d
      WHERE ac.id = d.id;
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS access_credentials_visit_active_pending_unique_idx
      ON access_credentials (visit_id)
      WHERE status IN ('PENDING', 'ACTIVE');
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS access_credentials_visit_active_pending_unique_idx;
    `);
  },
};

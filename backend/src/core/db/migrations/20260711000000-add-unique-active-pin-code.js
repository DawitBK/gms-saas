'use strict';

/**
 * PIN codes had no uniqueness enforcement anywhere: the fallback generator
 * (used whenever UniFi is unreachable — including in production, per its own
 * test suite) is a plain random 6-digit integer with no collision check, and
 * the UniFi webhook handler that resolves a scanned PIN back to a
 * credential/visit assumes uniqueness and takes the first match. A collision
 * would attribute a real door-access event to the wrong guest's visit.
 *
 * Before adding the index, collapse any pre-existing collisions by keeping
 * the newest row per PIN in (PENDING, ACTIVE) and marking older rows FAILED
 * — same pattern as 20260507090000's credential-per-visit uniqueness fix.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY (metadata->>'pin_code')
            ORDER BY
              CASE WHEN status = 'ACTIVE' THEN 0 ELSE 1 END,
              COALESCE(provisioned_at, updated_at, created_at) DESC,
              id DESC
          ) AS rn
        FROM access_credentials
        WHERE status IN ('PENDING', 'ACTIVE') AND metadata->>'pin_code' IS NOT NULL
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
          'failure_reason', 'AUTO_DEDUPLICATED_PIN_COLLISION_DURING_MIGRATION',
          'migration_tag', '20260711000000-add-unique-active-pin-code'
        )
      FROM duplicates d
      WHERE ac.id = d.id;
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS access_credentials_active_pin_code_unique_idx
      ON access_credentials ((metadata->>'pin_code'))
      WHERE status IN ('PENDING', 'ACTIVE') AND metadata->>'pin_code' IS NOT NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS access_credentials_active_pin_code_unique_idx;
    `);
  },
};

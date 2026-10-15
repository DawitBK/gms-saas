'use strict';

/**
 * Stop a single hard delete from erasing the entire visit and audit trail.
 *
 * WHAT IT LOOKS LIKE TODAY
 *
 * `visits.guest_id`, `service_id`, `department_id` and `office_id` are all
 * `ON DELETE CASCADE` (010-create-visits.js), and every table hanging off
 * `visits` — approvals, pins, messages, access_credentials, visit_assignments —
 * cascades from `visits` in turn. So one `DELETE FROM users WHERE id = ...`
 * silently removes that person's visits, and under them their approval
 * decisions, door PINs, messages, issued access credentials, and host
 * assignments. The same is true of deleting an Office, Department or Service.
 *
 * `Visit`, `Service`, `User` and `Department` are `paranoid: true` in the
 * Sequelize models, which is why nobody has hit this: the application only ever
 * soft-deletes. But `paranoid` is an application convention — it has no bearing
 * on the FK constraint underneath. The safety net is one `psql` session, one
 * GDPR erasure script, or one future "purge" admin feature away from doing
 * nothing at all, and the loss is silent: no audit entry, no application
 * awareness, no recovery short of a database restore.
 *
 * WHAT THIS CHANGES
 *
 * RESTRICT on all four. Deleting a user, office, department or service that has
 * visits now fails loudly with a foreign-key violation instead of quietly
 * taking the history with it. Soft deletes — everything the application
 * actually does — are unaffected, because they only set `deleted_at`.
 *
 * SAFE ON THE LIVE DATABASE. This alters constraint definitions only. No row is
 * read, written or moved, and nothing about existing data changes. Postgres
 * takes a brief ACCESS EXCLUSIVE lock on `visits` while swapping each
 * constraint; on a table this size that is milliseconds, and it does not
 * rewrite the table.
 *
 * If a genuine erasure is ever required, it becomes an explicit, ordered,
 * audited operation that deletes the dependent rows deliberately — which is
 * what deleting somebody's compliance record should have been all along.
 */

/**
 * Constraint names are not guaranteed: they may be Postgres's default
 * (`visits_guest_id_fkey`) or a name Sequelize generated at creation time. Look
 * up the real one from the catalog rather than assuming, and skip quietly if a
 * column has no FK at all (a database provisioned by `sequelize.sync` rather
 * than by these migrations).
 */
async function swapDeleteRule(queryInterface, column, referencedTable, rule) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT con.conname AS name
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
       JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
      WHERE rel.relname = 'visits'
        AND con.contype = 'f'
        AND att.attname = '${column}'
        AND array_length(con.conkey, 1) = 1`,
  );

  if (!rows.length) {
    console.log(`[migration] visits.${column} has no foreign key — nothing to change.`);
    return;
  }

  for (const row of rows) {
    await queryInterface.sequelize.query(
      `ALTER TABLE "visits" DROP CONSTRAINT "${row.name}"`,
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE "visits"
         ADD CONSTRAINT "${row.name}"
         FOREIGN KEY ("${column}") REFERENCES "${referencedTable}" ("id")
         ON UPDATE CASCADE ON DELETE ${rule}`,
    );
    console.log(`[migration] visits.${column} → ON DELETE ${rule}`);
  }
}

const COLUMNS = [
  ['guest_id', 'users'],
  ['service_id', 'services'],
  ['department_id', 'departments'],
  ['office_id', 'offices'],
];

module.exports = {
  async up(queryInterface) {
    for (const [column, table] of COLUMNS) {
      await swapDeleteRule(queryInterface, column, table, 'RESTRICT');
    }
  },

  async down(queryInterface) {
    // Restores the original CASCADE. Reversible, but note that going back
    // reinstates the data-loss path described above.
    for (const [column, table] of COLUMNS) {
      await swapDeleteRule(queryInterface, column, table, 'CASCADE');
    }
  },
};

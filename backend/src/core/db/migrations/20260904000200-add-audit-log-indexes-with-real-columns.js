'use strict';

/**
 * The two audit-log indexes that 054 intended to create and never did.
 *
 * `054-add-performance-indexes.js` asks for:
 *
 *     ["audit_logs", ["entity_type", "entity_id", "created_at"], "idx_audit_logs_entity"]
 *     ["audit_logs", ["actor_id", "created_at"],                 "idx_audit_logs_actor"]
 *
 * `audit_logs` has no `entity_type` and no `actor_id`. The real columns are
 * `entity` and `user_id`. 054 guards each index with a `describeTable` check
 * and `continue`s past any whose columns are missing — a sensible guard that,
 * here, turned a typo into a silent no-op. Neither index has ever existed in
 * any environment, and nothing reported it: the migration is recorded as
 * applied and reports success.
 *
 * It is not academic. `VisitRepository.findById` runs
 *
 *     SELECT ... FROM audit_logs WHERE entity = 'Visit' AND entity_id = $1
 *
 * on every single visit-detail load, and the audit log is append-only and
 * grows forever. Without the index that is a sequential scan over the whole
 * table, on the hottest read path in the product, getting slower every day the
 * system is used. GMS has been live long enough for that to matter.
 *
 * `entity_id` is deliberately included in the composite: the query above filters
 * on both columns, and the comment at that call site explains why it is a string
 * comparison rather than a join (`audit_logs.entity_id` is text while
 * `visits.id` is BIGINT).
 *
 * Written as a new migration rather than a fix to 054, because 054 is already
 * recorded as applied everywhere and editing it would change nothing on any
 * existing database.
 */

const indexes = [
  {
    name: 'idx_audit_logs_entity',
    fields: ['entity', 'entity_id', 'created_at'],
  },
  {
    name: 'idx_audit_logs_actor',
    fields: ['user_id', 'created_at'],
  },
];

module.exports = {
  async up(queryInterface) {
    const columns = await queryInterface.describeTable('audit_logs');

    for (const { name, fields } of indexes) {
      const missing = fields.find((f) => !columns[f]);
      if (missing) {
        // Loud this time. A silent skip is what hid the original problem.
        console.warn(
          `[migration] audit_logs.${missing} does not exist — skipping ${name}. ` +
            'This is the same failure mode as migration 054; check the column names.',
        );
        continue;
      }

      try {
        await queryInterface.addIndex('audit_logs', fields, { name });
        console.log(`[migration] created ${name} on audit_logs(${fields.join(', ')})`);
      } catch (error) {
        // Already present (a hand-created index, or a re-run) is fine.
        if (/already exists/i.test(error.message)) {
          console.log(`[migration] ${name} already exists — leaving it`);
          continue;
        }
        throw error;
      }
    }
  },

  async down(queryInterface) {
    for (const { name } of indexes) {
      try {
        await queryInterface.removeIndex('audit_logs', name);
      } catch {
        // Never created; nothing to remove.
      }
    }
  },
};

/**
 * One-off cleanup: remove one-time codes (2FA / registration / password reset)
 * that earlier builds left in clear text in `outbox_events.payload`.
 *
 * Background: auth.service.ts used to queue the e-mail job as
 * `{ guestId, otp: "123456", template }`, and the outbox kept that row forever,
 * so every code ever issued sat in the table (the users table only ever held a
 * keyed hash). New builds queue the code sealed and the outbox redacts it as
 * soon as the row is PROCESSED or DEAD_LETTER (see outbox.repository.ts); this
 * script removes what the old build already stored.
 *
 * What it touches: rows whose payload still has an `otp` or `otp_sealed` key AND
 * that are either finished (PROCESSED / DEAD_LETTER) or older than
 * STALE_AFTER_MINUTES (a code lives at most 30 minutes, so an older code can
 * never be used again and the e-mail it was meant for is moot). Recent
 * PENDING / FAILED / PROCESSING rows are left alone so a code that is still
 * waiting to be sent is not lost; the outbox redacts those itself when they are
 * dispatched. Only the keys are removed: the rest of the payload, the status and
 * every other column stay as they were, and an `otp_redacted: true` marker is
 * added.
 *
 * Safe to re-run: a redacted row no longer matches. DRY RUN BY DEFAULT: it
 * reports counts (never the codes) and changes nothing unless --apply is given.
 *
 * Usage (from GMS/backend):
 *   dev:   node scripts/run-with-env.js development scripts/redact-outbox-otps.ts            (dry run)
 *          node scripts/run-with-env.js development scripts/redact-outbox-otps.ts --apply
 *   live:  node scripts/run-with-env.js production  scripts/redact-outbox-otps.ts            (dry run first)
 *          node scripts/run-with-env.js production  scripts/redact-outbox-otps.ts --apply
 * or the npm aliases: `npm run outbox:redact-otps[:prod] -- [--apply]`.
 * Take a database backup before the first --apply on gmsprod.
 */

import { QueryTypes } from 'sequelize';
import { sequelize } from '../src/infrastructure/database/sequelize';
import { REDACT_OTP_PAYLOAD_SQL } from '../src/infrastructure/events/outbox.repository';

const STALE_AFTER_MINUTES = 60;
const TARGET = `
  jsonb_exists_any(payload, ARRAY['otp','otp_sealed'])
  AND (status IN ('PROCESSED','DEAD_LETTER') OR created_at < now() - make_interval(mins => :staleMinutes))
`;

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  await sequelize.authenticate();
  const dbName = (sequelize.config as { database?: string }).database;
  console.log(`Database: ${dbName}  (NODE_ENV=${process.env.NODE_ENV})`);
  console.log(apply ? 'Mode: APPLY (rows will be changed)' : 'Mode: DRY RUN (nothing is changed; pass --apply to redact)');

  const replacements = { staleMinutes: STALE_AFTER_MINUTES };
  const rows = await sequelize.query<{ status: string; n: string }>(
    `SELECT status::text AS status, count(*)::text AS n FROM outbox_events WHERE ${TARGET} GROUP BY status ORDER BY status`,
    { replacements, type: QueryTypes.SELECT },
  );
  const total = rows.reduce((sum, r) => sum + Number(r.n), 0);
  const left = await sequelize.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM outbox_events WHERE jsonb_exists_any(payload, ARRAY['otp','otp_sealed']) AND NOT (${TARGET})`,
    { replacements, type: QueryTypes.SELECT },
  );

  console.log(`Rows holding a one-time code that qualify for redaction: ${total}`);
  for (const r of rows) console.log(`  ${r.status}: ${r.n}`);
  console.log(`Rows holding a code that are skipped (recent and still waiting to be sent): ${left[0]?.n ?? '0'}`);

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to redact these rows.');
  } else if (total > 0) {
    const [, meta] = (await sequelize.query(
      `UPDATE outbox_events SET payload = ${REDACT_OTP_PAYLOAD_SQL}, updated_at = now() WHERE ${TARGET}`,
      { replacements },
    )) as unknown as [unknown, { rowCount?: number }];
    console.log(`\nRedacted ${meta?.rowCount ?? total} row(s).`);
  } else {
    console.log('\nNothing to redact.');
  }

  await sequelize.close();
}

main().catch((err) => {
  console.error('Redaction failed:', err);
  process.exit(1);
});

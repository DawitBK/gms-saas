const { Client } = require('pg');
const envPath = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
// override:true so this file's own DB_* values always win over a stray
// machine-wide env var (e.g. a leftover Railway/Render DATABASE_URL).
// GMS's main app never reads
// DATABASE_URL at all (its connection is built from the DB_* keys in
// src/core/db/config/config.js and src/config/env.schema.ts); this script must not
// either, since a stray DATABASE_URL pointing at some other Postgres
// instance would otherwise make this destructive wipe silently DROP TABLEs
// on the wrong database.
require('dotenv').config({ path: envPath, override: true });

/**
 * Refuse to destroy a production database on a plain command.
 *
 * `package.json` exposes this through `db:wipe:prod`, and two other scripts
 * chain it: `db:fresh:prod` and `db:passwords-only:prod`. Each of those reads
 * like a setup command, and each begins by DROP TABLE-ing every table in
 * `gmsprod` — the database that has been serving real visitors on the internal
 * server. There was no prompt, no flag, and no backup step: one tab-completed
 * npm script, run against the wrong environment or by someone who read
 * "fresh" as "fresh install", ends the visit history, the approval trail and
 * every access credential with no undo.
 *
 * The confirmation is deliberately not a y/n prompt. It must be impossible to
 * satisfy by reflex, and impossible to satisfy at all from a script that is
 * running unattended — which is exactly how the chained `db:fresh:prod` /
 * `db:passwords-only:prod` would reach it.
 */
function assertWipeIsIntentional(databaseName) {
  if (process.env.NODE_ENV !== 'production') return;

  const confirmation = process.env.I_UNDERSTAND_THIS_DESTROYS === databaseName;
  if (confirmation) {
    console.warn(
      `[wipe] Production wipe of "${databaseName}" explicitly confirmed. ` +
        'Every table is about to be dropped.',
    );
    return;
  }

  console.error(
    '\n[wipe] REFUSING TO WIPE A PRODUCTION DATABASE.\n\n' +
      `  Target: ${databaseName} (NODE_ENV=production)\n\n` +
      '  This drops every table. On the live server that is the entire visit,\n' +
      '  approval, credential and audit history — there is no undo and no\n' +
      '  application-level soft delete behind it.\n\n' +
      '  Deploying an updated GMS does NOT require this. A normal deploy is\n' +
      '  `npm install`, `npm run build`, `npm run migrate:prod` — migrations\n' +
      '  alter the existing schema in place and keep the data.\n\n' +
      '  If you genuinely mean to erase it, take a backup first\n' +
      '  (`npm run db:backup:prod`), verify the dump file exists, then re-run\n' +
      '  with the database named explicitly:\n\n' +
      `      set I_UNDERSTAND_THIS_DESTROYS=${databaseName}   (cmd)\n` +
      `      $env:I_UNDERSTAND_THIS_DESTROYS="${databaseName}" (PowerShell)\n`,
  );
  process.exit(1);
}

async function wipeDatabase() {
  const config = {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
  };

  if (!config.host) {
    console.error('Database connection parameters are not defined in ' + envPath);
    process.exit(1);
  }

  assertWipeIsIntentional(config.database);

  console.log('--- GMS DATABASE WIPE ---');
  console.log('Target:', config.host || 'Local');

  async function runSingleQuery(query, retries = 5) {
    for (let i = 0; i < retries; i++) {
      const client = new Client({
        ...config,
        statement_timeout: 60000,
        connectionTimeoutMillis: 10000,
      });

      try {
        await client.connect();
        const res = await client.query(query);
        await client.end();
        return res;
      } catch (err) {
        try { await client.end(); } catch { }
        if (i === retries - 1) throw err;
        console.log(`[wipe] Connection failed (${err.message}), retrying ${i + 1}/${retries}...`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  try {
    console.log('[wipe] Initializing hyper-resilient wipe...');
    const res = await runSingleQuery(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      AND table_name NOT LIKE 'pg_%';
    `);

    const tables = res.rows.map(row => `"${row.table_name}"`);

    if (tables.length > 0) {
      console.log(`[wipe] Found ${tables.length} tables. Cleaning sequentially...`);

      for (const table of tables) {
        process.stdout.write(`[wipe] Dropping ${table}... `);
        try {
          await runSingleQuery(`DROP TABLE ${table} CASCADE;`);
          console.log('OK');
        } catch (err) {
          console.log('FAILED (Ignored)');
        }
      }

      console.log('[wipe] Resetting sequences...');
      await runSingleQuery(`
        DO $$ 
        DECLARE 
          r RECORD;
        BEGIN
          FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public') 
          LOOP
            EXECUTE 'ALTER SEQUENCE ' || r.sequence_name || ' RESTART WITH 1';
          END LOOP;
        END $$;
      `);

      console.log('[wipe] Database reset complete.');
    } else {
      console.log('[wipe] Database is already empty.');
    }
  } catch (err) {
    console.error('[wipe] Fatal Error after retries:', err.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

wipeDatabase();

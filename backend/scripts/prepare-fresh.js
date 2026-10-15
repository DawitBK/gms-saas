#!/usr/bin/env node
'use strict';

/**
 * GMS Enterprise – Prepare Fresh Environment
 * ============================================
 * Drops the public schema, recreates it, and runs all migrations.
 * Leaves the database in a clean, schema-only state — no data.
 *
 * After running this script, follow the documented reseed flow:
 *   1. npm run seed:passwords        (provisions roles + admin accounts + legacy password hashes)
 *   2. Download the Excel template from the Admin Dashboard
 *   3. Populate and import the Excel file via the UI
 *
 * Usage:
 *   node scripts/prepare-fresh.js
 *   node scripts/prepare-fresh.js --skip-migrate   # Only wipes, skips migrations
 *   node scripts/prepare-fresh.js --dry-run        # Logs what it would do but makes no changes
 *
 * SAFETY GUARD:
 *   Requires ALLOW_HARD_DB_RESET=true in your .env / environment.
 */

const path = require('path');
const { spawnSync } = require('child_process');
const dotenv = require('dotenv');
const { Client } = require('pg');

const backendRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(backendRoot, '.env') });
dotenv.config({ path: path.join(backendRoot, '.env.development'), override: true });

const isYes = (value) => ['1', 'true', 'yes', 'y'].includes(String(value || '').toLowerCase());

const args = new Set(process.argv.slice(2));
const skipMigrate = args.has('--skip-migrate');
const dryRun = args.has('--dry-run');

const banner = () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║          GMS Enterprise — Prepare Fresh Environment      ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
};

const runStep = (label, command, commandArgs) => {
  console.log(`\n[prepare-fresh] ${label}...`);
  const result = spawnSync(command, commandArgs, {
    cwd: backendRoot,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' },
  });
  if (result.status !== 0) {
    throw new Error(`Step "${label}" failed with exit code ${result.status ?? 'unknown'}`);
  }
  console.log(`[prepare-fresh] ✔ ${label} complete.`);
};

const resetSchema = async () => {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  await client.connect();
  try {
    console.log(`[prepare-fresh] Target: ${process.env.DB_NAME} @ ${process.env.DB_HOST}:${process.env.DB_PORT || 5432}`);

    if (dryRun) {
      console.log('[prepare-fresh] DRY RUN — no schema changes made.');
      return;
    }

    console.log('[prepare-fresh] Dropping public schema...');
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    console.log('[prepare-fresh] Recreating public schema...');
    await client.query('CREATE SCHEMA public');
    await client.query('GRANT ALL ON SCHEMA public TO PUBLIC');
    await client.query('GRANT ALL ON SCHEMA public TO postgres');
    console.log('[prepare-fresh] ✔ Schema reset complete. Database is empty.');
  } finally {
    await client.end();
  }
};

const printNextSteps = () => {
  console.log('');
  console.log('══════════════════════════════════════════════════════════');
  console.log('  ✅  Database is clean. Follow these steps to reseed:');
  console.log('');
  console.log('  1.  npm run seed:passwords');
  console.log('      → Provisions all roles, master & admin accounts,');
  console.log('        and migrates legacy password hashes.');
  console.log('');
  console.log('  2.  Login to Admin Dashboard:');
  console.log('      → admin@gms.local / GMSAdmin@2026');
  console.log('');
  console.log('  3.  Admin → Users → Download Org Template');
  console.log('      → Populate: Offices, Departments, Services, Hosts');
  console.log('');
  console.log('  4.  Import the filled Excel file via the UI.');
  console.log('      → System will provision offices, departments,');
  console.log('        services, and all staff accounts.');
  console.log('');
  console.log('  System will be fully operational with correct RBAC.');
  console.log('══════════════════════════════════════════════════════════');
  console.log('');
};

const main = async () => {
  banner();

  if (!process.env.DB_NAME || !process.env.DB_USER) {
    throw new Error(
      'DB_NAME / DB_USER is not set. Ensure backend/.env is configured correctly.'
    );
  }

  if (!isYes(process.env.ALLOW_HARD_DB_RESET)) {
    console.error('');
    console.error('  ⛔ Hard reset is BLOCKED by safety guard.');
    console.error('     Set ALLOW_HARD_DB_RESET=true in your .env to proceed.');
    console.error('');
    process.exit(1);
  }

  if (dryRun) {
    console.log('[prepare-fresh] Dry run mode active — no destructive changes will be made.\n');
  }

  await resetSchema();

  if (!skipMigrate && !dryRun) {
    runStep(
      'Running all migrations',
      process.execPath,
      ['scripts/run-sequelize-cli.js', 'development', 'db:migrate']
    );
  } else if (skipMigrate) {
    console.log('[prepare-fresh] Skipping migrations (--skip-migrate flag set).');
  }

  console.log('\n[prepare-fresh] ✅ Preparation complete.');
  printNextSteps();
};

main().catch((error) => {
  console.error('\n[prepare-fresh] ❌ Fatal Error:', error.message || error);
  process.exit(1);
});

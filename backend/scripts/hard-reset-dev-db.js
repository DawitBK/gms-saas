#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const dotenv = require('dotenv');
const { Client } = require('pg');

const backendRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(backendRoot, '.env') });
dotenv.config({ path: path.join(backendRoot, '.env.development'), override: true });

const isYes = (value) => ['1', 'true', 'yes', 'y'].includes(String(value || '').toLowerCase());

const args = new Set(process.argv.slice(2));
const withSeed = !args.has('--no-seed');
const skipMigrate = args.has('--skip-migrate');
const dryRun = args.has('--dry-run');

const runStep = (label, command, commandArgs) => {
  console.log(`\n[hard-reset] ${label}`);
  const result = spawnSync(command, commandArgs, {
    cwd: backendRoot,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' },
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`);
  }
};

const resetSchema = async () => {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  await client.connect();
  try {
    console.log(`[hard-reset] Target DB: ${process.env.DB_NAME} on ${process.env.DB_HOST}:${process.env.DB_PORT}`);
    console.log('[hard-reset] Reset mode: DROP+RECREATE public schema');

    if (dryRun) {
      console.log('[hard-reset] Dry run only. No changes made.');
      return;
    }

    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
    await client.query('GRANT ALL ON SCHEMA public TO PUBLIC');
    console.log('[hard-reset] Schema reset completed.');
  } finally {
    await client.end();
  }
};

const main = async () => {
  if (!process.env.DB_NAME) {
    throw new Error('DB_NAME is not set. Ensure backend/.env and backend/.env.development are configured.');
  }

  if (!isYes(process.env.ALLOW_HARD_DB_RESET)) {
    throw new Error(
      'Hard reset is blocked. Set ALLOW_HARD_DB_RESET=true in your environment for this command.'
    );
  }

  await resetSchema();

  if (!skipMigrate) {
    runStep('Running migrations', process.execPath, ['scripts/run-sequelize-cli.js', 'development', 'db:migrate']);
  }

  if (withSeed) {
    runStep('Running seeders', process.execPath, ['scripts/run-sequelize-cli.js', 'development', 'db:seed:all']);
  }

  console.log('\n[hard-reset] Done.');
};

main().catch((error) => {
  console.error('[hard-reset] Failed:', error.message || error);
  process.exit(1);
});

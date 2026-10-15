const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const rootDir = path.resolve(__dirname, '..', '..', '..', '..');
const nodeEnv = process.env.NODE_ENV || 'development';

// ---------------------------------------------------------------------------
// ENV FILE LOADING CONTRACT — the same one src/config/index.ts enforces:
//
//   NODE_ENV=production   ->  .env.production ONLY. `.env` is NEVER read.
//   anything else         ->  .env, then .env.<NODE_ENV> layered on top.
//
// This file governs sequelize-cli, which is what `migrate:prod` and every
// `db:seed` script run against — i.e. it decides which database MIGRATIONS are
// applied to. It used to load `.env` first and then layer `.env.production` on
// top, which is the one place on this platform where that pattern is least
// acceptable: `gmsprod` is the only database with real production data, and
// dotenv only overrides the keys the second file actually NAMES. Any DB_* key
// `.env.production` happened to omit would have kept its DEVELOPMENT value, and
// `npm run migrate:prod` would have migrated `gmsdev` while reporting success.
//
// Today `.env.production` does define all five DB_* keys, so this changes no
// resolved value — it makes the guarantee designed rather than accidental.
// ---------------------------------------------------------------------------
const envFiles =
  nodeEnv === 'production' ? ['.env.production'] : ['.env', `.env.${nodeEnv}`];

for (const envFile of envFiles) {
  const envPath = path.join(rootDir, envFile);
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true, quiet: true });
  } else if (nodeEnv === 'production') {
    // dotenv is a silent no-op on a missing file, and the defaults below would
    // then point at a database called `gms` with an empty password — sequelize-cli
    // would fail to connect rather than do damage, but it would fail with a
    // connection error that says nothing about the real cause.
    console.error(
      `CRITICAL: NODE_ENV=production but ${envPath} does not exist.\n` +
        'Production configuration is read from .env.production ONLY — `.env` is the development ' +
        'file and is deliberately not read in production.\n' +
        'Refusing to run sequelize-cli against an unconfigured database.',
    );
    process.exit(1);
  }
}

const sslEnabled = (process.env.DB_SSL_ENABLED || 'false') === 'true';
const sslRejectUnauthorized = (process.env.DB_SSL_REJECT_UNAUTHORIZED || 'true') === 'true';

const common = {
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'gms',
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5432),
  dialect: 'postgres',
  logging: false,
  ...(sslEnabled
    ? {
        dialectOptions: {
          ssl: {
            require: true,
            rejectUnauthorized: sslRejectUnauthorized,
          },
        },
      }
    : {}),
};

module.exports = {
  development: common,
  test: common,
  production: common,
};

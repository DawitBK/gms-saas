const path = require('path');
const { applyMirrorEnv } = require('./mirror-env');

const entry = process.argv[2];

if (!entry) {
  console.error('Usage: node scripts/run-with-env-mirror.js <entry-file>');
  process.exit(1);
}

// Always 'development' — GMS's env.schema.ts enum only accepts
// development/production/test (see mirror-env.js for why 'mirror' can't be
// a real NODE_ENV value here), and 'development' is also the functionally
// correct choice for a plain-HTTP local mirror: GMS's own cookie code
// (auth.controller.ts, csrf.middleware.ts) sets `secure: appConfig.isProduction`,
// which would make login cookies unusable over http://localhost if this ran
// as NODE_ENV=production without real TLS in front of it.
applyMirrorEnv();
process.env.NODE_ENV = 'development';

if (entry.endsWith('.ts')) {
  require('ts-node/register/transpile-only');
  require('tsconfig-paths/register');
}

require(path.resolve(process.cwd(), entry));

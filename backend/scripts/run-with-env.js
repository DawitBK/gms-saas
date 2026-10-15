const path = require('path');
// Self-heal a mirror-env swap left stranded by a force-killed mirror process
// (mirror-env.js's header comment has the full incident) before this process
// reads .env/.env.development at all — every non-mirror entry point (dev,
// production, test, the outbox worker) goes through this file, so this is
// the one place that guarantees it runs regardless of which npm script
// started things.
require('./mirror-env.js').healStrandedSwap();

const mode = process.argv[2];
const entry = process.argv[3];

if (!mode || !entry) {
  console.error('Usage: node scripts/run-with-env.js <development|production|test> <entry-file>');
  process.exit(1);
}

process.env.NODE_ENV = mode;

if (entry.endsWith('.ts')) {
  require('ts-node/register/transpile-only');
  require('tsconfig-paths/register');
}

require(path.resolve(process.cwd(), entry));

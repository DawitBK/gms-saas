// Shared loader for the two mirror-mode scripts (build-mirror.cjs,
// start-mirror.cjs). GMS's own scripts/run-next-with-env.js is a protected
// reference-implementation script (see GMS/CLAUDE.md — env loading is not to
// be changed) and it only ever loads `.env`/`.env.<mode>`/`.env.local`, with
// no concept of a `mirror` mode; it also has a latent bug where it appends
// `-p <port>` to `next build`, which the Next CLI rejects outright. Rather
// than touch that file, this parses .env.mirror by hand (same ~15-line
// approach as DMS/SSO's frontend mirror-env.cjs) and the two callers spawn
// `next` directly.
'use strict';
const fs = require('fs');
const path = require('path');

const appDir = path.resolve(__dirname, '..');
const mirrorEnvPath = path.join(appDir, '.env.mirror');

function loadMirrorEnv() {
  if (!fs.existsSync(mirrorEnvPath)) {
    console.error(
      `[mirror] ${mirrorEnvPath} does not exist.\n` +
        'This is the isolated local prod-mirror environment (see root CLAUDE.md) — ' +
        'it is never `.env`/`.env.development` or `.env.production`.',
    );
    process.exit(1);
  }
  for (const rawLine of fs.readFileSync(mirrorEnvPath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
  process.env.NODE_ENV = 'production';
  process.env.NEXT_DIST_DIR = '.next-mirror';
}

module.exports = { loadMirrorEnv, appDir };

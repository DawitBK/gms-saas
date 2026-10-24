// Mirror equivalent of `npm run start:standalone` (the actual command
// the production start script runs for GMS's frontend). Loads .env.mirror, preps
// the standalone bundle the same way run-next-with-env.js does (copies
// public/ and the configured distDir/static tree into the standalone server,
// since Next's standalone output does not include either by default), then
// runs the generated server.js directly. Usage: node scripts/start-mirror.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { loadMirrorEnv, appDir } = require('./mirror-env.cjs');
const { checkFingerprintOrExit } = require('./build-fingerprint.cjs');

loadMirrorEnv();

if (!process.env.PORT) {
  console.error('[mirror] PORT is not set in .env.mirror. Not defaulting silently — add it there.');
  process.exit(1);
}

const distDir = process.env.NEXT_DIST_DIR || '.next';
const standaloneDir = path.join(appDir, distDir, 'standalone');
const standaloneServer = path.join(standaloneDir, 'server.js');

if (!fs.existsSync(standaloneServer)) {
  console.error(`[mirror] missing ${distDir}/standalone/server.js. Run \`npm run build:mirror\` first.`);
  process.exit(1);
}

// Refuse to serve a build compiled against a different .env.mirror than the
// one active right now — see build-fingerprint.cjs for why a restart alone
// can't catch this.
checkFingerprintOrExit('.env.mirror');

const publicSourceDir = path.join(appDir, 'public');
const publicTargetDir = path.join(standaloneDir, 'public');
if (fs.existsSync(publicSourceDir)) {
  fs.cpSync(publicSourceDir, publicTargetDir, { recursive: true, force: true });
}

const staticSourceDir = path.join(appDir, distDir, 'static');
const staticTargetDir = path.join(standaloneDir, distDir, 'static'); // the server serves static from its own dist-dir name (.next-mirror on the mirror)
if (fs.existsSync(staticSourceDir)) {
  fs.cpSync(staticSourceDir, staticTargetDir, { recursive: true, force: true });
}

console.log(`[mirror] app url: ${process.env.NEXT_PUBLIC_APP_URL || '(not set)'}`);
console.log(`[mirror] api base url: ${process.env.NEXT_PUBLIC_API_BASE_URL || '(not set)'}`);

const child = spawn(process.execPath, [standaloneServer], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

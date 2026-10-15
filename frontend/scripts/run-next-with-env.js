const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { config } = require('dotenv');
const { writeFingerprint, checkFingerprintOrExit } = require('./build-fingerprint.cjs');

const mode = process.argv[2];
const nextCommand = process.argv[3];

if (!mode || !nextCommand) {
  console.error('Usage: node scripts/run-next-with-env.js <development|production|test> <dev|build|start|standalone>');
  process.exit(1);
}

process.env.NODE_ENV = mode;
const distDir = process.env.NEXT_DIST_DIR || '.next';

const envFiles =
  mode === 'production'
    ? [`.env.${mode}`]
    : ['.env', `.env.${mode}`, '.env.local'];
for (const envFile of envFiles) {
  const envPath = path.resolve(process.cwd(), envFile);
  if (fs.existsSync(envPath)) {
    config({ path: envPath, override: true, quiet: true });
  }
}

// The platform reserves 7201 for the GMS browser client. An explicit PORT in
// an environment file still wins so managed deployments can bind differently.
if (!process.env.PORT) {
  process.env.PORT = '7201';
}

if (mode === 'production') {
  const ignoredLocalEnv = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(ignoredLocalEnv)) {
    console.warn('[frontend] ignoring .env.local in production mode');
  }
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL || '(not set)';
const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || '(not set)';
const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || '(not set)';

console.log(`[frontend] mode: ${mode}`);
console.log(`[frontend] app url: ${appUrl}`);
console.log(`[frontend] api base url: ${apiUrl}`);
console.log(`[frontend] socket url: ${socketUrl}`);

const nextBin = path.resolve(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
const maskedEnvFiles = [];
let restoredMaskedEnvFiles = false;

const restoreMaskedEnvFiles = () => {
  if (restoredMaskedEnvFiles) {
    return;
  }

  restoredMaskedEnvFiles = true;

  for (const { envPath, maskedPath } of maskedEnvFiles) {
    if (fs.existsSync(maskedPath)) {
      fs.renameSync(maskedPath, envPath);
    }
  }
};

if (mode === 'production' && nextCommand === 'build') {
  for (const envFile of ['.env.production.local', '.env.local']) {
    const envPath = path.resolve(process.cwd(), envFile);
    if (!fs.existsSync(envPath)) {
      continue;
    }

    const maskedPath = `${envPath}.bak-production-build`;
    fs.renameSync(envPath, maskedPath);
    maskedEnvFiles.push({ envPath, maskedPath });
    console.warn(`[frontend] temporarily ignoring ${envFile} for production build`);
  }
}

process.on('exit', restoreMaskedEnvFiles);
process.on('SIGINT', () => {
  restoreMaskedEnvFiles();
  process.exit(130);
});
process.on('SIGTERM', () => {
  restoreMaskedEnvFiles();
  process.exit(143);
});

if (nextCommand === 'standalone') {
  const standaloneDir = path.resolve(process.cwd(), distDir, 'standalone');
  const standaloneServer = path.join(standaloneDir, 'server.js');

  if (!fs.existsSync(standaloneServer)) {
    console.error(`[frontend] missing ${distDir}/standalone/server.js. Run \`npm run build\` first.`);
    process.exit(1);
  }

  const publicSourceDir = path.resolve(process.cwd(), 'public');
  const publicTargetDir = path.join(standaloneDir, 'public');

  if (fs.existsSync(publicSourceDir)) {
    fs.cpSync(publicSourceDir, publicTargetDir, { recursive: true, force: true });
  }

  const staticSourceDir = path.resolve(process.cwd(), distDir, 'static');
  const staticTargetDir = path.join(standaloneDir, distDir, 'static'); // the server serves static from its own dist-dir name (.next-mirror on the mirror)

  if (fs.existsSync(staticSourceDir)) {
    fs.cpSync(staticSourceDir, staticTargetDir, { recursive: true, force: true });
  }
}

// Refuse to serve a build compiled against a different env file than the one
// active right now — Next bakes NEXT_PUBLIC_* into the client bundle at
// build time, so a restart alone can't pick up a changed .env.production
// (see build-fingerprint.cjs for the incident this guards against).
if (mode === 'production' && (nextCommand === 'start' || nextCommand === 'standalone')) {
  checkFingerprintOrExit('.env.production');
}

const child =
  nextCommand === 'standalone'
    ? spawn(process.execPath, [path.resolve(process.cwd(), distDir, 'standalone', 'server.js')], {
        stdio: 'inherit',
        env: process.env,
      })
    : spawn(process.execPath, [
        nextBin,
        ...(['dev', 'start'].includes(nextCommand) ? [nextCommand, '-p', process.env.PORT] : [nextCommand]),
      ], {
        stdio: 'inherit',
        env: process.env,
      });

child.on('exit', (code, signal) => {
  restoreMaskedEnvFiles();

  if (mode === 'production' && nextCommand === 'build' && (code ?? 1) === 0) {
    writeFingerprint('.env.production');
  }

  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

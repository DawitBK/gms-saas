const fs = require('fs');
const path = require('path');

const mode = process.argv[2] || 'production';
const rootDir = path.resolve(__dirname, '..');
const candidateFiles = ['.env.production.local', '.env.production', '.env.local', '.env'];

if (mode !== 'production') {
  console.error(`Unsupported mode: ${mode}`);
  process.exit(1);
}

const envPath = candidateFiles
  .map((file) => path.join(rootDir, file))
  .find((filePath) => fs.existsSync(filePath));

if (!envPath) {
  console.error('Missing frontend env file. Expected one of: .env.production.local, .env.production, .env.local, .env');
  process.exit(1);
}

const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
const entries = new Map();

for (const rawLine of lines) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) {
    continue;
  }

  const idx = line.indexOf('=');
  if (idx < 0) {
    continue;
  }

  const key = line.slice(0, idx).trim();
  const value = line.slice(idx + 1).trim();
  entries.set(key, value);
}

const requiredKeys = ['NEXT_PUBLIC_API_BASE_URL', 'NEXT_PUBLIC_SOCKET_URL', 'NEXT_PUBLIC_APP_URL'];

for (const key of requiredKeys) {
  if ((!entries.has(key) || entries.get(key) === '') && process.env[key]) {
    entries.set(key, process.env[key]);
  }
}
const knownPublicKeys = [
  'NEXT_PUBLIC_API_BASE_URL',
  'NEXT_PUBLIC_API_URL',
  'NEXT_PUBLIC_SOCKET_URL',
  'NEXT_PUBLIC_SOCKET_PATH',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_BASE_PATH',
  'NEXT_PUBLIC_ENABLE_LIVE_DEMO',
];
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);
const missing = [];

for (const key of requiredKeys) {
  if (!entries.has(key) || entries.get(key) === '') {
    missing.push(key);
  }
}

function ensureAbsoluteNonLoopbackUrl(key) {
  const value = entries.get(key);
  if (!value) {
    return;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    missing.push(`${key} must be a valid absolute URL`);
    return;
  }

  if (LOOPBACK_HOSTNAMES.has(parsed.hostname.toLowerCase())) {
    // If it's a loopback, we only warn instead of failing, 
    // to allow local production-mode testing.
    console.warn(`[frontend] ${key} points to localhost. This is fine for local testing but will NOT work on a real server.`);
  }
}

for (const key of requiredKeys) {
  ensureAbsoluteNonLoopbackUrl(key);
}

for (const key of knownPublicKeys) {
  if (!entries.has(key)) {
    console.warn(`[frontend] optional ${key} is not set in ${path.basename(envPath)}.`);
  }
}

if (missing.length > 0) {
  console.error(`Frontend environment check failed for ${path.basename(envPath)}. Missing/incomplete keys:`);
  for (const key of missing) {
    console.error(`- ${key}`);
  }
  process.exit(1);
}

console.log(`Frontend environment check passed using ${path.basename(envPath)}`);

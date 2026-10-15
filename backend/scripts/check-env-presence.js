const fs = require('fs');
const path = require('path');

const mode = process.argv[2] || 'production';
const rootDir = path.resolve(__dirname, '..');
const candidateFiles = ['.env.production.local', '.env.production', '.env.local', '.env'];

const requiredByMode = {
  production: [
    'NODE_ENV',
    'HOST',
    'PORT',
    'DB_HOST',
    'DB_PORT',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME',
    'REDIS_URL',
    'CLIENT_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
  ],
};

if (!requiredByMode[mode]) {
  console.error(`Unsupported mode: ${mode}`);
  process.exit(1);
}

const envPath = candidateFiles
  .map((file) => path.join(rootDir, file))
  .find((filePath) => fs.existsSync(filePath));

if (!envPath) {
  console.error('Missing backend env file. Expected one of: .env.production.local, .env.production, .env.local, .env');
  process.exit(1);
}

const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
const entries = new Map();

for (const rawLine of lines) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const idx = line.indexOf('=');
  if (idx < 0) continue;
  const key = line.slice(0, idx).trim();
  const value = line.slice(idx + 1).trim();
  entries.set(key, value);
}

const missing = [];
for (const key of requiredByMode[mode]) {
  if (!entries.has(key) || entries.get(key) === '') {
    missing.push(key);
  }
}

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

function isLoopbackUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return LOOPBACK_HOSTNAMES.has(hostname);
  } catch {
    return false;
  }
}

function hasValue(key) {
  return entries.has(key) && entries.get(key) !== '';
}

function requireKeys(keys, reason) {
  const absent = keys.filter((key) => !hasValue(key));
  if (absent.length > 0) {
    missing.push(`${reason}: ${absent.join(', ')}`);
  }
}

const unifiBaseUrl = entries.get('UNIFI_ACCESS_BASE_URL') || '';
const unifiApiKey = entries.get('UNIFI_ACCESS_API_KEY') || '';
const unifiWebhookSecret = entries.get('UNIFI_ACCESS_WEBHOOK_SECRET') || '';
const enableUniFiPolling = (entries.get('ENABLE_UNIFI_ACCESS_POLLING') || '').trim().toLowerCase() === 'true';
const clientUrl = entries.get('CLIENT_URL') || '';
const jwtSecret = entries.get('JWT_SECRET') || '';
const refreshSecret = entries.get('JWT_REFRESH_SECRET') || '';
const smsProvider = (entries.get('SMS_PROVIDER') || '').trim().toLowerCase();
const hasSendGrid = hasValue('SENDGRID_API_KEY') || hasValue('SENDGRID_FROM_EMAIL');
const hasSmtp = hasValue('SMTP_HOST') || hasValue('SMTP_USER') || hasValue('SMTP_PASS') || hasValue('FROM_EMAIL');

if ((unifiBaseUrl && !unifiApiKey) || (!unifiBaseUrl && unifiApiKey)) {
  missing.push('UNIFI_ACCESS_BASE_URL/UNIFI_ACCESS_API_KEY pair mismatch');
}

if (unifiBaseUrl && unifiApiKey && !enableUniFiPolling && !unifiWebhookSecret) {
  missing.push('UNIFI_ACCESS_WEBHOOK_SECRET required when UniFi webhook ingestion is enabled');
}

if (clientUrl && isLoopbackUrl(clientUrl)) {
  missing.push('CLIENT_URL must not point to localhost/127.0.0.1 in production');
}

if (jwtSecret.length < 32) {
  missing.push('JWT_SECRET must be at least 32 characters in production');
}

if (refreshSecret.length < 32) {
  missing.push('JWT_REFRESH_SECRET must be at least 32 characters in production');
}

if (hasSendGrid) {
  requireKeys(['SENDGRID_API_KEY', 'SENDGRID_FROM_EMAIL'], 'SendGrid configuration incomplete');
} else if (hasSmtp) {
  requireKeys(['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'FROM_EMAIL'], 'SMTP configuration incomplete');
} else {
  missing.push('Configure either SendGrid (SENDGRID_API_KEY + SENDGRID_FROM_EMAIL) or SMTP (SMTP_HOST + SMTP_USER + SMTP_PASS + FROM_EMAIL)');
}

if (smsProvider === 'africas_talking') {
  requireKeys(['AFRICAS_TALKING_USERNAME', 'AFRICAS_TALKING_API_KEY'], "Africa's Talking configuration incomplete");
}

if (missing.length > 0) {
  console.error(`Environment check failed for ${path.basename(envPath)}. Missing/incomplete keys:`);
  for (const key of missing) {
    console.error(`- ${key}`);
  }
  process.exit(1);
}

console.log(`Environment check passed for mode: ${mode} using ${path.basename(envPath)}`);

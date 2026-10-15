const fs = require('fs');
const path = require('path');

const target = path.resolve(__dirname, '..', '.env.production');
const template = path.resolve(__dirname, '..', '.env.docker-build');

const keys = [
  'NEXT_PUBLIC_API_BASE_URL',
  'NEXT_PUBLIC_SOCKET_URL',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_BASE_PATH',
];

let text = fs.existsSync(target)
  ? fs.readFileSync(target, 'utf8')
  : fs.existsSync(template)
    ? fs.readFileSync(template, 'utf8')
    : '';

const entries = new Map();
for (const line of text.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
  const idx = trimmed.indexOf('=');
  entries.set(trimmed.slice(0, idx), trimmed.slice(idx + 1));
}

for (const key of keys) {
  if (process.env[key]) {
    entries.set(key, process.env[key]);
  }
}

const output = [...entries.entries()].map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
fs.writeFileSync(target, output);
console.log(`[frontend] wrote ${path.basename(target)} for Docker build (${entries.size} keys)`);

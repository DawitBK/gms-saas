const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

const targetsByProject = {
  backend: [{ source: 'backend/.env.example', target: 'backend/.env' }],
  frontend: [{ source: 'frontend/.env.example', target: 'frontend/.env' }],
  all: [
    { source: 'backend/.env.example', target: 'backend/.env' },
    { source: 'frontend/.env.example', target: 'frontend/.env' },
  ],
};

const requestedProject = (process.argv[2] || 'all').toLowerCase();
const targets = targetsByProject[requestedProject];

if (!targets) {
  console.error(`Unsupported project: ${requestedProject}`);
  console.error('Usage: node tools/setup-env.js <backend|frontend|all>');
  process.exit(1);
}

for (const { source, target } of targets) {
  const sourcePath = path.resolve(repoRoot, source);
  const targetPath = path.resolve(repoRoot, target);

  if (!fs.existsSync(sourcePath)) {
    console.error(`Missing template file: ${source}`);
    process.exitCode = 1;
    continue;
  }

  if (!fs.existsSync(targetPath)) {
    fs.copyFileSync(sourcePath, targetPath);
    console.log(`Created ${target} from ${source}`);
    continue;
  }

  console.log(`Skipped ${target} creation (already exists)`);
}

#!/usr/bin/env node
/**
 * Unified test runner for GMS — mirrors CI (DevOps) and validates manual-deploy tooling.
 *
 * Profiles:
 *   ci      — same steps as .github/workflows/phase2-validation.yml (needs Postgres + Redis)
 *   manual  — typecheck, OpenAPI, frontend sanity, optional backend tests if DB reachable
 *   docker  — backend + frontend image build smoke (needs Docker daemon)
 *   all     — ci + docker (default)
 */

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'backend');
const frontend = path.join(root, 'frontend');
const profile = (process.argv[2] || 'all').toLowerCase();

const isWin = process.platform === 'win32';

function run(label, command, args, options = {}) {
  console.log(`\n=== ${label} ===\n`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    cwd: options.cwd || root,
    env: { ...process.env, ...options.env },
    shell: isWin,
  });

  if (result.status !== 0) {
    console.error(`\n[FAIL] ${label}`);
    process.exit(result.status ?? 1);
  }
}

const ciTestEnv = {
  NODE_ENV: 'test',
  // 7200 is GMS's backend port in dev AND production. This said 5001 — the
  // old FRONTEND port, on the backend.
  PORT: '7200',
  HOST: '127.0.0.1',
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: process.env.DB_PORT || '5432',
  DB_USER: process.env.DB_USER || 'postgres',
  DB_PASSWORD: process.env.DB_PASSWORD || 'change-me-dev-password',
  DB_NAME: process.env.DB_NAME || 'gms_test',
  JWT_SECRET: 'ci-test-secret-that-is-at-least-32-chars',
  JWT_REFRESH_SECRET: 'ci-refresh-secret-at-least-32-chars-long',
  JWT_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  FROM_EMAIL: 'no-reply@test.local',
  CLIENT_URL: 'http://localhost:7201',
  CORS_ALLOWED_ORIGINS: 'http://localhost:7201',
  RATE_LIMIT_GLOBAL_MAX: '100000',
  RATE_LIMIT_AUTH_MAX: '100000',
  RATE_LIMIT_CRITICAL_MAX: '100000',
  SENTRY_TRACES_SAMPLE_RATE: '0',
  METRICS_ENABLED: 'false',
  ENABLE_QUEUE_WORKERS: 'false',
  ENABLE_OUTBOX_POLLING: 'false',
  ENABLE_UNIFI_ACCESS_POLLING: 'false',
  REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379/1',
};

function runCi() {
  run('Backend npm ci', 'npm', ['ci'], { cwd: backend });
  run('Backend tsc', 'npx', ['tsc', '--noEmit'], { cwd: backend });
  run('Frontend npm ci', 'npm', ['ci'], { cwd: frontend });
  run('Frontend tsc', 'npx', ['tsc', '--noEmit'], { cwd: frontend });
  run('Backend build', 'npm', ['run', 'build'], { cwd: backend, env: ciTestEnv });
  run('DB migrate (test)', 'node', ['scripts/run-sequelize-cli.js', 'test', 'db:migrate'], {
    cwd: backend,
    env: ciTestEnv,
  });
  run('DB seed (test)', 'node', ['scripts/run-sequelize-cli.js', 'test', 'db:seed', '--seed', '000-core-seeder.js'], {
    cwd: backend,
    env: ciTestEnv,
  });
  run('Backend Jest', 'npm', ['test', '--', '--runInBand'], { cwd: backend, env: ciTestEnv });
  run('OpenAPI coverage', 'npm', ['run', 'test:openapi-coverage'], { cwd: backend });
  run('Frontend lint', 'npm', ['run', 'lint'], { cwd: frontend });
  run('Frontend build', 'npm', ['run', 'build'], { cwd: frontend });
}

function runManual() {
  run('Backend tsc', 'npx', ['tsc', '--noEmit'], { cwd: backend });
  run('Frontend tsc', 'npx', ['tsc', '--noEmit'], { cwd: frontend });
  run('OpenAPI coverage', 'npm', ['run', 'test:openapi-coverage'], { cwd: backend });
  run('Frontend lint', 'npm', ['run', 'lint'], { cwd: frontend });
  run('Frontend build', 'npm', ['run', 'build'], { cwd: frontend });

  if (process.env.GMS_SKIP_DB_TESTS === '1') {
    console.log('\n[skip] Backend integration tests (GMS_SKIP_DB_TESTS=1)\n');
    return;
  }

  console.log('\n[info] Manual profile: running backend tests using backend/.env.test (requires gms_test DB + Redis)\n');
  run('Backend Jest', 'npm', ['test', '--', '--runInBand'], {
    cwd: backend,
    env: { ...process.env, NODE_ENV: 'test' },
  });
}

function runDocker() {
  run('Docker build backend', 'docker', ['build', '-t', 'gms-backend:ci', './backend']);
  run('Docker build frontend', 'docker', [
    'build',
    '-t',
    'gms-frontend:ci',
    '--build-arg',
    'NEXT_PUBLIC_API_BASE_URL=http://localhost:7200/api/v1',
    '--build-arg',
    'NEXT_PUBLIC_SOCKET_URL=http://localhost:7200',
    '--build-arg',
    'NEXT_PUBLIC_APP_URL=http://localhost:7201',
    './frontend',
  ]);
}

console.log(`GMS test runner — profile: ${profile}`);

switch (profile) {
  case 'ci':
    runCi();
    break;
  case 'manual':
    runManual();
    break;
  case 'docker':
    runDocker();
    break;
  case 'all':
    runCi();
    runDocker();
    break;
  default:
    console.error(`Unknown profile: ${profile}. Use ci | manual | docker | all`);
    process.exit(1);
}

console.log(`\n[OK] Profile "${profile}" completed.\n`);

const path = require('path');
const { spawnSync } = require('child_process');
const { applyMirrorEnv } = require('./mirror-env');

const cliArgs = process.argv.slice(2);

if (cliArgs.length === 0) {
  console.error('Usage: node scripts/run-sequelize-cli-mirror.js <sequelize-cli args...>');
  process.exit(1);
}

const restore = applyMirrorEnv();

const sequelizeCliEntry = require.resolve('sequelize-cli/lib/sequelize');

const result = spawnSync(process.execPath, [sequelizeCliEntry, ...cliArgs], {
  stdio: 'inherit',
  cwd: path.resolve(__dirname, '..'),
  env: {
    ...process.env,
    NODE_ENV: 'development',
  },
});

restore();

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);

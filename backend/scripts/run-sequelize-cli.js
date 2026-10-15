const path = require('path');
const { spawnSync } = require('child_process');

const mode = process.argv[2];
const cliArgs = process.argv.slice(3);

if (!mode || cliArgs.length === 0) {
  console.error('Usage: node scripts/run-sequelize-cli.js <development|production|test> <sequelize-cli args...>');
  process.exit(1);
}

const sequelizeCliEntry = require.resolve('sequelize-cli/lib/sequelize');

const result = spawnSync(process.execPath, [sequelizeCliEntry, ...cliArgs], {
  stdio: 'inherit',
  cwd: path.resolve(__dirname, '..'),
  env: {
    ...process.env,
    NODE_ENV: mode,
  },
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);

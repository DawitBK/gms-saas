/**
 * Refuse to let a real environment file become git-tracked.
 *
 * `.env` and `.env.production` hold live credentials — the production database
 * password, both JWT secrets, the UniFi Access credentials, and the shared keys
 * SSO authenticates to this system with. Committing one publishes all of them,
 * and `git rm --cached` afterwards does not remove it from history.
 *
 * The allowlist below MUST stay in step with `.gitignore`, which deliberately
 * un-ignores three files: .env.test, .env.docker-build and .env.example (see the
 * negated patterns at the top of that file). Until 2026-09-06 this script did
 * not know about the first two, so it reported the repo's own intentional state
 * as a violation and always exited non-zero — which is why nothing ever ran it.
 * A guard that cannot pass is not a guard.
 */
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const blockedBasenames = new Set(['.env']);
// Suffixes that mark a file as a template rather than real configuration.
const allowedSuffixes = ['.example', '.sample', '.template'];
// Exact names that are tracked on purpose. `.env.test` holds only fixture
// values against `gms_test`; `.env.docker-build` holds only NEXT_PUBLIC_* build
// args, which are baked into a public browser bundle anyway.
const allowedBasenames = new Set(['.env.test', '.env.docker-build']);

function isBlockedEnvFile(name) {
  if (blockedBasenames.has(name)) {
    return true;
  }

  if (!name.startsWith('.env.')) {
    return false;
  }

  if (allowedBasenames.has(name)) {
    return false;
  }

  return !allowedSuffixes.some((suffix) => name.endsWith(suffix));
}

function getGitTrackedFiles() {
  try {
    const output = execFileSync('git', ['ls-files', '--cached', '--full-name'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    return null;
  }
}

function toPosixPath(filePath) {
  return filePath.replace(/\\/g, '/');
}

const trackedFiles = getGitTrackedFiles();

if (!trackedFiles) {
  console.log('Tracked environment file check skipped because this workspace is not a git checkout.');
  process.exit(0);
}

const flaggedFiles = trackedFiles
  .map((filePath) => toPosixPath(path.relative(repoRoot, path.resolve(repoRoot, filePath))))
  .filter((filePath) => isBlockedEnvFile(path.posix.basename(filePath)));

if (flaggedFiles.length > 0) {
  console.error('Git-tracked environment files are not allowed:');
  for (const file of flaggedFiles.sort()) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

console.log('Tracked environment file check passed.');

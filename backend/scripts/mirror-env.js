'use strict';
const fs = require('fs');
const path = require('path');

// GMS's own env loader (src/config/index.ts, src/core/db/config/config.js) is
// the platform's reference implementation and is deliberately NOT changed for
// this — see GMS/CLAUDE.md. It only recognizes NODE_ENV=production/test and
// treats everything else as 'development', loading `.env` then `.env.<mode>`
// LAYERED. That means the only way to hand it mirror-specific values in total
// ISOLATION (no silent fallback to a real dev secret this file doesn't
// mention — the exact footgun the root CLAUDE.md documents for prod) is to
// mask the real `.env`/`.env.development` out of the way and materialize
// `.env.mirror`'s content as a fresh `.env.development` for GMS's untouched
// loader to read under NODE_ENV=development, then restore everything
// afterward. `.env.mirror` stays the single hand-edited source of truth; the
// generated `.env.development` is a throwaway artifact of running the mirror.
//
// FIX (2026-09-22, live incident): process.on('exit'/'SIGINT'/'SIGTERM') can
// only run on a GRACEFUL shutdown. A forceful kill (Windows `taskkill /F`,
// POSIX SIGKILL — used repeatedly across sessions to restart the mirror
// backend after a rebuild, since the standalone server holds no other
// shutdown hook) skips all three unconditionally. That left `.env` masked as
// `.env.mirror-masked` and `.env.development` sitting as a byte-for-byte copy
// of `.env.mirror` — PORT=9200, DB_NAME=gmsprod, DB_USER=postgres — for over
// a month, undetected, because dev happened not to be started again in that
// window. GMS is the one system in this platform with real production data
// (root CLAUDE.md), so a dev boot silently pointed at gmsprod as a superuser
// is about as bad as this class of bug gets.
//
// A signal handler can't fix a SIGKILL — nothing downstream of the kill can
// run. The only robust fix is a durable, on-disk record of "a swap is
// currently in effect" that the NEXT invocation (mirror or plain dev) checks
// and self-heals from before doing anything else, so a stranded swap can
// live for at most one more process start instead of indefinitely.
const SWAP_STATE_PATH = path.join(process.cwd(), '.mirror-env-swap-state.json');

/** Replays a previous run's recorded restore if it never got to run.
 *  Safe to call unconditionally at the start of ANY script that touches
 *  these files — a no-op when nothing is stranded. */
function healStrandedSwap() {
  if (!fs.existsSync(SWAP_STATE_PATH)) return;
  let state;
  try {
    state = JSON.parse(fs.readFileSync(SWAP_STATE_PATH, 'utf8'));
  } catch {
    fs.rmSync(SWAP_STATE_PATH, { force: true });
    return;
  }
  console.warn(
    `[mirror-env] Found a stranded env swap from a previous run that never restored ` +
      `(most likely force-killed) — healing it now before continuing.`,
  );
  const { generatedDevPath, moved } = state;
  if (generatedDevPath && fs.existsSync(generatedDevPath)) {
    fs.rmSync(generatedDevPath, { force: true });
  }
  for (const [from, to] of moved ?? []) {
    if (fs.existsSync(from) && !fs.existsSync(to)) {
      fs.renameSync(from, to);
    }
  }
  fs.rmSync(SWAP_STATE_PATH, { force: true });
  console.warn('[mirror-env] Healed. Real .env/.env.development are back in place.');
}

function applyMirrorEnv() {
  healStrandedSwap();

  const cwd = process.cwd();
  const mirrorPath = path.join(cwd, '.env.mirror');

  if (!fs.existsSync(mirrorPath)) {
    console.error(
      `CRITICAL: .env.mirror not found at ${mirrorPath}.\n` +
        'The prod-mirror environment (see root CLAUDE.md) reads its config from ' +
        '.env.mirror ONLY. It is gitignored and has to be placed on this machine by hand.',
    );
    process.exit(1);
  }

  const realEnvPath = path.join(cwd, '.env');
  const realDevPath = path.join(cwd, '.env.development');
  const maskedEnvPath = `${realEnvPath}.mirror-masked`;
  const maskedDevPath = `${realDevPath}.mirror-masked`;

  const moved = [];
  if (fs.existsSync(realEnvPath)) {
    fs.renameSync(realEnvPath, maskedEnvPath);
    moved.push([maskedEnvPath, realEnvPath]);
  }
  if (fs.existsSync(realDevPath)) {
    fs.renameSync(realDevPath, maskedDevPath);
    moved.push([maskedDevPath, realDevPath]);
  }

  fs.copyFileSync(mirrorPath, realDevPath);
  fs.writeFileSync(SWAP_STATE_PATH, JSON.stringify({ generatedDevPath: realDevPath, moved }, null, 2));

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    if (fs.existsSync(realDevPath)) {
      fs.rmSync(realDevPath, { force: true });
    }
    for (const [from, to] of moved) {
      if (fs.existsSync(from)) fs.renameSync(from, to);
    }
    fs.rmSync(SWAP_STATE_PATH, { force: true });
  };

  process.on('exit', restore);
  process.on('SIGINT', () => {
    restore();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    restore();
    process.exit(143);
  });

  return restore;
}

module.exports = { applyMirrorEnv, healStrandedSwap };

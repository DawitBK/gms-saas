// PM2 process definitions for GMS production — referenced by the
// `pm2:*` npm scripts in backend/package.json. This file was missing from
// the checked-out repo even though those scripts already assumed it existed
// (backend/pm2/ecosystem.config was left as an empty placeholder).
//
// PATHS CORRECTED 2026-09-06. `cwd` and the log paths pointed at
// "B:\GMS RELEASE\backend", which production-start.bat's own header identifies
// as "a stale June checkout that is NOT what is running" — the live GMS backend
// was confirmed loading its native modules out of
// B:\Company_Systems\GMS\backend. PM2 would have started the wrong copy of
// the application, or failed to start at all. Update these if the server moves.
//
// Note: the real server currently launches GMS via plain `npm start` in a cmd
// window (production-start.bat), not PM2 — this file is here for whenever PM2
// process supervision is actually adopted, not a claim that it is running that
// way today.
//
// !!! DO NOT `pm2 start` THIS FILE AS-IS — DOUBLE/TRIPLE JOB PROCESSING !!!
// `dist/main.js` (the `gms-api` app below) ALREADY runs the full outbox-poll
// + BullMQ worker loop in-process whenever `ENABLE_QUEUE_WORKERS=true` and
// `ENABLE_OUTBOX_POLLING=true` — see `.env.example`'s own warning against
// running `npm start` and `npm run outbox:worker` together under those
// flags. `.env.production` (the file this config's `NODE_ENV: 'production'`
// env loads) sets BOTH flags to `true` today. That means, unmodified:
//   - `gms-api` alone runs 2 cluster instances (`instances: 2`,
//     `exec_mode: 'cluster'`) — each one independently polls the outbox and
//     runs the BullMQ workers, so the flags already cause 2x processing
//     before `gms-outbox` even starts.
//   - Also starting the separate `gms-outbox` app (dist/bin/outbox.worker.js)
//     adds a 3rd, fully redundant poller/worker on top of that.
// Every outbox event and BullMQ job would be picked up multiple times.
//
// Before ever running `pm2 start deploy/ecosystem.config.js` (or the
// `pm2:*` npm scripts) against the real `.env.production`, first set BOTH
//   ENABLE_QUEUE_WORKERS=false
//   ENABLE_OUTBOX_POLLING=false
// in the environment `gms-api` loads — then `gms-outbox` (and/or `gms-api`'s
// own cluster instances, if queue workers are ever re-enabled per-instance)
// becomes the sole in-process poller/worker instead of a 2nd/3rd copy of it.
module.exports = {
  apps: [
    {
      name: 'gms-api',
      script: 'scripts/run-with-env.js',
      args: 'production dist/main.js',
      cwd: 'B:\\Company_Systems\\GMS\\backend',
      instances: 2,
      exec_mode: 'cluster',
      max_memory_restart: '1G',
      env: { NODE_ENV: 'production' },
      error_file: 'B:\\Company_Systems\\GMS\\logs\\api-error.log',
      out_file: 'B:\\Company_Systems\\GMS\\logs\\api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
    {
      name: 'gms-outbox',
      script: 'scripts/run-with-env.js',
      args: 'production dist/bin/outbox.worker.js',
      cwd: 'B:\\Company_Systems\\GMS\\backend',
      instances: 1,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
      error_file: 'B:\\Company_Systems\\GMS\\logs\\outbox-error.log',
      out_file: 'B:\\Company_Systems\\GMS\\logs\\outbox-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};

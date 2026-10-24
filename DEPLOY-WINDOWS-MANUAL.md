# GMS — manual Windows deploy

**This page is the GMS deploy walkthrough for a plain Node process on Windows.** DMS and
SSO each have a same-named page in their own editions; all three sit behind one shared
Apache vhost, whose configuration is site-specific and not part of this repository.

> **`gmsprod` is the only database on this platform with real production data, and there
> is no staging copy of it.** Nothing below seeds, wipes or resets anything. If you find
> yourself reaching for `db:fresh:prod`, `db:wipe:prod` or `db:passwords-only:prod`, stop
> — all three drop every table, and none of them reads that way.

GMS deploys as plain Node processes. PM2 (`backend/deploy/ecosystem.config.js`) and
Docker Compose are supported alternates, neither required. GMS previously also deployed to
Render.com; `render.yaml` was removed on 2026-07-25 because it was never a completed
target and its `startCommand` ran `db:fresh:prod` — a full wipe and reseed — on every
deploy and restart. Render is not an option, not a demoted one.

> **What this page used to say, and why it was wrong.** Until 2026-09-06 §3 read "Create
> `backend\.env.production` (or `.env`, per your existing convention)". There is no such
> convention: production reads `.env.production` and **nothing else**, and a `.env` on the
> server is inert at best. The parenthetical invited exactly the mistake the contract
> exists to prevent.

## 1. Prerequisites

- Node.js 22.x
- PostgreSQL, with GMS's own `gmsprod` database
- Redis — GMS starts without it and falls back to in-memory rate limiting and caching,
  logging a warning. The BullMQ-backed notification, reminder, SLA and credential jobs
  need it to do real work, so treat it as required for a real deployment.

## 2. Get the code onto the server

```powershell
git clone https://github.com/DawitBK/gms-saas C:\apps\gms
cd C:\apps\gms
```

Or copy the folder. Later deploys are `git pull` (or re-copying) from the same location.

`origin` is `DawitBK/gms-saas`. The `examplecorp` remote is retained only so the URL is not
lost — do not push to it.

## 3. Configuration

Create `backend\.env.production` and `frontend\.env.production` from the matching
`.env.example` files. Both are gitignored because they hold real secrets, so neither is
part of a clone or a file copy — they have to be placed on the machine by hand.

**Production reads `.env.production` and nothing else.** `.env` is the development file
and is never read when `NODE_ENV=production`; a missing `.env.production` is a hard
refusal to start with a message naming the file. GMS is the reference implementation of
this rule for the platform — DMS and SSO were brought into line with it on 2026-09-05,
after DMS was measured booting on the dev database because it layered the two.

Backend keys that matter: `NODE_ENV=production`, `PORT=7200`, `CLIENT_URL`,
`CORS_ALLOWED_ORIGINS`, the `DB_*` block (`DB_NAME=gmsprod`), `REDIS_URL`, `JWT_SECRET`
and `JWT_REFRESH_SECRET`, SMTP or SendGrid, the UniFi Access credentials, and
`SSO_API_BASE` / `SSO_ROLES_API_KEY` / `SSO_INTERNAL_API_KEY` for the SSO integration.
`backend\.env.example` has the full surface.

For a single-process deploy (no separate worker — see §5) leave `ENABLE_QUEUE_WORKERS` and
`ENABLE_OUTBOX_POLLING` at `true`, which is GMS's own default.

Then check it before starting anything:

```powershell
cd C:\apps\gms\backend
npm run env:check:prod
```

The frontend's `NEXT_PUBLIC_*` values are baked into the browser bundle at **build** time,
so `frontend\.env.production` must be right *before* `npm run build`, and changing one
means rebuilding rather than restarting. `NEXT_PUBLIC_SSO_LOGIN_URL` drives the "Sign in
with Example Corp SSO" button.

## 4. Database

```powershell
cd C:\apps\gms\backend
npm run migrate:prod
```

Seeding is for a **first-time bring-up only**. An existing GMS installation already has
its accounts; running a seeder against it is not part of a normal deploy. If this really
is a first bring-up, `000-core-seeder.js` refuses to run in production unless
`GMS_SEED_ADMIN_PASSWORD` is set to something other than the password committed to this
repository — see `src/seeders/seed-password.js`.

## 5. Build and start

```powershell
# Backend
cd C:\apps\gms\backend
npm ci
npm run build
npm run start
```

```powershell
# Frontend, separate console window
cd C:\apps\gms\frontend
npm ci
npm run build
npm run start:standalone
```

Both `start` scripts wrap the same env loading development uses
(`scripts/run-with-env.js`, `scripts/run-next-with-env.js`), so this is the same shape as
`npm run dev`, against the production build and `.env.production`.

With `ENABLE_QUEUE_WORKERS` and `ENABLE_OUTBOX_POLLING` at `true`, the backend process
above runs its own background jobs and outbox polling in-process — no separate worker
window. If you set both to `false` for a split setup instead, start a third window with
`npm run outbox:worker`. Do not do both: running the API with the flags on *and* a
separate worker processes every outbox event twice.

Closing a console window stops that process. Add Task Scheduler, NSSM or PM2 if you want
reboot survival; none is required.

## 6. Reverse proxy

The platform routes **by path on one Apache vhost**, not a subdomain per system:
`portal.examplecorp.com/gms` to 7201, with GMS's API left **unprefixed** at `/api/v1` to
7200 because it was there first and is proven. DMS and SSO nest theirs under their own
prefix specifically to avoid colliding with it — do not "normalise" GMS's routing.

Socket.IO needs the `Upgrade` and `Connection` headers forwarded; `/socket.io/` unprefixed
belongs to GMS for the same historical reason.

The SSO same-origin gateway that carries the SSO-to-GMS handoff runs in the *SSO* repo
(its backend gateway), not here. The one narrow `/gms/__sso` Apache rule it needs sends
that path to the gateway on `127.0.0.1:4200`.

## 7. Redeploy

```powershell
cd C:\apps\gms
git pull
cd backend;   npm ci; npm run build; npm run migrate:prod
cd ..\frontend; npm ci; npm run build
```

Then restart both console windows. `git pull` never touches the env files — they are
gitignored and live only on the server.

## 8. Backups

```powershell
cd C:\apps\gms\backend
npm run db:backup:prod
.\scripts\register-backup-task.ps1 -BackendPath C:\apps\gms\backend
```

`gmsprod` holds the only real production data on the platform. Ship the dumps off-server.
`PRODUCTION_GUIDE.md` §5–6 has the restore procedure, which does not change based on how
the app itself was deployed.

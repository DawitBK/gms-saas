# GMS — Guest Management System

A visitor and access-management portal for ExampleCorp. Guests request visits, hosts and
reception approve and manage them, and credential issue / check-in is coordinated through
QR codes, UniFi Access, notifications and an audit trail.

Node 22 / Express 5 / Sequelize 6 / PostgreSQL backend on port **7200**; Next.js 16
frontend on port **7201**, served at `/gms` behind the shared Apache proxy.

> **This is the only system on the platform with real production data.** `gmsprod` has
> been live with actual users and there is no staging copy of it. Read [`DEPLOY-WINDOWS-MANUAL.md`](DEPLOY-WINDOWS-MANUAL.md) before
> running anything with `prod` in its name — three npm scripts drop every table and none
> of them reads that way.

Platform context — how GMS, DMS and SSO fit together — is in `MASTER_DOC.md` and in the platform
architecture document of the SSO edition. The deployment walkthrough is `DEPLOY-WINDOWS-MANUAL.md`.

## Admin consoles worth knowing about

- **System Health** (`/admin/system-health`) — live provider status (Redis, email, SMS,
  UniFi Access), BullMQ queue depths, and recovery actions for failed outbox events and
  failed UniFi webhooks. Backed by `GET /operations/integration-health` and
  `POST /operations/integrations/{outbox/:id/retry,unifi-webhooks/:id/replay}`.
- **Audit Log** (`/admin/audit-log`) — searchable, paginated view over `audit_logs`
  (filter by entity, action, actor, date range; inspect before/after metadata). Backed by
  the read-only `GET /operations/audit-logs`.

## Prerequisites

- Node.js 22.x and npm
- PostgreSQL — `gmsdev` for development, `gms_test` for the suite, `gmsprod` in production
- Redis — **optional but wanted.** Without it GMS falls back to in-memory rate limiting
  and caching and logs a warning, but the BullMQ-backed notification, reminder and SLA
  jobs need it to do real background work. The test suite needs it: without Redis, 11
  suites fail on connection timeouts rather than on assertions.
- Docker — only if you use the Compose path. The plain-Node path needs nothing else.

## Development

```bash
npm run dev:infra              # optional: Postgres + Redis via docker-compose.dev.yml
cd backend  && npm run dev     # 7200
cd frontend && npm run dev     # 7201 — open this
```

## Production

```bash
cd backend
npm ci
npm run env:check:prod         # validate .env.production without starting anything
npm run build
npm run migrate:prod
npm run start

cd ../frontend
npm ci
npm run build                  # NEXT_PUBLIC_* are baked in HERE, not at startup
npm run start:standalone
```

**Production reads `.env.production` and nothing else.** `.env` is the development file
and is never read when `NODE_ENV=production`; a missing `.env.production` is a hard
refusal to start, not a silent fallback. GMS is the reference implementation of that rule
for the platform — DMS and SSO were brought into line with it on 2026-09-05. Anything
production needs must be written into `.env.production` explicitly.

PM2 (`backend/deploy/ecosystem.config.js`) and Docker Compose are both optional. Read the
warning at the top of the PM2 config before using it: `gms-api` already runs the outbox
poller and BullMQ workers in-process, so starting `gms-outbox` alongside two clustered API
instances processes every job three times.

## Docker Compose

```bash
cp backend/.env.example  backend/.env.production
cp frontend/.env.example frontend/.env.production
npm run docker:up
npm run docker:migrate
npm run docker:seed
```

Set `BACKEND_HOST_PORT` / `FRONTEND_HOST_PORT` if you need different host bindings.

## Tests

```bash
npm test                # full CI parity + Docker image smoke test
npm run test:ci         # what GitHub Actions runs (needs gms_test + Redis)
npm run test:manual     # typecheck, OpenAPI gate, frontend lint+build, backend suite
npm run test:docker     # container images only
npm run test:backend    # jest only
npm run test:frontend   # frontend lint + production build
```

The suite runs against `backend/.env.test` and the `gms_test` database. **Migrate
`gms_test` as well as `gmsdev`** — a column applied to only one of them fails the suite in
a way that reads like a code bug.

If the test count changes, run `npm run test:status` and commit the resulting
`docs/TEST_STATUS.md`. CI fails on drift.

### CI — `.github/workflows/phase2-validation.yml`

| Job | What it runs |
|---|---|
| TypeScript Check | `tsc --noEmit`, backend and frontend |
| Backend Tests | migrate + seed `gms_test`, jest, then the `docs/TEST_STATUS.md` drift check |
| Frontend Lint + Build | `eslint .` and a real production build (`next lint` was removed in Next 16) |
| OpenAPI Coverage | every live `/api/v1` route-method pair against `src/api/swagger.ts` |
| Docker Build | backend + frontend images, `main` only |

Two of these were broken for two months and were repaired on 2026-09-06: the frontend job
ran a `sample.test.mjs` deleted in July, and the OpenAPI job read an
`openapi.json` deleted in the same commit. Because `docker-build` depends on the
OpenAPI job, it had not run on `main` in that time either.

## Repository layout

```
backend/
  src/api/            versioned router (api/v1) + the hand-written OpenAPI spec
  src/modules/        the domain: visits, approvals, guests, hosts, credentials,
                      messages, notifications, offices, services, operations, ocr, auth
  src/core/           db (migrations, sequelize config), logger, utils
  src/infrastructure/ models, queue (BullMQ), cache, email, websocket, unifi
  src/shared/         auth/roles, provisioning, middleware, shared services
  src/seeders/        000-core (roles + bootstrap admins), 003-demo-data,
                      004-staff. Only 000-core is aimed at production, and it REFUSES
                      to run there unless GMS_SEED_ADMIN_PASSWORD is set to something
                      other than the committed dev password. See seed-password.js.
  scripts/            migrations runner, seeds, backup, wipe, simulation, checks
  deploy/             PM2 ecosystem config (optional)
frontend/
  app/                App Router: (public), dashboard, host, reception, admin, scan
  features/           per-domain UI and data hooks
  shared/             components, hooks, lib
  state/              zustand stores
tools/                cross-workspace scripts: unified test runner, env setup, generators
vendor/               the vendored xlsx tarball
```

## Documentation

- `MASTER_DOC.md` — the long-form architecture reference.
- `PRODUCTION_GUIDE.md` — the detailed PM2/nginx production walkthrough.
- `DEPLOY-WINDOWS-MANUAL.md` — the plain-Node Windows deploy, GMS-only summary.
- `SEEDING_COMMANDS.md` — seeders and the Excel bulk-import path.
- `CONTRIBUTING.md` — branching, commits, what to run before a PR.
- `docs/TEST_STATUS.md` — generated; CI diffs it.
- `docs/operations/PLATFORM-LICENSING.md` — the platform licensing contract.

**[`docs/README.md`](docs/README.md) is the documentation index**: reading order, a by-task table, and what is in `docs/` (the generated `TEST_STATUS.md` and the licensing contract in `docs/operations/`).

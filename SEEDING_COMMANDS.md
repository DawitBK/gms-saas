# GMS — seeding and bulk import

How to populate a GMS database: which seeders exist, what each one writes, and the
Excel bulk-import path for the organizational structure.

---

## Read this before running anything with `prod` in its name

**`gmsprod` is the only database on this platform with real production data, and there is
no staging copy of it.** Three npm scripts drop every table, and none of them reads that
way:

| Script | What it actually does |
|---|---|
| `npm run db:wipe:prod` | Drops every table |
| `npm run db:fresh:prod` | Drops every table, then migrates and seeds |

`backend/scripts/wipe-db.js` refuses to run against a production database unless
`I_UNDERSTAND_THIS_DESTROYS` names that database. **That is a backstop, not permission.**
If you find yourself typing that variable, stop and ask someone.

**The server's own seed call is closed in production too.** `POST /api/v1/operations/seed` (administrator) used to start `db:seed:all`
against whatever database the server was using; since 2026-10-11 it answers `403` in production and on the mirror. Seeding the live system
is only ever a deliberate, first-time, by-hand step with the scripts below.

**Bootstrap accounts refuse the committed password in production.** `000-core-seeder.js`
creates `master@gms.local` and `admin@gms.local` as `super_admin`, and its built-in
password is in this repository's git history. In production it throws unless
`GMS_SEED_ADMIN_PASSWORD` is set to something else. See `src/seeders/seed-password.js` —
the reasoning is written out there.

---

## Databases

| Environment | Database | Env file |
|---|---|---|
| Development | `gmsdev` | `backend/.env` + `backend/.env.development` |
| Test | `gms_test` | `backend/.env.test` |
| Production | `gmsprod` | `backend/.env.production` **only** |

Production reads `.env.production` and nothing else. Everything a production run needs
must be written into that file explicitly — nothing is inherited from `.env`.

Migrations and seeds go through `scripts/run-sequelize-cli.js`, which sets `NODE_ENV`
before the CLI starts; `src/core/db/config/config.js` uses that to pick the env file.
**Run the npm scripts, not bare `npx sequelize-cli`** — the bare CLI leaves `NODE_ENV`
unset, which resolves to development and migrates `gmsdev` no matter what you meant.

---

## Commands

### Migrations

| Command | Environment |
|---|---|
| `npm run migrate` | development |
| `npm run migrate:prod` | production |
| `npm run migrate:undo` / `:prod` | roll back the last migration |
| `npm run migrate:undo:all` | roll back everything (development only) |

### Seeding

| Command | What it writes | Environment |
|---|---|---|
| `npm run seed:core` | System roles + the two bootstrap `super_admin` accounts | development |
| `npm run seed:demo` | Demo offices, departments, services, visits (`003`) | development |
| `npm run seed:time-slots` / `:prod` | Materializes availability time slots | both |
| `npm run seed:undo` / `:prod` | Undo all seeders |

### Destructive — development only unless you have a specific reason

| Command | What it does |
|---|---|
| `npm run db:wipe` | Drops every table in `gmsdev` |
| `npm run db:fresh` | Wipe, migrate, seed core |
| `npm run db:hard-reset` | Drop and recreate the dev schema |

The `:prod` variants of the first three exist and are listed in the warning above.

### Checks

| Command | What it does |
|---|---|
| `npm run env:check:prod` | Validate `.env.production` without starting anything |
| `npm run db:audit:org` | Report organizational-integrity problems |
| `npm run db:backup` / `:prod` | `pg_dump` into `backups/` |

---

## The seeders

### `000-core-seeder.js` — roles and bootstrap accounts

The foundational seeder and the only one aimed at production. Creates the seven system
roles (`guest`, `host`, `reception`, `admin`, `super_host`, `super_reception`,
`super_admin`) and the two bootstrap `super_admin` accounts, `master@gms.local` and
`admin@gms.local`.

Their password comes from `seed-password.js`: the well-known development literal outside
production, and in production **only** whatever `GMS_SEED_ADMIN_PASSWORD` supplies. It
refuses rather than generating one, deliberately — a generated password scrolls past in
deploy output and is discovered missing at the moment it is needed.

### `003-demo-data-seeder.js` — demo organizational data

Realistic offices, departments, services and visits for local work. **Development only.**

### `004-staff-seeder.js` — staff accounts

Superseded by the Excel bulk import. It re-hashes the seed password on every run, so
running it is also the way to reset the bootstrap accounts back to the seeded password.
Prefer the import for anything organizational.

---

## Bulk Excel import

The supported way to provision the organizational structure — offices, departments,
services and hosts — without touching the database directly.

### 1. Download the template

Sign in to GMS (`http://localhost:7201` in development,
`https://portal.examplecorp.com/gms` in production), select the **Super Admin** role, then
go to **Admin Control → Structure Seeding → Download Template**.

The template is **generated from the current database** — it is not a static file in the repo, so it always
reflects what is already there.

### 2. Fill in the four sheets

**Offices**

| Name | Address | City | Country | Latitude | Longitude |
|---|---|---|---|---|---|
| Head Office | Main Rd | Example City | Exampleland | 40.71 | -74.01 |

**Departments**

| Office Name | Department Name |
|---|---|
| Head Office | IT Department |

**Services**

| Office Name | Department Name | Service Name | Duration (Mins) | Assigned Hosts (Emails) |
|---|---|---|---|---|
| Head Office | IT Department | System Support | 30 | someone@examplecorp.net |

`Duration (Mins)` is load-bearing: a service's duration sets the actual length of visits
booked for it, rather than the timeslot interval.

**Hosts**

| Office Name | Department Name | Full Name | Email | Roles | Assigned Services | Replace Service Assignments | Active |
|---|---|---|---|---|---|---|---|
| Head Office | IT Department | A Name | a.name@examplecorp.net | host,reception | System Support | true | true |

### 3. Upload

**Admin Control → Structure Seeding → Choose File → Import Structure.** The result
reports created/existing/error counts per sheet.

### How the import behaves

- **Auto-creation.** A missing office, department or service referenced by a later sheet
  is created rather than rejected.
- **Roles are replaced, not merged.** Whatever the `Roles` column says becomes the user's
  role set. Comma-separated for multiple; valid values are the seven listed above.
- **Service assignment** is controlled per row by `Replace Service Assignments`: `true`
  clears existing assignments first, `false` appends.
- **Active** accepts `true`/`1`/`yes`/`y`; `false`/`0`/`no`/`n`/`inactive`/`suspended`
  deactivate.
- **Imported accounts get no usable password.** They are provisioned with an unusable
  random one (`shared/auth/provisioning.ts`). The ways in are SSO, an admin setting a
  password, or "Forgot password". Tell anyone who runs an import this, or they will
  report the accounts as broken.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| A seed or migrate command hits a database you did not expect | You ran `npx sequelize-cli` directly instead of the npm script, so `NODE_ENV` was unset and it resolved to development. |
| `ECONNRESET` during a wipe | Something still holds a connection — stop the dev server and any open `psql` session first. |
| Import reports "N existing" rather than creating | Expected. The import is idempotent for offices, departments and services; only hosts are re-synced. |
| Imported users cannot sign in | Correct behaviour, not a bug. See "Imported accounts get no usable password" above. |
| Seeding refuses in production | `GMS_SEED_ADMIN_PASSWORD` is unset, or set to the committed development password. That refusal is the feature. |

---

An earlier version of this file also carried a Linux/Ubuntu server bring-up walkthrough
and a June 2026 error log from the original bulk-import exercise. The server is Windows,
not Linux, and the deployment procedure lives in `DEPLOY-WINDOWS-MANUAL.md`
and `PRODUCTION_GUIDE.md` — one canonical place each. Both were
removed on 2026-09-06.

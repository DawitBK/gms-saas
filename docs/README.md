# GMS documents

**GMS is the only system with real production data** (`gmsprod`). Read [`../DEPLOY-WINDOWS-MANUAL.md`](../DEPLOY-WINDOWS-MANUAL.md) before running anything with `prod` in its name.

## Read in this order

| # | Document | What it answers |
|---|---|---|
| 1 | [../README.md](../README.md) | What GMS is, how to run, test and deploy it, the repository layout |
| 2 | [../MASTER_DOC.md](../MASTER_DOC.md) | The long-form architecture reference (large and partly dated; trust the code where they disagree) |

## By task

| I want to… | Open |
|---|---|
| deploy GMS on Windows with plain Node | [../DEPLOY-WINDOWS-MANUAL.md](../DEPLOY-WINDOWS-MANUAL.md) |
| run seeders or the Excel bulk import | [../SEEDING_COMMANDS.md](../SEEDING_COMMANDS.md) |
| follow the PM2/nginx walkthrough | [../PRODUCTION_GUIDE.md](../PRODUCTION_GUIDE.md) (June 2026; partly superseded by `DEPLOY-WINDOWS-MANUAL.md`) |
| understand platform licensing | [operations/PLATFORM-LICENSING.md](operations/PLATFORM-LICENSING.md) |
| contribute a change | [../CONTRIBUTING.md](../CONTRIBUTING.md) |
| write a database migration | [../backend/src/core/db/migrations/README.md](../backend/src/core/db/migrations/README.md) |

## In this folder

| Item | What it is |
|---|---|
| `TEST_STATUS.md` | **Generated** by `npm run test:status`; CI fails if it is out of date. Don't edit or move it |
| `operations/` | The platform licensing contract (`PLATFORM-LICENSING.md`); the same text is in the SSO and DMS editions |

[← GMS README](../README.md)

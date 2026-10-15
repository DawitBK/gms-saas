# GMS documents

**GMS is the only system with real production data** (`gmsprod`). Read [`../CLAUDE.md`](../CLAUDE.md) before running anything with `prod` in its name.

## Read in this order

| # | Document | What it answers |
|---|---|---|
| 1 | [../README.md](../README.md) | What GMS is, how to run, test and deploy it, the repository layout |
| 2 | [../CLAUDE.md](../CLAUDE.md) | The conventions and the footguns that have actually bitten this repo |
| 3 | [../MASTER_DOC.md](../MASTER_DOC.md) | The long-form architecture reference (large and partly dated; trust the code where they disagree) |
| 4 | [../GMS-AUDIT.md](../GMS-AUDIT.md) and [../GMS-AUDIT-REMEDIATION.md](../GMS-AUDIT-REMEDIATION.md) | The 2026-09-02 audit findings, and what was done about each. *`GMS-AUDIT.html` is older than the `.md`; the page says so* |

## By task

| I want to… | Open |
|---|---|
| deploy GMS on Windows with plain Node | [../DEPLOY-WINDOWS-MANUAL.md](../DEPLOY-WINDOWS-MANUAL.md); the platform runbook is [../../DEPLOYMENT-GUIDE.md](../../DEPLOYMENT-GUIDE.md) |
| run seeders or the Excel bulk import | [../SEEDING_COMMANDS.md](../SEEDING_COMMANDS.md) |
| follow the PM2/nginx walkthrough | [../PRODUCTION_GUIDE.md](../PRODUCTION_GUIDE.md) (June 2026; partly superseded by the platform runbook) |
| contribute a change | [../CONTRIBUTING.md](../CONTRIBUTING.md) |
| write a database migration | [../backend/src/core/db/migrations/README.md](../backend/src/core/db/migrations/README.md) |

## In this folder

| Item | What it is |
|---|---|
| `TEST_STATUS.md` | **Generated** by `npm run test:status`; CI fails if it is out of date. Don't edit or move it |
| `templates/` | Spreadsheets used by people, not by the code: the organisational bulk-seeder template (the app generates its own download from the database) and a retest checklist |
| `history/` | `GMS_Enterprise_Master_Documentation.docx`, the May 2026 Word document that `MASTER_DOC.md` replaced |

[← GMS README](../README.md) · [Platform start page](../../README.md)

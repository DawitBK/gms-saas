# Contributing to GMS

Enterprise guest/visitor management system, integrated with UniFi Access. Shares one
contribution convention with its two sibling systems, SSO and DMS — an engineer
moving between the three repos should not have to relearn how branches, commits, or
PRs work in each one.

## Branching

- `main` is always deployable. Never commit directly to it.
- Branch off `main` using `<type>/<short-description>`, where `<type>` is one of:
  `feat`, `fix`, `chore`, `docs`, `refactor`, `test`. Example: `fix/sso-role-resolution-native-login`.
- Keep branches scoped to one change — GMS's role-based state machine and outbox
  event processing are easy to reason about individually and hard to reason about in
  a mixed diff.

## Commits

- Follow [Conventional Commits](https://www.conventionalcommits.org/): `<type>: <summary>`,
  e.g. `fix: check SSO role grant before minting a native-login JWT`.
- Explain *why* in the body when the reason isn't obvious from the diff.
- Reference the relevant `SSO/docs/platform/DEFECT_AND_GAP_REGISTER.md` entry (e.g.
  `PLATFORM-GAP-012`) when a commit closes or touches one.

## Before opening a PR

Run what CI runs, locally, first:

```bash
cd backend   && npx tsc --noEmit
cd ../frontend && npx tsc --noEmit && npm run lint
cd ../backend  && npm test -- --runInBand && npm run test:openapi-coverage
```

The test suite needs Redis running and `gms_test` migrated. Without Redis, 11 suites
fail on connection timeouts and teardown hooks rather than on assertions — that is
the environment, not your change.

If your change affects the test count or coverage, run `npm run test:status` and
commit the resulting `docs/TEST_STATUS.md` diff (repo root, not `backend/docs`) —
CI fails the build if this file is stale relative to the actual test run.

## Pull requests

- Use the PR template (`.github/pull_request_template.md`).
- CI (`.github/workflows/phase2-validation.yml`) must pass before merge: typecheck
  (both workspaces), the backend test suite against a migrated and seeded test DB,
  the TEST_STATUS.md drift check, frontend lint + production build, and the OpenAPI
  coverage gate.
- Squash-merge by default, so `main`'s history stays one commit per logical change.

## Scope discipline (Directive §8)

This repo is part of an active platform-wide architecture standardization effort
(see the parent SSO repo's root `Platform_Architecture_Standardization_Directive.md`
and `SSO/docs/platform/`). Its own governing rule applies to every contribution, not
just that effort: GMS's role-based state machine and outbox-pattern event processing
are sound and intentional — the goal of any given change should be to align project
structure, API design, and platform-wide concerns, not to redesign domain logic. Don't
change functional behavior as a side effect of a structural change unless the PR
description says so explicitly and why.

## Where things live

- `README.md` — layout, prerequisites, run/test/deploy commands, and what each CI
  job actually runs.
- `MASTER_DOC.md` — the long-form architecture reference. Large and partly dated;
  trust the source and the scripts where they disagree with its prose.
- `docs/TEST_STATUS.md` — generated test-status snapshot (see "Before opening a PR"
  above).
- `CLAUDE.md` (this repo, and the platform root one level up) — durable,
  cross-session working context. Read it before changing anything.

The doc-rot this section used to flag — `README.md` pointing at `docs/deploy/`,
`docs/setup/` and `docs/testing/` files that were never in this repo — was cleaned
up on 2026-09-06. `docs/` contains `TEST_STATUS.md` and nothing else, and README no
longer claims otherwise.

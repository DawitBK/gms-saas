<!-- GMS. See CONTRIBUTING.md for the full convention this template supports. -->

## What changed and why

<!-- The "why" matters more than the "what" - the diff already shows what changed. -->

## Type of change

- [ ] `feat` — new functionality
- [ ] `fix` — bug fix
- [ ] `chore` / `refactor` — no functional change
- [ ] `docs` — documentation only
- [ ] `test` — test coverage only

## Scope check (Directive §8)

- [ ] This change is purely structural/architectural, OR
- [ ] This change alters existing functional behavior, and that is called out
      explicitly above with the reason why.

## Related gap register entry

<!-- e.g. Closes PLATFORM-GAP-021. Leave blank if not applicable. -->

## Verification

<!-- What you actually ran, not what should theoretically pass. -->

- [ ] `npx tsc --noEmit` clean (backend and/or frontend, as applicable)
- [ ] `npm test -- --runInBand` green
- [ ] `npm run test:status` run and `docs/TEST_STATUS.md` diff committed (if the test
      count/coverage changed)
- [ ] Manually verified against a running instance (describe how below), where the
      change touches user-facing or request-handling behavior — including through the
      SSO same-origin gateway (`gms.localtest.me:4200`) if it touches auth/session flow

<!-- Paste the actual command output / curl output / screenshot evidence here. -->

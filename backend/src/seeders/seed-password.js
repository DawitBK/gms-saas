"use strict";

const bcrypt = require("bcryptjs");

/**
 * The password seeded accounts get, and the rule about where seeding is allowed.
 *
 * WHAT WAS WRONG
 *
 * Every seeder hardcoded the literal `GMSAdmin@2026` at bcrypt cost 10, and
 * `000-core-seeder.js` uses it for `master@gms.local` and `admin@gms.local`,
 * both `super_admin`. That is not merely a dev convenience: `package.json`
 * ships `db:fresh:prod` and `seed:passwords:prod`, which run
 * `000-core-seeder.js` against `gmsprod` by design. Running the platform's own
 * documented production bring-up therefore created a platform-wide super_admin
 * whose password is in this repository's git history in plaintext, and
 * `004-staff-seeder.js` re-hashed the same password on every rerun so it could
 * never drift out of use. `requires_password_change: true` reads like a
 * mitigation and is not one — nothing in the request pipeline consults it.
 *
 * THE RULE
 *
 * Outside production, the well-known literal is kept deliberately. Developers
 * share it, the test fixtures assume it, and there is nothing on a dev box
 * worth protecting; changing it there would break local work for no gain.
 *
 * In production the literal is refused outright. An operator who genuinely
 * needs the bootstrap account must supply `GMS_SEED_ADMIN_PASSWORD`, so the
 * credential exists only in that server's environment and never in the repo.
 * Refusing rather than generating-and-printing is deliberate: a generated
 * password would be scrolled past in deploy output, and the operator would
 * discover it was never captured at the moment they needed it.
 */
const DEV_SEED_PASSWORD = "GMSAdmin@2026";

function resolveSeedPassword() {
  const isProd = process.env.NODE_ENV === "production";
  const supplied = process.env.GMS_SEED_ADMIN_PASSWORD;

  if (!isProd) return supplied || DEV_SEED_PASSWORD;

  if (!supplied) {
    throw new Error(
      "Refusing to seed production accounts with the well-known development password.\n\n" +
        "  This seeder creates super_admin accounts. Its built-in password is committed\n" +
        "  to this repository's git history, so seeding production with it publishes a\n" +
        "  platform-wide administrator credential.\n\n" +
        "  Set GMS_SEED_ADMIN_PASSWORD to a real, unique password before running any\n" +
        "  *:prod seed command, e.g.\n\n" +
        '      $env:GMS_SEED_ADMIN_PASSWORD="<a password only you know>"\n\n' +
        "  A normal deploy of an existing GMS installation does not need to seed at\n" +
        "  all — the accounts already exist. Seeding is for a first-time bring-up.",
    );
  }

  if (supplied === DEV_SEED_PASSWORD) {
    throw new Error(
      "GMS_SEED_ADMIN_PASSWORD is set to the development default, which is published " +
        "in this repository. Choose a different password for production.",
    );
  }

  return supplied;
}

/** Cost 12 to match BCRYPT_COST elsewhere; the seeders all used a weaker 10. */
async function seedPasswordHash() {
  return bcrypt.hash(resolveSeedPassword(), Number(process.env.BCRYPT_COST) || 12);
}

/** What to print after seeding — never the actual password in production. */
function seedPasswordNotice() {
  return process.env.NODE_ENV === "production"
    ? "the password supplied in GMS_SEED_ADMIN_PASSWORD"
    : `"${DEV_SEED_PASSWORD}"`;
}

module.exports = { DEV_SEED_PASSWORD, resolveSeedPassword, seedPasswordHash, seedPasswordNotice };

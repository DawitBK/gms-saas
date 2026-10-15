/**
 * One-time backfill: migrate every GMS user's CURRENT local role assignment
 * into SSO's idp_client_user_roles grants table (platform directive §6.3),
 * so flipping login precedence to trust SSO never demotes an existing user.
 *
 * Run before relying on SSO as the role source for any already-provisioned
 * staff account. Idempotent — safe to re-run (setSsoGrantedRoles replaces the
 * whole grant set per user, so re-running just re-asserts the same state
 * unless GMS's local roles changed in between).
 *
 * Usage: node scripts/run-with-env.js development scripts/backfill-sso-role-grants.ts
 */

import { sequelize } from '../src/infrastructure/database/sequelize';
import { User, Role } from '../src/infrastructure/database/models';
import { setSsoGrantedRoles } from '../src/modules/auth/sso-roles-client';

async function main(): Promise<void> {
  await sequelize.authenticate();

  const users = await User.findAll({
    include: [{ model: Role, as: 'roles', through: { attributes: [] } }],
  });

  console.log(`Found ${users.length} GMS users. Backfilling non-guest roles into SSO...`);

  let migrated = 0;
  let skipped = 0;
  const failures: Array<{ email: string; error: string }> = [];

  for (const userModel of users) {
    const user = userModel.toJSON() as { email: string; roles?: Array<{ name: string }> };
    const roleNames = (user.roles ?? []).map((r) => r.name).filter((name) => name !== 'guest');

    if (roleNames.length === 0) {
      skipped++;
      continue;
    }

    try {
      await setSsoGrantedRoles(user.email, roleNames, 'backfill');
      migrated++;
      if (migrated % 25 === 0) console.log(`  ${migrated} migrated so far...`);
    } catch (err) {
      failures.push({ email: user.email, error: (err as Error).message });
    }
  }

  console.log(`\nDone. Migrated ${migrated} users with a non-guest role, skipped ${skipped} guest-only users.`);
  if (failures.length > 0) {
    console.error(`${failures.length} FAILURES (these users' roles were NOT backfilled — do not flip precedence until this is zero):`);
    for (const f of failures) console.error(`  ${f.email}: ${f.error}`);
    process.exitCode = 1;
  }

  await sequelize.close();
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});

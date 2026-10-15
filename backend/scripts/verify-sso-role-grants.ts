/**
 * Row-for-row verification that the backfill (backfill-sso-role-grants.ts)
 * actually landed correctly — per the platform directive's explicit
 * distrust of a migration script's exit code as sufficient evidence (§11).
 * Compares every GMS user's current local non-guest roles against what SSO
 * now reports for that email, and fails loudly on any mismatch.
 *
 * Usage: node scripts/run-with-env.js development scripts/verify-sso-role-grants.ts
 */

import { sequelize } from '../src/infrastructure/database/sequelize';
import { User, Role } from '../src/infrastructure/database/models';
import { getSsoGrantedRoles } from '../src/modules/auth/sso-roles-client';

function sameSet(a: string[], b: string[]): boolean {
  const as = [...a].sort();
  const bs = [...b].sort();
  return as.length === bs.length && as.every((v, i) => v === bs[i]);
}

async function main(): Promise<void> {
  await sequelize.authenticate();

  const users = await User.findAll({
    include: [{ model: Role, as: 'roles', through: { attributes: [] } }],
  });

  let checked = 0;
  let matched = 0;
  const mismatches: Array<{ email: string; local: string[]; sso: string[] }> = [];

  for (const userModel of users) {
    const user = userModel.toJSON() as { email: string; roles?: Array<{ name: string }> };
    const localRoles = (user.roles ?? []).map((r) => r.name).filter((name) => name !== 'guest');
    if (localRoles.length === 0) continue;

    checked++;
    const ssoRoles = await getSsoGrantedRoles(user.email);
    if (sameSet(localRoles, ssoRoles)) {
      matched++;
    } else {
      mismatches.push({ email: user.email, local: localRoles, sso: ssoRoles });
    }
  }

  console.log(`Checked ${checked} users with a non-guest local role.`);
  console.log(`${matched}/${checked} match SSO's grant exactly.`);

  if (mismatches.length > 0) {
    console.error(`\n${mismatches.length} MISMATCH(ES) — do not flip login precedence until this is zero:`);
    for (const m of mismatches) {
      console.error(`  ${m.email}: local=[${m.local.join(',')}] sso=[${m.sso.join(',')}]`);
    }
    process.exitCode = 1;
  } else {
    console.log('\nAll users verified row-for-row. Safe to proceed.');
  }

  await sequelize.close();
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});

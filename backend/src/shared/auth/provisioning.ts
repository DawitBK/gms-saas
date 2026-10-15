import crypto from "crypto";
import bcrypt from "bcryptjs";
import { appConfig } from "../../config/app.config";

/**
 * The password an account gets when it is created *for* somebody rather than
 * *by* somebody — bulk spreadsheet imports, org-chart sync, any provisioning
 * path where no human chose a password.
 *
 * WHAT THIS REPLACES
 *
 * Three separate provisioning paths each hardcoded a literal:
 * `user.service.ts`'s bulkImport used `"Password123"` at cost 10,
 * `operations.service.ts`'s bulkImportOrg used `"GMSAdmin@2026"` at cost 10,
 * and the seeders use `"GMSAdmin@2026"` as well. All three set
 * `requires_password_change: true`, which reads like a control and is not one:
 * nothing in the request pipeline ever looked at that column, so the account
 * was fully usable from the moment it existed, with a password published in
 * this repository's git history and — for the bulk-import path — printed in
 * the admin UI's own instruction sheet ("New users default to
 * 'GMSAdmin@2026'", BulkUploadModal.tsx). One spreadsheet upload minted an
 * arbitrary number of immediately-usable accounts with one guessable password.
 *
 * WHY RANDOM RATHER THAN A BETTER SHARED DEFAULT
 *
 * Any shared default is one leak away from being every provisioned account's
 * password at once, and a "temporary" one survives for as long as nobody
 * audits it. 32 bytes of CSPRNG output is not a password anyone is meant to
 * type or receive: it exists so the bcrypt column is well-formed and so the
 * only way into a provisioned account is the paths that prove identity — an
 * admin setting a password deliberately, the emailed reset OTP, or SSO. The
 * value is deliberately not returned to the caller, because there is no
 * recipient for whom knowing it would be safe.
 *
 * Cost comes from appConfig (12 by default) rather than the literal 10 the
 * two bulk paths passed, so provisioned accounts are not hashed weaker than
 * the ones people register themselves.
 */
export async function hashUnusablePassword(): Promise<string> {
  const unguessable = crypto.randomBytes(32).toString("base64url");
  return bcrypt.hash(unguessable, appConfig.security.bcryptCost);
}

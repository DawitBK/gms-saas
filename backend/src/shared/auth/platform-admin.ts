/**
 * The platform administrator in GMS.
 *
 * GMS holds no flag for it: the platform administrator reaches GMS through the
 * SSO token bridge as an ordinary `super_admin` account. When the SSO side stores
 * the owner under a keyed pseudonym (see SSO's `platform-admin.ts`),
 * that account's email ends in `@platform.invalid`, a reserved top-level domain
 * that can never be a real mailbox. That suffix is therefore a safe marker, and
 * this module is its single definition for GMS.
 *
 * Effect: the account is absent from the staff list and reads as "user not found"
 * to every other administrator for get, edit, delete, restore and set-roles, so it
 * cannot be probed, renamed, deactivated or re-roled from GMS. The account itself
 * still sees its own record (its own `/users/profile` keeps working).
 *
 * If the owner's account is stored under its real email instead, GMS cannot tell
 * it apart and none of this applies; the SSO-side protection still holds.
 */
import { Op } from 'sequelize';

export const PLATFORM_ADMIN_EMAIL_PATTERN = '%@platform.invalid';

export function isPlatformAdminEmail(email: unknown): boolean {
  return typeof email === 'string' && email.trim().toLowerCase().endsWith('@platform.invalid');
}

/** Sequelize where-fragment that leaves the platform administrator out of a `users` query. */
export function excludePlatformAdminsWhere(): Record<string, unknown> {
  return { email: { [Op.notILike]: PLATFORM_ADMIN_EMAIL_PATTERN } };
}

/**
 * Seat limit (docs/operations/PLATFORM-LICENSING.md sections 1.3 and 6).
 *
 * `seatsUsed` is the number of ACTIVE, non-deleted accounts that are not the platform administrator.
 * Only CREATING or ACTIVATING an account beyond `maxUsers` is refused (403 LICENSE_SEAT_LIMIT);
 * existing accounts are never deactivated by it. Call `assertSeatAvailable` immediately BEFORE every
 * write that would add an ACTIVE account, passing the transaction so rows added earlier in the same
 * bulk import are already counted.
 *
 * Skipped (never refuses) when: the state is `unconfigured`/`unknown`, the licence has no limit,
 * enforcement is `off`, or the account being added is the platform administrator. In `warn` it logs.
 */
import type { Transaction } from 'sequelize';
import { AppError } from '../../core/errors/AppError';
import { ErrorCodes } from '../../core/errors/errorCodes';
import { logger } from '../../core/logger/logger';
import { User } from '../../infrastructure/database/models/User';
import { excludePlatformAdminsWhere, isPlatformAdminEmail } from '../../shared/auth/platform-admin';
import { licenseStore, type LicenseStore } from './license.store';

export async function countSeatsUsed(transaction?: Transaction): Promise<number> {
  return User.count({
    where: { status: 'ACTIVE', ...excludePlatformAdminsWhere() },
    transaction,
  });
}

export interface SeatCheckOptions {
  /** The account about to be added; a platform administrator address is exempt. */
  email?: string | null;
  transaction?: Transaction;
  store?: LicenseStore;
  /** Test seam. */
  counter?: (transaction?: Transaction) => Promise<number>;
}

export async function assertSeatAvailable(options: SeatCheckOptions = {}): Promise<void> {
  const store = options.store ?? licenseStore;
  if (store.enforcement === 'off') return;
  if (options.email && isPlatformAdminEmail(options.email)) return;

  const snapshot = store.snapshot();
  if (snapshot.state === 'unconfigured' || snapshot.state === 'unknown') return;
  const maxUsers = snapshot.claims?.maxUsers ?? null;
  if (maxUsers === null) return;

  let used: number;
  try {
    used = await (options.counter ?? countSeatsUsed)(options.transaction);
  } catch (err) {
    // Cannot count: do not refuse someone over a counting failure.
    logger.error({ module: 'license', err }, 'Seat count failed; allowing the account');
    return;
  }
  if (used < maxUsers) return;

  if (store.enforcement === 'warn') {
    logger.warn({ module: 'license', seatsUsed: used, maxUsers }, 'LICENSE_ENFORCEMENT=warn: this account would have been refused (seat limit)');
    return;
  }
  throw new AppError(
    'The licence seat limit has been reached; no more active accounts can be added. Contact your administrator.',
    ErrorCodes.LICENSE_SEAT_LIMIT,
    403,
    { maxUsers, seatsUsed: used },
  );
}

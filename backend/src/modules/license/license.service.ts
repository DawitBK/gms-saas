/**
 * GET /api/v1/license/status payload (docs/operations/PLATFORM-LICENSING.md section 5).
 * `enforcement` is an additive extra the contract does not list; the frontend treats it as optional.
 */
import { logger } from '../../core/logger/logger';
import { countSeatsUsed } from './license.seats';
import { licenseStore, type LicenseSource, type LicenseStore } from './license.store';
import type { LicenseState } from './license.state';

export interface LicenseStatusDto {
  system: 'gms';
  state: LicenseState;
  customer: string | null;
  expiresAt: string | null;
  graceEndsAt: string | null;
  daysRemaining: number | null;
  warnDays: number | null;
  graceDays: number | null;
  readOnly: boolean;
  maxUsers: number | null;
  seatsUsed: number | null;
  modules: string[] | null;
  source: LicenseSource;
  fetchedAt: string | null;
  version: number | null;
  enforcement: 'enforce' | 'warn' | 'off';
}

export async function buildLicenseStatus(
  store: LicenseStore = licenseStore,
  seatCounter: () => Promise<number> = () => countSeatsUsed(),
): Promise<LicenseStatusDto> {
  const snap = store.snapshot();
  const claims = snap.claims;

  let seatsUsed: number | null = null;
  try {
    seatsUsed = await seatCounter();
  } catch (err) {
    logger.warn({ module: 'license', err }, 'Could not count seats for the licence status');
  }

  return {
    system: 'gms',
    state: snap.state,
    customer: claims?.customer ?? null,
    expiresAt: claims?.expiresAt ? claims.expiresAt.toISOString() : null,
    graceEndsAt: snap.graceEndsAt,
    daysRemaining: snap.daysRemaining,
    warnDays: claims?.warnDays ?? null,
    graceDays: claims?.graceDays ?? null,
    readOnly: store.enforcement === 'enforce' && snap.state === 'expired',
    maxUsers: claims?.maxUsers ?? null,
    seatsUsed,
    modules: claims?.modules ?? null,
    source: snap.source,
    fetchedAt: snap.fetchedAt ? snap.fetchedAt.toISOString() : null,
    version: claims?.ver ?? null,
    enforcement: store.enforcement,
  };
}

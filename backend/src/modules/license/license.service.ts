/**
 * GET /api/v1/license/status payload (docs/operations/PLATFORM-LICENSING.md section 5).
 * `enforcement` is an additive extra the contract does not list; the frontend treats it as optional.
 */
import { logger } from '../../core/logger/logger';
import { computeEntitlement, type EntitlementReason } from './license.entitlement';
import { countSeatsUsed } from './license.seats';
import { licenseStore, type LicenseSource, type LicenseStore } from './license.store';
import type { LicenseState } from './license.state';
import type { LicenseMode } from './license.token';

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
  /** Section 9: is a licence required here (LICENSE_REQUIRED)? */
  required: boolean;
  /** Section 9: may this system be used (always true when not required). */
  licensed: boolean;
  reason: EntitlementReason | null;
  /** Section 9: computed by the backend from its own SSO integration config. */
  deployment: LicenseMode;
  /** Additive: which date is binding, the licence's own or SSO's (this system ends when SSO ends). null when no licence is held. */
  limitedBy: 'licence' | 'sso' | null;
}

export async function buildLicenseStatus(
  store: LicenseStore = licenseStore,
  seatCounter: () => Promise<number> = () => countSeatsUsed(),
): Promise<LicenseStatusDto> {
  const snap = store.snapshot();
  const claims = snap.claims;
  const required = store.required === true;
  const deployment: LicenseMode = store.deployment ?? 'sso';
  const entitlement = computeEntitlement({ required, deployment, token: claims });

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
    required,
    licensed: entitlement.licensed,
    reason: entitlement.reason,
    deployment,
    limitedBy: snap.limitedBy ?? null,
  };
}

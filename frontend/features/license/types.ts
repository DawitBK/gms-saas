/** GET /api/v1/license/status (docs/operations/PLATFORM-LICENSING.md section 5). */
export type LicenseState = 'unconfigured' | 'unknown' | 'active' | 'expiring' | 'grace' | 'expired';

/** The gateable GMS module keys (contract section 7). Core is never gated. */
export type LicenseModule = 'visits' | 'scheduling' | 'checkin' | 'credentials' | 'notifications' | 'ocr';

export interface LicenseStatus {
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
  /** null = every module enabled */
  modules: string[] | null;
  source: 'sso' | 'cache' | 'none';
  fetchedAt: string | null;
  version: number | null;
  enforcement?: 'enforce' | 'warn' | 'off';
  /** Section 9: a licence is required on this installation (LICENSE_REQUIRED). */
  required: boolean;
  /** Section 9: the system may be used. Always true when not required. */
  licensed: boolean;
  reason: 'NO_LICENSE' | 'MODE_NOT_LICENSED' | null;
  /** Computed by the backend from its own SSO integration config. */
  deployment: 'sso' | 'standalone';
}

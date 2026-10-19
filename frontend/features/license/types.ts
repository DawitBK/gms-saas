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
}

import type { LicenseModule, LicenseStatus } from '@features/license/types';

/**
 * Is a gateable module on this licence? Unknown information means yes: a status that has not loaded,
 * failed, or carries `modules: null` (all enabled) must never hide anything.
 */
export function isLicenseModuleEnabled(status: LicenseStatus | null | undefined, module: LicenseModule | undefined): boolean {
  if (!module) return true;
  const modules = status?.modules;
  if (!modules) return true;
  return modules.includes(module);
}

/** What a person is told when the API answers with a licence error code. */
export const LICENSE_ERROR_MESSAGES: Record<string, string> = {
  LICENSE_EXPIRED: 'The licence has expired and the system is read-only. You can still view records. Contact your administrator.',
  LICENSE_MODULE_DISABLED: 'This feature is not included in your licence. Contact your administrator.',
  LICENSE_SEAT_LIMIT: 'The licence seat limit has been reached, so no more active accounts can be added. Contact your administrator.',
};

export const isLicenseErrorCode = (code: unknown): code is keyof typeof LICENSE_ERROR_MESSAGES =>
  typeof code === 'string' && Object.prototype.hasOwnProperty.call(LICENSE_ERROR_MESSAGES, code);

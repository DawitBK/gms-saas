/**
 * GMS licence module catalogue (docs/operations/PLATFORM-LICENSING.md section 7).
 *
 * These are the keys SSO's `licenses/catalog.ts` offers for `gms`; a test pins this list to the
 * document. Core is NEVER gateable: auth, users, offices, departments, services, operations, the
 * internal SSO bridge, health and the licence status itself.
 */
export const GMS_LICENSE_MODULES = ['visits', 'scheduling', 'checkin', 'credentials', 'notifications', 'ocr'] as const;

export type GmsLicenseModule = (typeof GMS_LICENSE_MODULES)[number];

export const isGmsLicenseModule = (value: unknown): value is GmsLicenseModule =>
  typeof value === 'string' && (GMS_LICENSE_MODULES as readonly string[]).includes(value);

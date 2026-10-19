import { describe, expect, it } from '@jest/globals';
import { computeEntitlement, effectiveModes, type EntitlementInput } from './license.entitlement';
import { LICENSE_REQUIRED_EXEMPT, isLicenseRequiredExempt, normalizeLicensePath } from './license.routing';

type Row = [string, EntitlementInput, { licensed: boolean; reason: 'NO_LICENSE' | 'MODE_NOT_LICENSED' | null }];

const LICENSED = { licensed: true, reason: null } as const;
const NO_LICENSE = { licensed: false, reason: 'NO_LICENSE' } as const;
const MODE_NOT_LICENSED = { licensed: false, reason: 'MODE_NOT_LICENSED' } as const;

describe('computeEntitlement (PLATFORM-LICENSING.md section 9)', () => {
  const rows: Row[] = [
    // not required: always licensed, whatever is (or is not) held
    ['not required, no token, sso', { required: false, deployment: 'sso', token: null }, LICENSED],
    ['not required, no token, standalone', { required: false, deployment: 'standalone', token: null }, LICENSED],
    ['not required, sso-only token on a standalone deployment', { required: false, deployment: 'standalone', token: { modes: ['sso'] } }, LICENSED],

    // required, nothing verified
    ['required, no token, sso', { required: true, deployment: 'sso', token: null }, NO_LICENSE],
    ['required, no token, standalone', { required: true, deployment: 'standalone', token: null }, NO_LICENSE],

    // required, token without a modes claim: means ['sso']
    ['required, modes absent, sso deployment', { required: true, deployment: 'sso', token: {} }, LICENSED],
    ['required, modes null, sso deployment', { required: true, deployment: 'sso', token: { modes: null } }, LICENSED],
    ['required, modes empty, sso deployment', { required: true, deployment: 'sso', token: { modes: [] } }, LICENSED],
    ['required, modes absent, standalone deployment', { required: true, deployment: 'standalone', token: {} }, MODE_NOT_LICENSED],
    ['required, modes empty, standalone deployment', { required: true, deployment: 'standalone', token: { modes: [] } }, MODE_NOT_LICENSED],

    // required, explicit modes
    ['required, [sso], sso deployment', { required: true, deployment: 'sso', token: { modes: ['sso'] } }, LICENSED],
    ['required, [sso], standalone deployment', { required: true, deployment: 'standalone', token: { modes: ['sso'] } }, MODE_NOT_LICENSED],
    ['required, [standalone], standalone deployment', { required: true, deployment: 'standalone', token: { modes: ['standalone'] } }, LICENSED],
    ['required, [standalone], sso deployment', { required: true, deployment: 'sso', token: { modes: ['standalone'] } }, MODE_NOT_LICENSED],
    ['required, [sso, standalone], sso deployment', { required: true, deployment: 'sso', token: { modes: ['sso', 'standalone'] } }, LICENSED],
    ['required, [sso, standalone], standalone deployment', { required: true, deployment: 'standalone', token: { modes: ['sso', 'standalone'] } }, LICENSED],
  ];

  it.each(rows)('%s', (_label, input, expected) => {
    expect(computeEntitlement(input)).toEqual(expected);
  });

  it('is pure: the same input always gives the same answer and the input is not touched', () => {
    const input: EntitlementInput = { required: true, deployment: 'standalone', token: { modes: ['sso'] } };
    const copy = JSON.parse(JSON.stringify(input));
    expect(computeEntitlement(input)).toEqual(computeEntitlement(input));
    expect(input).toEqual(copy);
  });

  it('effectiveModes reads absent, null and empty as sso', () => {
    expect(effectiveModes(undefined)).toEqual(['sso']);
    expect(effectiveModes(null)).toEqual(['sso']);
    expect(effectiveModes([])).toEqual(['sso']);
    expect(effectiveModes(['standalone'])).toEqual(['standalone']);
  });
});

describe('the LICENSE_REQUIRED exempt list', () => {
  it.each([
    '/health',
    '/license/status',
    '/license/install',
    '/auth/login',
    '/auth/verify-2fa',
    '/auth/refresh',
    '/auth/logout',
    '/auth/me',
    '/internal/sso/sessions',
    '/internal/sso/sessions/revoke',
    '/internal/sso/users/by-email/a%40b.co/status',
  ])('%s stays reachable', (path) => {
    expect(isLicenseRequiredExempt(normalizeLicensePath(path))).toBe(true);
  });

  it.each([
    '/users',
    '/visits',
    '/offices',
    '/operations/dashboard',
    '/auth/register',
    '/auth/forgot-password',
    '/auth/change-password',
    '/license',
    '/license/status/x',
    '/license/installer',
    '/auth/login/extra',
    '/internal/ssox',
    '/healthz',
    '/',
  ])('%s is not exempt', (path) => {
    expect(isLicenseRequiredExempt(normalizeLicensePath(path))).toBe(false);
  });

  it('case, duplicate slashes, a trailing slash and percent-encoding do not hide or fake an exempt path', () => {
    expect(isLicenseRequiredExempt(normalizeLicensePath('/AUTH/Login/'))).toBe(true);
    expect(isLicenseRequiredExempt(normalizeLicensePath('//auth//login'))).toBe(true);
    expect(isLicenseRequiredExempt(normalizeLicensePath('/auth/%6Cogin'))).toBe(true);
    expect(isLicenseRequiredExempt(normalizeLicensePath('/users/../auth/login'))).toBe(false);
  });

  it('every entry says why', () => {
    for (const entry of LICENSE_REQUIRED_EXEMPT) expect(entry.why.length).toBeGreaterThan(0);
  });
});

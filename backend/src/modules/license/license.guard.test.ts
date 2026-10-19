import { afterEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import app from '../../app';
import { GMS_LICENSE_MODULES } from './license.catalog';
import { licenseStore, type LicenseSnapshot } from './license.store';
import { READ_ONLY_ALLOWLIST, isReadOnlyAllowlisted, moduleForPath, normalizeLicensePath } from './license.routing';
import type { LicenseClaims } from './license.token';
import type { LicenseState } from './license.state';

const claims = (over: Partial<LicenseClaims> = {}): LicenseClaims => ({
  iss: 'http://sso.test',
  aud: 'license:gms',
  sys: 'gms',
  ver: 1,
  iat: null,
  customer: 'Example Corp',
  expiresAt: new Date('2027-01-01T00:00:00.000Z'),
  graceDays: 14,
  warnDays: 30,
  maxUsers: null,
  modules: null,
  ...over,
});

const snapshot = (state: LicenseState, over: Partial<LicenseClaims> = {}): LicenseSnapshot => ({
  state,
  daysRemaining: null,
  graceEndsAt: state === 'expired' ? '2026-01-15T00:00:00.000Z' : null,
  source: state === 'unknown' ? 'none' : 'sso',
  fetchedAt: null,
  claims: state === 'unknown' || state === 'unconfigured' ? null : claims(over),
});

const setLicense = (state: LicenseState, over: Partial<LicenseClaims> = {}, enforcement: 'enforce' | 'warn' | 'off' = 'enforce') => {
  jest.spyOn(licenseStore, 'snapshot').mockReturnValue(snapshot(state, over));
  jest.spyOn(licenseStore, 'enforcement', 'get').mockReturnValue(enforcement);
};

afterEach(() => {
  jest.restoreAllMocks();
});

const codeOf = (res: request.Response): string | undefined => res.body?.error?.code;
const send = (method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) =>
  request(app)[method](`/api/v1${path}`).send(method === 'get' ? undefined : {});

describe('route classification (pure)', () => {
  it('maps each GMS route group onto its licence module, and leaves core unmapped', () => {
    const cases: Array<[string, string | null]> = [
      ['/visits', 'visits'],
      ['/visits/12', 'visits'],
      ['/visits/12/reschedule', 'visits'],
      ['/approvals/visit/3/decision', 'visits'],
      ['/guests/me', 'visits'],
      ['/hosts', 'visits'],
      ['/availability/time_slots', 'scheduling'],
      ['/availability/rules/4', 'scheduling'],
      ['/checkin', 'checkin'],
      ['/checkin/manual', 'checkin'],
      ['/integrations/unifi/webhooks/access', 'checkin'],
      ['/credentials/visit/9', 'credentials'],
      ['/notifications', 'notifications'],
      ['/notifications/5/read', 'notifications'],
      ['/visits/12/messages', 'notifications'],
      ['/ocr/scan', 'ocr'],
      ['/auth/login', null],
      ['/internal/sso/sessions', null],
      ['/users', null],
      ['/offices', null],
      ['/departments', null],
      ['/services', null],
      ['/operations/dashboard', null],
      ['/operations/integrations', null],
      ['/license/status', null],
      ['/health', null],
      ['/metrics', null],
      ['/', null],
    ];
    for (const [path, expected] of cases) {
      expect([path, moduleForPath(normalizeLicensePath(path))]).toEqual([path, expected]);
    }
  });

  it('classifies case, slashes and percent-encoding the way Express would route them', () => {
    expect(moduleForPath(normalizeLicensePath('/Visits/'))).toBe('visits');
    expect(moduleForPath(normalizeLicensePath('//visits//1'))).toBe('visits');
    expect(moduleForPath(normalizeLicensePath('/%76isits/1'))).toBe('visits');
    expect(moduleForPath(normalizeLicensePath('/VISITS/12/Messages'))).toBe('notifications');
  });

  it('every gateable module key is reachable from at least one route', () => {
    const reachable = new Set(
      ['/visits', '/availability', '/checkin', '/credentials', '/notifications', '/ocr/scan'].map((p) => moduleForPath(p)),
    );
    for (const key of GMS_LICENSE_MODULES) expect(reachable.has(key)).toBe(true);
  });

  it('allowlist matching is exact: a look-alike path or method is not allowed', () => {
    expect(isReadOnlyAllowlisted('POST', '/auth/login')).toBe(true);
    expect(isReadOnlyAllowlisted('GET', '/auth/login')).toBe(false); // GET is safe anyway; the allowlist is for unsafe methods
    expect(isReadOnlyAllowlisted('POST', '/auth/login/extra')).toBe(false);
    expect(isReadOnlyAllowlisted('POST', '/auth/register')).toBe(false);
    expect(isReadOnlyAllowlisted('POST', '/users')).toBe(false);
    expect(isReadOnlyAllowlisted('DELETE', '/internal/sso/sessions')).toBe(true);
    expect(isReadOnlyAllowlisted('POST', '/internal/ssox')).toBe(false);
  });
});

describe('read-only guard: state expired (real app)', () => {
  it('refuses unsafe methods on writes with 403 LICENSE_EXPIRED in the usual error shape', async () => {
    setLicense('expired');
    const res = await send('post', '/users');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: 'LICENSE_EXPIRED', message: 'The licence has expired; the system is read-only. Contact your administrator.' },
    });
    expect(res.body.meta).toBeDefined();
  });

  it.each([
    ['post', '/users'],
    ['patch', '/users/1'],
    ['delete', '/users/1'],
    ['post', '/visits'],
    ['patch', '/visits/1/status'],
    ['put', '/hosts/1/services'],
    ['post', '/offices'],
    ['delete', '/departments/1'],
    ['post', '/services'],
    ['post', '/operations/bulk-import-org'],
    ['post', '/guests/bulk-import'],
    ['post', '/auth/register'],
    ['post', '/auth/verify'],
    ['post', '/auth/resend-verification'],
    ['post', '/auth/update-registration-email'],
    ['post', '/notifications/read-all'],
    ['post', '/integrations/unifi/webhooks/access'],
    ['post', '/checkin'],
  ] as const)('refuses %s %s', async (method, path) => {
    setLicense('expired');
    const res = await send(method, path);
    expect(res.status).toBe(403);
    expect(codeOf(res)).toBe('LICENSE_EXPIRED');
  });

  // One test per allowlist entry (the contract requires it). Each must get PAST the licence guard:
  // whatever else the request answers (400 validation, 401 auth, 403 csrf), it is not LICENSE_EXPIRED.
  const allowlistProbes: Array<['post' | 'get' | 'delete', string, string]> = [
    ['post', '/auth/login', 'sign-in'],
    ['post', '/auth/logout', 'sign-out'],
    ['post', '/auth/refresh', 'session refresh'],
    ['post', '/auth/verify-2fa', 'second factor'],
    ['post', '/auth/forgot-password', 'password reset request'],
    ['post', '/auth/reset-password', 'password reset'],
    ['post', '/auth/change-password', 'change own password'],
    ['post', '/auth/toggle-2fa', 'toggle own 2FA'],
    ['post', '/auth/verify-password', 'password re-confirmation'],
    ['post', '/internal/sso/sessions', 'SSO bridge session'],
    ['post', '/internal/sso/sessions/revoke', 'SSO bridge revoke'],
    ['get', '/internal/sso/offices', 'SSO bridge offices'],
    ['get', '/internal/sso/users/by-email/a%40b.co/status', 'SSO bridge status'],
    ['post', '/ocr/scan', 'OCR extraction'],
  ];

  it('the probe list covers every allowlist entry', () => {
    for (const entry of READ_ONLY_ALLOWLIST) {
      const covered = allowlistProbes.some(([method, path]) => isReadOnlyAllowlisted(method.toUpperCase(), normalizeLicensePath(path)) && entry.pattern.test(normalizeLicensePath(path)));
      expect([entry.why, covered]).toEqual([entry.why, true]);
    }
  });

  it.each(allowlistProbes)('keeps working: %s %s (%s)', async (method, path) => {
    setLicense('expired');
    const res = await send(method, path);
    expect(codeOf(res)).not.toBe('LICENSE_EXPIRED');
    expect(codeOf(res)).not.toBe('LICENSE_MODULE_DISABLED');
  });

  it('safe methods always pass, including health and the licence status route', async () => {
    setLicense('expired');
    expect((await send('get', '/health')).status).toBe(200);
    // unauthenticated: gets to requireAuth (401), not refused by the guard
    const status = await send('get', '/license/status');
    expect(status.status).toBe(401);
    expect(codeOf(status)).not.toBe('LICENSE_EXPIRED');
    const visits = await send('get', '/visits');
    expect(codeOf(visits)).not.toBe('LICENSE_EXPIRED');
    const head = await request(app).head('/api/v1/health');
    expect(head.status).toBe(200);
  });

  it('case and slash tricks do not turn a write into an allowlisted path', async () => {
    setLicense('expired');
    for (const path of ['/Users', '//users', '/users/', '/auth/Register', '/AUTH/register/']) {
      const res = await send('post', path);
      expect([path, codeOf(res)]).toEqual([path, 'LICENSE_EXPIRED']);
    }
  });
});

describe('principles 1 and 2: nothing is enforced without a verified expired token', () => {
  it.each<LicenseState>(['unconfigured', 'unknown', 'active', 'expiring', 'grace'])('state %s never blocks a write or a gated route', async (state) => {
    setLicense(state);
    for (const [method, path] of [
      ['post', '/users'],
      ['post', '/visits'],
      ['post', '/checkin'],
      ['get', '/availability/time_slots'],
      ['delete', '/offices/1'],
    ] as const) {
      const res = await send(method, path);
      expect([state, path, codeOf(res)]).not.toEqual([state, path, 'LICENSE_EXPIRED']);
      expect([state, path, codeOf(res)]).not.toEqual([state, path, 'LICENSE_MODULE_DISABLED']);
    }
  });

  it('unconfigured and unknown ignore even a module list (there is no token to carry one)', async () => {
    jest.spyOn(licenseStore, 'snapshot').mockReturnValue({ ...snapshot('unknown'), claims: claims({ modules: [] }) });
    jest.spyOn(licenseStore, 'enforcement', 'get').mockReturnValue('enforce');
    const res = await send('get', '/availability/time_slots');
    expect(codeOf(res)).not.toBe('LICENSE_MODULE_DISABLED');
  });

  it('a guard that throws lets the request through (it can never lock GMS by accident)', async () => {
    jest.spyOn(licenseStore, 'snapshot').mockImplementation(() => {
      throw new Error('boom');
    });
    const res = await send('post', '/users');
    expect(codeOf(res)).not.toBe('LICENSE_EXPIRED');
    expect(res.status).toBe(401);
  });
});

describe('module gate (real app)', () => {
  const probes: Array<[string, 'get' | 'post', string]> = [
    ['visits', 'get', '/visits'],
    ['visits', 'post', '/approvals/visit/1/decision'],
    ['visits', 'get', '/guests/me'],
    ['visits', 'get', '/hosts'],
    ['scheduling', 'get', '/availability/time_slots'],
    ['checkin', 'post', '/checkin'],
    ['checkin', 'post', '/integrations/unifi/webhooks/access'],
    ['credentials', 'get', '/credentials/visit/1'],
    ['notifications', 'get', '/notifications/vapid-public-key'],
    ['notifications', 'get', '/visits/1/messages'],
    ['ocr', 'post', '/ocr/scan'],
  ];

  it.each(probes)('a licence without %s answers 403 LICENSE_MODULE_DISABLED on %s %s', async (moduleKey, method, path) => {
    // Everything EXCEPT the module under test is enabled. (`/visits/1/messages` sits on the visits router
    // but is gated as `notifications`, so with visits enabled and notifications off it must be refused.)
    setLicense('active', { modules: GMS_LICENSE_MODULES.filter((m) => m !== moduleKey) });
    const res = await send(method, path);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false, error: { code: 'LICENSE_MODULE_DISABLED', details: { module: moduleKey } } });
  });

  it('an enabled module is not gated, and core is never gated even with an empty module list', async () => {
    setLicense('active', { modules: ['visits'] });
    expect(codeOf(await send('get', '/visits'))).not.toBe('LICENSE_MODULE_DISABLED');

    setLicense('active', { modules: [] });
    for (const [method, path] of [
      ['get', '/health'],
      ['get', '/users'],
      ['get', '/offices'],
      ['get', '/departments'],
      ['get', '/services'],
      ['get', '/operations/dashboard'],
      ['get', '/license/status'],
      ['post', '/auth/login'],
      ['post', '/internal/sso/sessions'],
    ] as const) {
      const res = await send(method, path);
      expect([path, codeOf(res)]).not.toEqual([path, 'LICENSE_MODULE_DISABLED']);
    }
  });

  it('modules null means every module is enabled', async () => {
    setLicense('active', { modules: null });
    for (const [, method, path] of probes) {
      expect(codeOf(await send(method, path))).not.toBe('LICENSE_MODULE_DISABLED');
    }
  });

  it('applies in every state except unconfigured/unknown, including expired GETs', async () => {
    setLicense('expired', { modules: [] });
    const res = await send('get', '/availability/time_slots');
    expect(res.status).toBe(403);
    expect(codeOf(res)).toBe('LICENSE_MODULE_DISABLED');
  });
});

describe('LICENSE_ENFORCEMENT modes (real app)', () => {
  it('warn computes the state but never blocks', async () => {
    setLicense('expired', { modules: [] }, 'warn');
    expect(codeOf(await send('post', '/users'))).not.toBe('LICENSE_EXPIRED');
    expect(codeOf(await send('get', '/availability/time_slots'))).not.toBe('LICENSE_MODULE_DISABLED');
  });

  it('off never blocks', async () => {
    setLicense('expired', { modules: [] }, 'off');
    expect(codeOf(await send('post', '/users'))).not.toBe('LICENSE_EXPIRED');
    expect(codeOf(await send('get', '/availability/time_slots'))).not.toBe('LICENSE_MODULE_DISABLED');
  });
});

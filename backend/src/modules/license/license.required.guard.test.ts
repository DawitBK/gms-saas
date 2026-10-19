/**
 * The entitlement gate and the install route (PLATFORM-LICENSING.md section 9), exercised through small express
 * apps wired like api/v1/index.ts (guard first, then routes) so they need neither Redis nor a database.
 * The real app is covered by a few probes at the end of license.guard.test.ts.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { logger } from '../../core/logger/logger';
import { errorHandler } from '../../shared/middleware/errorHandler';
import { LICENSE_REQUIRED_MESSAGE, createLicenseGuard } from './license.guard';
import { createInstallHandler, createInstallLimiter } from './license.install';
import { buildLicenseStatus } from './license.service';
import { LicenseStore, type LicenseStoreConfig } from './license.store';
import { TEST_SSO_URL, installFakeSso, makeTestKey, signToken, type TestKey } from '../../tests/helpers/license';

// `logger` is a Proxy that hands out fresh wrapper functions, which jest.spyOn cannot hook: replace the module.
jest.mock('../../core/logger/logger', () => {
  const fns = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), fatal: jest.fn(), trace: jest.fn() };
  return { logger: { ...fns, child: () => fns }, createLogger: () => fns };
});
const log = logger as unknown as Record<'info' | 'warn' | 'error', jest.Mock>;

const NOW = new Date('2026-10-19T12:00:00.000Z');
let dir: string;
let signer: TestKey;
let other: TestKey;

const config = (over: Partial<LicenseStoreConfig> = {}): LicenseStoreConfig => ({
  system: 'gms',
  enforcement: 'enforce',
  ssoUrl: TEST_SSO_URL,
  jwksPath: '/jwks',
  discoveryPath: '/.well-known/openid-configuration',
  publicTokenPath: '/api/v1/licenses/public/gms',
  requestTimeoutMs: 5_000,
  pollSeconds: 300,
  dataDir: dir,
  required: true,
  trustKeys: [signer.jwk],
  deployment: 'sso',
  ...over,
});
const newStore = (over: Partial<LicenseStoreConfig> = {}) => new LicenseStore(config(over), () => NOW);
const token = (payload: Record<string, unknown> = {}, key: TestKey = signer) => signToken(key, { iss: 'urn:offline-signer', ...payload });

/** Guard + install + status-like routes + a catch-all, mounted like the real `/api/v1` router. */
function appFor(store: LicenseStore, installLimiter = createInstallLimiter(1000)) {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  router.get('/health', (_req, res) => void res.json({ ok: 'health' })); // registered before the guard, like the real one
  router.use(createLicenseGuard(store));
  router.post('/license/install', installLimiter, async (req, res, next) => {
    try {
      await createInstallHandler(store)(req, res);
    } catch (err) {
      next(err);
    }
  });
  router.use((req, res) => void res.json({ ok: true, method: req.method, path: req.path }));
  app.use('/api/v1', router);
  app.use(errorHandler);
  return app;
}
const call = (app: express.Express, method: 'get' | 'post' | 'put' | 'patch' | 'delete', url: string) =>
  request(app)[method](`/api/v1${url}`).send(method === 'get' ? undefined : {});
const code = (res: request.Response): string | undefined => res.body?.error?.code;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gms-license-guard-'));
  signer = makeTestKey('signer-kid');
  other = makeTestKey('other-kid');
  installFakeSso({ keys: [] });
  for (const fn of [log.info, log.warn, log.error]) fn.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

const EXEMPT: Array<['get' | 'post', string]> = [
  ['get', '/health'],
  ['get', '/license/status'],
  ['post', '/auth/login'],
  ['post', '/auth/verify-2fa'],
  ['post', '/auth/refresh'],
  ['post', '/auth/logout'],
  ['get', '/auth/me'],
  ['post', '/internal/sso/sessions'],
  ['post', '/internal/sso/sessions/revoke'],
  ['get', '/internal/sso/offices'],
];

describe('required and unlicensed: every request but the exempt list answers 403 LICENSE_REQUIRED', () => {
  it('refuses with the usual error shape, the contract code and the reason', async () => {
    const app = appFor(newStore());
    const res = await call(app, 'get', '/users');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: 'LICENSE_REQUIRED', message: 'This system is not licensed. Contact your administrator.', details: { reason: 'NO_LICENSE' } },
    });
    expect(res.body.error.message).toBe(LICENSE_REQUIRED_MESSAGE);
    expect(res.body.meta).toBeDefined();
  });

  it.each([
    ['get', '/users'],
    ['get', '/visits'],
    ['post', '/visits'],
    ['patch', '/users/1'],
    ['delete', '/offices/1'],
    ['get', '/operations/dashboard'],
    ['get', '/availability/time_slots'],
    ['post', '/auth/register'],
    ['post', '/auth/forgot-password'],
    ['get', '/guests/me'],
    ['post', '/checkin'],
    ['post', '/integrations/unifi/webhooks/access'],
  ] as const)('refuses %s %s', async (method, url) => {
    const res = await call(appFor(newStore()), method, url);
    expect([url, res.status, code(res)]).toEqual([url, 403, 'LICENSE_REQUIRED']);
  });

  it.each(EXEMPT)('keeps working: %s %s', async (method, url) => {
    const res = await call(appFor(newStore()), method, url);
    expect([url, res.status, code(res)]).toEqual([url, 200, undefined]);
  });

  it('keeps the install route reachable without any sign-in', async () => {
    const res = await call(appFor(newStore()), 'post', '/license/install');
    expect(res.status).toBe(400); // got to the handler (no token in the body), was not LICENSE_REQUIRED
    expect(code(res)).toBe('INVALID_INPUT');
  });

  it('case, slash and percent-encoding tricks do not turn a refused path into an exempt one', async () => {
    const app = appFor(newStore());
    for (const url of ['/Users', '//users', '/users/', '/auth/Register', '/%75sers']) {
      expect([url, code(await call(app, 'get', url))]).toEqual([url, 'LICENSE_REQUIRED']);
    }
    // ...and an exempt path stays exempt however it is spelled
    for (const url of ['/AUTH/Login', '//auth//login/', '/auth/%6Cogin']) {
      expect([url, code(await call(app, 'post', url))]).toEqual([url, undefined]);
    }
  });

  it('installing a valid token restores service within the very next request', async () => {
    const store = newStore();
    const app = appFor(store);
    expect(code(await call(app, 'get', '/users'))).toBe('LICENSE_REQUIRED');

    const install = await request(app).post('/api/v1/license/install').send({ token: token({ ver: 1 }) });
    expect(install.status).toBe(200);
    expect(install.body.data).toMatchObject({ installed: true, outcome: 'installed', version: 1, state: 'active', licensed: true, reason: null });

    const after = await call(app, 'get', '/users');
    expect(after.status).toBe(200);
    expect(after.body).toMatchObject({ ok: true });
    expect((await call(app, 'post', '/visits')).status).toBe(200);
  });

  it('MODE_NOT_LICENSED: a token that does not cover this deployment gives the same refusal with that reason', async () => {
    const store = newStore({ deployment: 'standalone' });
    await store.install(token({ modes: ['sso'] }));
    const app = appFor(store);
    const res = await call(app, 'get', '/users');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({ code: 'LICENSE_REQUIRED', details: { reason: 'MODE_NOT_LICENSED' } });
    expect((await call(app, 'post', '/auth/login')).status).toBe(200); // sign-in still exempt

    await store.install(token({ modes: ['standalone'], ver: 2 }));
    expect((await call(app, 'get', '/users')).status).toBe(200);
  });

  it('a licensed system is still subject to the expiry and module rules (read-only, never a deletion)', async () => {
    const store = newStore();
    await store.install(token({ expiresAt: '2020-01-01T00:00:00.000Z', graceDays: 0, modules: ['visits'] }));
    const app = appFor(store);
    expect(code(await call(app, 'post', '/users'))).toBe('LICENSE_EXPIRED');
    expect(code(await call(app, 'get', '/availability/time_slots'))).toBe('LICENSE_MODULE_DISABLED');
    expect((await call(app, 'get', '/users')).status).toBe(200);
  });
});

describe('LICENSE_ENFORCEMENT is the emergency brake while required', () => {
  it('warn: nothing is refused; what would have been is logged', async () => {
    const app = appFor(newStore({ enforcement: 'warn' }));
    const res = await call(app, 'get', '/users');
    expect(res.status).toBe(200);
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ module: 'license', kind: 'required:NO_LICENSE' }),
      expect.stringContaining('would have been refused'),
    );
  });

  it('off: does nothing at all', async () => {
    const app = appFor(newStore({ enforcement: 'off' }));
    expect((await call(app, 'get', '/users')).status).toBe(200);
    expect((await call(app, 'post', '/visits')).status).toBe(200);
    expect(log.warn).not.toHaveBeenCalled();
  });
});

describe('not required: today\'s behaviour, byte for byte', () => {
  it('an installation with nothing installed refuses nothing', async () => {
    const app = appFor(newStore({ required: false }));
    for (const [method, url] of [['get', '/users'], ['post', '/visits'], ['delete', '/offices/1']] as const) {
      expect((await call(app, method, url)).status).toBe(200);
    }
  });

  it('a token that does not cover the deployment still refuses nothing', async () => {
    const store = newStore({ required: false, deployment: 'standalone' });
    await store.install(token({ modes: ['sso'] }));
    expect((await call(appFor(store), 'get', '/users')).status).toBe(200);
  });
});

describe('a failure inside the guard lets the request through and logs at error level', () => {
  it('snapshot() throwing while required', async () => {
    const store = newStore();
    jest.spyOn(store, 'snapshot').mockImplementation(() => {
      throw new Error('boom');
    });
    const res = await call(appFor(store), 'post', '/users');
    expect(res.status).toBe(200);
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ module: 'license' }), expect.stringContaining('letting the request through'));
  });

  it('reading the required flag throwing', async () => {
    const store = newStore();
    jest.spyOn(store, 'required', 'get').mockImplementation(() => {
      throw new Error('boom');
    });
    expect((await call(appFor(store), 'get', '/users')).status).toBe(200);
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ module: 'license' }), expect.stringContaining('letting the request through'));
  });
});

describe('POST /license/install over HTTP', () => {
  const post = (app: express.Express, body: unknown) => request(app).post('/api/v1/license/install').send(body as object);

  it('installs a valid token (no Authorization header) and reports the state', async () => {
    const store = newStore();
    const res = await post(appFor(store), { token: token({ ver: 7 }) });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { installed: true, version: 7, licensed: true } });
    expect(store.snapshot().claims?.ver).toBe(7);
  });

  it('rejects a bad signature with 400 INVALID_INPUT and the reason, installing nothing', async () => {
    const store = newStore();
    const forged = signToken({ ...other, kid: signer.kid }, { iss: 'urn:offline-signer' });
    const res = await post(appFor(store), { token: forged });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, error: { code: 'INVALID_INPUT', details: { reason: 'bad_signature' } } });
    expect(store.snapshot().state).toBe('unknown');
  });

  it('rejects an untrusted key and a token for another system', async () => {
    const store = newStore();
    expect((await post(appFor(store), { token: token({}, other) })).status).toBe(400);
    const wrongSystem = await post(appFor(store), { token: token({ aud: 'license:dms', sys: 'dms' }) });
    expect(wrongSystem.status).toBe(400);
    expect(store.snapshot().state).toBe('unknown');
  });

  it('a lower ver is ignored: 200, installed false, the held version kept', async () => {
    const store = newStore();
    const app = appFor(store);
    await post(app, { token: token({ ver: 9 }) });
    const res = await post(app, { token: token({ ver: 4 }) });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ installed: false, outcome: 'ignored_older', version: 9 });
    expect(store.snapshot().claims?.ver).toBe(9);
  });

  it.each([
    ['no body', undefined],
    ['no token', {}],
    ['an empty token', { token: '   ' }],
    ['a non-string token', { token: 123 }],
    ['an object token', { token: { a: 1 } }],
    ['a token over 16 KiB', { token: 'a'.repeat(16_385) }],
  ])('400 INVALID_INPUT for %s', async (_label, body) => {
    const res = await post(appFor(newStore()), body);
    expect(res.status).toBe(400);
    expect(code(res)).toBe('INVALID_INPUT');
  });

  it('is rate-limited per address: the attempt over the limit answers 429', async () => {
    const app = appFor(newStore(), createInstallLimiter(3, 60_000));
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) statuses.push((await post(app, { token: 'garbage' })).status);
    expect(statuses).toEqual([400, 400, 400, 429, 429]);
    const limited = await post(app, { token: token() });
    expect(limited.status).toBe(429);
    expect(code(limited)).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('answers 503 when verification needs SSO and SSO cannot be reached', async () => {
    installFakeSso({ keys: [], jwksStatus: 503 });
    const store = newStore({ required: false, trustKeys: [] });
    const res = await post(appFor(store), { token: signToken(signer, { iss: 'http://sso.test' }) });
    expect(res.status).toBe(503);
    expect(code(res)).toBe('SYSTEM_SERVICE_UNAVAILABLE');
  });
});

describe('GET /license/status payload (buildLicenseStatus)', () => {
  const noSeats = async () => 0;

  it('carries required, licensed, reason and deployment; unlicensed means NO_LICENSE', async () => {
    const dto = await buildLicenseStatus(newStore({ deployment: 'standalone' }), noSeats);
    expect(dto).toMatchObject({ required: true, licensed: false, reason: 'NO_LICENSE', deployment: 'standalone', state: 'unknown' });
  });

  it('MODE_NOT_LICENSED, then licensed once a token covers the deployment', async () => {
    const store = newStore({ deployment: 'standalone' });
    await store.install(token({ modes: ['sso'] }));
    expect(await buildLicenseStatus(store, noSeats)).toMatchObject({ required: true, licensed: false, reason: 'MODE_NOT_LICENSED', state: 'active' });
    await store.install(token({ modes: ['standalone'], ver: 2 }));
    expect(await buildLicenseStatus(store, noSeats)).toMatchObject({ required: true, licensed: true, reason: null, deployment: 'standalone' });
  });

  it('not required: licensed is true whatever is held, required is false', async () => {
    const dto = await buildLicenseStatus(newStore({ required: false }), noSeats);
    expect(dto).toMatchObject({ required: false, licensed: true, reason: null, deployment: 'sso', state: 'unknown' });
  });

  it('keeps every field it had before', async () => {
    const store = newStore();
    await store.install(token({ ver: 3, maxUsers: 5, modules: ['visits'] }));
    expect(await buildLicenseStatus(store, async () => 2)).toMatchObject({
      system: 'gms',
      state: 'active',
      customer: 'Example Corp',
      maxUsers: 5,
      seatsUsed: 2,
      modules: ['visits'],
      source: 'cache',
      version: 3,
      enforcement: 'enforce',
      readOnly: false,
    });
  });
});

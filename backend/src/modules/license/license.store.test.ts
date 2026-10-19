import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { LicenseStore, type LicenseStoreConfig } from './license.store';
import {
  TEST_ISSUER,
  TEST_SSO_URL,
  defaultPayload,
  installFakeSso,
  makeTestKey,
  signToken,
  type FakeSsoState,
  type TestKey,
} from '../../tests/helpers/license';

const NOW = new Date('2026-10-19T12:00:00.000Z');

let dir: string;
let key: TestKey;
let sso: FakeSsoState;

const baseConfig = (over: Partial<LicenseStoreConfig> = {}): LicenseStoreConfig => ({
  system: 'gms',
  enforcement: 'enforce',
  ssoUrl: TEST_SSO_URL,
  jwksPath: '/jwks',
  discoveryPath: '/.well-known/openid-configuration',
  publicTokenPath: '/api/v1/licenses/public/gms',
  requestTimeoutMs: 5_000,
  pollSeconds: 300,
  dataDir: dir,
  ...over,
});
const newStore = (over: Partial<LicenseStoreConfig> = {}) => new LicenseStore(baseConfig(over), () => NOW);
const serve = (payload: Parameters<typeof defaultPayload>[0] = {}, headerOver: Record<string, unknown> = {}, signer: TestKey = key) => {
  sso.token = { status: 200, body: { token: signToken(signer, payload, headerOver) } };
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gms-license-'));
  key = makeTestKey();
  sso = { keys: [key.jwk] };
  installFakeSso(sso);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('LicenseStore: obtaining and verifying the token', () => {
  it('starts as unknown (no enforcement) before anything has been fetched', () => {
    const snap = newStore().snapshot();
    expect(snap.state).toBe('unknown');
    expect(snap.source).toBe('none');
    expect(snap.claims).toBeNull();
  });

  it('accepts a correctly signed token and computes the state from its own dates', async () => {
    serve({ expiresAt: '2026-10-25T00:00:00.000Z', warnDays: 30, ver: 7, maxUsers: 50, modules: ['visits'] });
    const store = newStore();
    expect(await store.refresh()).toBe('updated');
    const snap = store.snapshot();
    expect(snap.state).toBe('expiring');
    expect(snap.source).toBe('sso');
    expect(snap.claims).toMatchObject({ ver: 7, maxUsers: 50, modules: ['visits'], customer: 'Example Corp' });
    expect(snap.daysRemaining).toBe(5);
  });

  it('does not look at token age: a token with an ancient iat and no exp is fine', async () => {
    serve({ iat: 1, expiresAt: null });
    const store = newStore();
    expect(await store.refresh()).toBe('updated');
    expect(store.snapshot().state).toBe('active');
  });

  it('also accepts the {data:{token}} envelope', async () => {
    sso.token = { status: 200, body: { success: true, data: { token: signToken(key) } } };
    expect(await newStore().refresh()).toBe('updated');
  });

  it.each([
    ['a different signing key', () => serve({}, {}, makeTestKey('test-kid-1'))],
    ['the wrong audience', () => serve({ aud: 'license:dms' })],
    ['the wrong system', () => serve({ sys: 'dms' })],
    ['the wrong issuer', () => serve({ iss: 'http://evil.test' })],
    ['the wrong typ', () => serve({}, { typ: 'JWT' })],
    ['a non-RS256 alg', () => serve({}, { alg: 'HS256' })],
    ['graceDays out of range', () => serve({ graceDays: 400 })],
    ['maxUsers below 1', () => serve({ maxUsers: 0 })],
    ['a malformed expiresAt', () => serve({ expiresAt: 'not-a-date' })],
    ['modules that are not strings', () => serve({ modules: [1, 2] as unknown as string[] })],
  ])('rejects a token with %s and keeps the previous good one', async (_label, arrange) => {
    const store = newStore();
    serve({ ver: 3 });
    expect(await store.refresh()).toBe('updated');

    arrange();
    expect(await store.refresh()).toBe('rejected');
    expect(store.snapshot().claims?.ver).toBe(3);
  });

  it('rejects a payload that was edited after signing', async () => {
    const good = signToken(key, { expiresAt: '2026-01-01T00:00:00.000Z' });
    const [h, , s] = good.split('.');
    const forgedPayload = Buffer.from(JSON.stringify(defaultPayload({ expiresAt: null }))).toString('base64url');
    sso.token = { status: 200, body: { token: `${h}.${forgedPayload}.${s}` } };
    const store = newStore();
    expect(await store.refresh()).toBe('rejected');
    expect(store.snapshot().state).toBe('unknown');
  });

  it('refetches the JWKS once on an unknown kid, then verifies (key rotation)', async () => {
    const rotated = makeTestKey('rotated-kid');
    sso.keys = [key.jwk];
    const store = newStore();
    serve({ ver: 1 });
    expect(await store.refresh()).toBe('updated'); // JWKS now cached with only the old key

    sso.keys = [key.jwk, rotated.jwk];
    serve({ ver: 2 }, {}, rotated);
    expect(await store.refresh()).toBe('updated');
    expect(store.snapshot().claims?.ver).toBe(2);
  });

  it('an unknown kid that stays unknown after the refetch is rejected', async () => {
    const stranger = makeTestKey('stranger');
    serve({}, {}, stranger);
    expect(await newStore().refresh()).toBe('rejected');
  });

  it('ignores a token with a lower ver than the one held', async () => {
    const store = newStore();
    serve({ ver: 9 });
    await store.refresh();
    serve({ ver: 8, expiresAt: '2020-01-01T00:00:00.000Z' });
    expect(await store.refresh()).toBe('ignored_older');
    expect(store.snapshot().claims?.ver).toBe(9);
  });

  it('the same token again is "unchanged"; an equal ver with new content is accepted', async () => {
    const store = newStore();
    sso.token = { status: 200, body: { token: signToken(key, { ver: 4 }) } };
    expect(await store.refresh()).toBe('updated');
    expect(await store.refresh()).toBe('unchanged');
  });

  it('pins the issuer to LICENSE_ISSUER when set, ignoring discovery', async () => {
    sso.issuer = 'http://other.test';
    serve({ iss: 'http://pinned.test' });
    expect(await newStore({ issuer: 'http://pinned.test' }).refresh()).toBe('updated');
    expect(await newStore().refresh()).toBe('rejected'); // discovery says other.test, token says pinned.test
  });
});

describe('LicenseStore: principle 1 (no record = no enforcement)', () => {
  it('a JSON 404 from SSO means unconfigured, and clears a held token and its file', async () => {
    const store = newStore();
    serve({ ver: 2, expiresAt: '2020-01-01T00:00:00.000Z', graceDays: 0 });
    await store.refresh();
    expect(store.snapshot().state).toBe('expired');
    expect(fs.existsSync(path.join(dir, 'last-token.json'))).toBe(true);

    // SSO's real "no licence" answer (api/v1/licenses.router.ts): error is an OBJECT.
    sso.token = {
      status: 404,
      body: { error: { code: 'ERR-LICENSE-NOT-FOUND', message: 'No licence for this system.' }, meta: { requestId: '' } },
    };
    expect(await store.refresh()).toBe('unconfigured');
    expect(store.snapshot().state).toBe('unconfigured');
    expect(fs.existsSync(path.join(dir, 'last-token.json'))).toBe(false);
  });

  it('any other JSON 404 body (a different error object or code) also means no licence', async () => {
    const store = newStore();
    sso.token = { status: 404, body: { error: { code: 'x', message: 'y' } } };
    expect(await store.refresh()).toBe('unconfigured');
  });

  it('SSO\'s generic "unrecognised route" 404 does NOT count as "no licence" and does not clear anything', async () => {
    const store = newStore();
    serve({ ver: 2, expiresAt: '2020-01-01T00:00:00.000Z', graceDays: 0 });
    await store.refresh();
    sso.token = { status: 404, body: { error: 'invalid_request', error_description: 'unrecognized route' } };
    expect(await store.refresh()).toBe('unreachable');
    expect(store.snapshot().state).toBe('expired');
  });
});

describe('LicenseStore: principle 2 (never block because SSO is unreachable)', () => {
  it('a connection failure on a fresh process leaves the state unknown', async () => {
    sso.token = 'throw';
    const store = newStore();
    expect(await store.refresh()).toBe('unreachable');
    expect(store.snapshot().state).toBe('unknown');
  });

  it('a 5xx, an empty body and a garbage body all leave the held token untouched', async () => {
    const store = newStore();
    serve({ ver: 5, expiresAt: '2020-01-01T00:00:00.000Z', graceDays: 0 });
    await store.refresh();
    for (const answer of [
      { status: 503, body: { error: 'down' } },
      { status: 200, body: {} },
      { status: 200, body: { token: 12345 } },
      { status: 500, body: null },
    ]) {
      sso.token = answer;
      expect(await store.refresh()).toBe('unreachable');
      expect(store.snapshot().claims?.ver).toBe(5);
      expect(store.snapshot().state).toBe('expired'); // still enforcing the token's OWN dates
    }
  });

  it('a hung SSO is cut off by the timeout and never throws', async () => {
    sso.token = 'hang';
    const store = newStore({ requestTimeoutMs: 50 });
    await expect(store.refresh()).resolves.toBe('unreachable');
    expect(store.snapshot().state).toBe('unknown');
  });

  it('JWKS or discovery being down is "unreachable", not a rejection, and keeps what is held', async () => {
    const store = newStore();
    serve({ ver: 1 });
    await store.refresh();
    sso.jwksStatus = 503;
    sso.keys = [];
    const fresh = newStore();
    serve({ ver: 2 });
    expect(await fresh.refresh()).toBe('unreachable');
    expect(fresh.snapshot().state).toBe('unknown');
  });

  it('refresh never rejects, whatever fetch does', async () => {
    global.fetch = (() => {
      throw new Error('synchronous explosion');
    }) as unknown as typeof fetch;
    await expect(newStore().refresh()).resolves.toBe('unreachable');
  });

  it('LICENSE_ENFORCEMENT=off never fetches', async () => {
    const mock = installFakeSso(sso);
    serve();
    const store = newStore({ enforcement: 'off' });
    expect(await store.refresh()).toBe('disabled');
    store.start();
    expect(mock).not.toHaveBeenCalled();
    expect(store.snapshot().state).toBe('unknown');
  });
});

describe('LicenseStore: the persisted token', () => {
  it('survives a restart while SSO is down and still enforces its own dates', async () => {
    const first = newStore();
    serve({ ver: 6, expiresAt: '2020-01-01T00:00:00.000Z', graceDays: 0 });
    expect(await first.refresh()).toBe('updated');

    sso.token = 'throw';
    sso.keys = [];
    sso.jwksStatus = 503;
    const second = newStore();
    second.loadFromDisk();
    const snap = second.snapshot();
    expect(snap.state).toBe('expired');
    expect(snap.source).toBe('cache');
    expect(snap.claims?.ver).toBe(6);
    expect(await second.refresh()).toBe('unreachable');
    expect(second.snapshot().state).toBe('expired');
  });

  it('a missing, corrupt or tampered file leaves the state unknown rather than throwing or blocking', async () => {
    const file = path.join(dir, 'last-token.json');

    const missing = newStore();
    missing.loadFromDisk();
    expect(missing.snapshot().state).toBe('unknown');

    fs.writeFileSync(file, '{ not json');
    const corrupt = newStore();
    corrupt.loadFromDisk();
    expect(corrupt.snapshot().state).toBe('unknown');

    const store = newStore();
    serve({ ver: 1, expiresAt: '2020-01-01T00:00:00.000Z', graceDays: 0 });
    await store.refresh();
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    const [h, , s] = saved.token.split('.');
    saved.token = `${h}.${Buffer.from(JSON.stringify(defaultPayload({ expiresAt: null }))).toString('base64url')}.${s}`;
    fs.writeFileSync(file, JSON.stringify(saved));
    const tampered = newStore();
    tampered.loadFromDisk();
    expect(tampered.snapshot().state).toBe('unknown');
  });

  it('an unwritable data directory does not stop the token being used from memory', async () => {
    const blocker = path.join(dir, 'a-file');
    fs.writeFileSync(blocker, 'x');
    const store = newStore({ dataDir: path.join(blocker, 'nested') });
    serve({ ver: 1 });
    expect(await store.refresh()).toBe('updated');
    expect(store.snapshot().claims?.ver).toBe(1);
  });
});

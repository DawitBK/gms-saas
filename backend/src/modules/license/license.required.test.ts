/**
 * Per-application entitlement in the store (PLATFORM-LICENSING.md section 9): pinned trust keys, the install
 * channel, the new claims, and SSO's 404 dropping a held token only where a licence is required.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { LicenseStore, type LicenseStoreConfig } from './license.store';
import {
  TEST_SSO_URL,
  defaultPayload,
  installFakeSso,
  makeTestKey,
  signToken,
  type FakeSsoState,
  type TestKey,
} from '../../tests/helpers/license';

const NOW = new Date('2026-10-19T12:00:00.000Z');
/** An issuer SSO's discovery document never reports: proves the pinned path does not check `iss`. */
const OFFLINE_ISSUER = 'urn:offline-signer';

let dir: string;
let signer: TestKey; // the key the owner signs with (and pins)
let other: TestKey; // a key nobody trusts
let sso: FakeSsoState;
let fetchMock: ReturnType<typeof installFakeSso>;

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
const token = (payload: Parameters<typeof defaultPayload>[0] = {}, headerOver: Record<string, unknown> = {}, key: TestKey = signer) =>
  signToken(key, { iss: OFFLINE_ISSUER, ...payload }, headerOver);
const serve = (payload: Parameters<typeof defaultPayload>[0] = {}, key: TestKey = signer) => {
  sso.token = { status: 200, body: { token: token(payload, {}, key) } };
};
const fetchedUrls = () => fetchMock.mock.calls.map((call) => String(call[0]));

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gms-license-required-'));
  signer = makeTestKey('signer-kid');
  other = makeTestKey('other-kid');
  // SSO serves the OTHER key and the signer's token: a fake SSO (or a compromised path to it) cannot mint a licence.
  sso = { keys: [other.jwk, signer.jwk], issuer: 'http://sso.test' };
  fetchMock = installFakeSso(sso);
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('pinned trust keys (LICENSE_TRUST_PUBLIC_KEYS)', () => {
  it('a token signed by a pinned key verifies, with no SSO discovery or JWKS call and no issuer check', async () => {
    serve({ ver: 3 });
    const store = newStore();
    expect(await store.refresh()).toBe('updated');
    expect(store.snapshot().state).toBe('active');
    expect(store.snapshot().claims?.iss).toBe(OFFLINE_ISSUER);
    expect(store.entitlement()).toEqual({ licensed: true, reason: null });
    expect(fetchedUrls()).toEqual([`${TEST_SSO_URL}/api/v1/licenses/public/gms`]);
  });

  it('a token signed by a key that is not pinned is rejected, even when SSO publishes that key in its JWKS', async () => {
    sso.keys = [other.jwk];
    serve({}, other);
    const store = newStore(); // pins signer only
    expect(await store.refresh()).toBe('rejected');
    expect(store.snapshot().state).toBe('unknown');
    expect(store.entitlement()).toEqual({ licensed: false, reason: 'NO_LICENSE' });
    expect(fetchedUrls().some((url) => url.endsWith('/jwks') || url.includes('openid-configuration'))).toBe(false);
  });

  it('SSO\'s JWKS is NOT used when required: a token only the JWKS vouches for does not verify', async () => {
    const jwksOnly = makeTestKey('jwks-only');
    sso.keys = [jwksOnly.jwk, signer.jwk];
    serve({}, jwksOnly);
    const store = newStore();
    expect(await store.refresh()).toBe('rejected');
    expect(store.snapshot().claims).toBeNull();
    expect((await store.install(token({}, {}, jwksOnly))).outcome).toBe('rejected');
  });

  it('required with no key configured: nothing can verify, so the system is unlicensed', async () => {
    serve();
    const store = newStore({ trustKeys: [] });
    expect(await store.refresh()).toBe('rejected');
    expect(await store.install(token())).toEqual({ outcome: 'rejected', reason: 'unknown_kid' });
    expect(store.entitlement()).toEqual({ licensed: false, reason: 'NO_LICENSE' });
  });

  it('a pinned key still checks aud, sys and typ', async () => {
    for (const bad of [{ aud: 'license:dms' }, { sys: 'dms' }]) {
      expect((await newStore().install(token(bad))).outcome).toBe('rejected');
    }
    expect((await newStore().install(token({}, { typ: 'JWT' }))).outcome).toBe('rejected');
  });

  it('not required, variable set: the pinned keys are used instead of SSO\'s JWKS', async () => {
    const store = newStore({ required: false });
    serve({}, other); // SSO's JWKS vouches for `other`, the pinned list does not
    expect(await store.refresh()).toBe('rejected');
    serve({ ver: 2 });
    expect(await store.refresh()).toBe('updated');
    expect(fetchedUrls().some((url) => url.endsWith('/jwks'))).toBe(false);
  });

  it('not required, variable unset: today\'s JWKS behaviour (issuer from discovery, keys from the JWKS)', async () => {
    const store = newStore({ required: false, trustKeys: [] });
    serve({ iss: OFFLINE_ISSUER });
    expect(await store.refresh()).toBe('rejected'); // discovery says http://sso.test
    serve({ iss: 'http://sso.test', ver: 2 });
    expect(await store.refresh()).toBe('updated');
    expect(fetchedUrls().some((url) => url.endsWith('/jwks'))).toBe(true);
  });
});

describe('the new claims: modes and jti', () => {
  it.each([
    ['absent', undefined, ['sso']],
    ['null', null, ['sso']],
    ['empty', [], ['sso']],
    ['sso', ['sso'], ['sso']],
    ['standalone', ['standalone'], ['standalone']],
    ['both, duplicates dropped', ['sso', 'standalone', 'sso'], ['sso', 'standalone']],
  ])('modes %s reads as %j', async (_label, modes, expected) => {
    const store = newStore();
    const result = await store.install(token(modes === undefined ? {} : { modes }));
    expect(result.outcome).toBe('installed');
    expect(store.snapshot().claims?.modes).toEqual(expected);
  });

  it.each([
    ['an unknown mode', ['cloud']],
    ['a non-array', 'sso'],
    ['a non-string entry', [1]],
  ])('refuses %s', async (_label, modes) => {
    expect((await newStore().install(token({ modes }))).outcome).toBe('rejected');
  });

  it('keeps jti for audit and refuses a non-string one', async () => {
    const store = newStore();
    await store.install(token({ jti: 'tok-123' }));
    expect(store.snapshot().claims?.jti).toBe('tok-123');
    const none = newStore();
    await none.install(token());
    expect(none.snapshot().claims?.jti).toBeNull();
    expect((await newStore().install(token({ jti: 7 }))).outcome).toBe('rejected');
  });

  it('the deployment decides: a standalone installation needs a token that lists standalone', async () => {
    const standalone = newStore({ deployment: 'standalone' });
    await standalone.install(token({ modes: ['sso'] }));
    expect(standalone.entitlement()).toEqual({ licensed: false, reason: 'MODE_NOT_LICENSED' });
    await standalone.install(token({ modes: ['standalone'], ver: 2 }));
    expect(standalone.entitlement()).toEqual({ licensed: true, reason: null });
  });
});

describe('POST /license/install (store.install)', () => {
  it('installs a valid token, persists it, and a restart still holds it', async () => {
    const first = newStore();
    expect(await first.install(token({ ver: 5, customer: 'Example Corp' }))).toEqual({ outcome: 'installed', version: 5 });
    expect(first.snapshot()).toMatchObject({ state: 'active', source: 'cache' });
    expect(fs.existsSync(path.join(dir, 'last-token.json'))).toBe(true);

    sso.token = 'throw'; // SSO down on restart
    const second = newStore();
    second.loadFromDisk();
    expect(second.snapshot().claims?.ver).toBe(5);
    expect(second.entitlement()).toEqual({ licensed: true, reason: null });
  });

  it('the same token again is unchanged', async () => {
    const store = newStore();
    const t = token({ ver: 2 });
    expect((await store.install(t)).outcome).toBe('installed');
    expect(await store.install(t)).toEqual({ outcome: 'unchanged', version: 2 });
  });

  it('a lower ver never replaces the held one (no replay of a revoked or older licence)', async () => {
    const store = newStore();
    await store.install(token({ ver: 9 }));
    expect(await store.install(token({ ver: 8, expiresAt: '2020-01-01T00:00:00.000Z' }))).toEqual({ outcome: 'ignored_older', version: 9 });
    expect(store.snapshot().claims?.ver).toBe(9);
    expect((await store.install(token({ ver: 10 }))).outcome).toBe('installed');
  });

  it('rejects a bad signature, a tampered payload and a malformed token, keeping what is held', async () => {
    const store = newStore();
    await store.install(token({ ver: 4 }));

    expect(await store.install(token({ ver: 6 }, {}, other))).toEqual({ outcome: 'rejected', reason: 'unknown_kid' });
    const forgedSameKid = signToken({ ...other, kid: signer.kid }, { iss: OFFLINE_ISSUER, ver: 7 });
    expect(await store.install(forgedSameKid)).toEqual({ outcome: 'rejected', reason: 'bad_signature' });
    const [h, , s] = token({ ver: 4 }).split('.');
    const tampered = `${h}.${Buffer.from(JSON.stringify(defaultPayload({ ver: 99, iss: OFFLINE_ISSUER }))).toString('base64url')}.${s}`;
    expect(await store.install(tampered)).toEqual({ outcome: 'rejected', reason: 'bad_signature' });
    expect((await store.install('not-a-jws')).outcome).toBe('rejected');
    expect(store.snapshot().claims?.ver).toBe(4);
  });

  it('a token for another system is rejected', async () => {
    const store = newStore();
    expect((await store.install(token({ aud: 'license:dms', sys: 'dms' }))).outcome).toBe('rejected');
    expect(store.snapshot().state).toBe('unknown');
  });

  it('answers unavailable (not rejected) when verification needs SSO and SSO cannot be reached', async () => {
    sso.jwksStatus = 503;
    const store = newStore({ required: false, trustKeys: [] });
    expect(await store.install(signToken(signer, { iss: 'http://sso.test' }))).toEqual({ outcome: 'unavailable' });
    expect(store.snapshot().state).toBe('unknown');
  });

  it('a poll never lowers an installed ver, and an install beats an older polled token', async () => {
    const store = newStore();
    await store.install(token({ ver: 9 }));
    serve({ ver: 3 });
    expect(await store.refresh()).toBe('ignored_older');
    expect(store.snapshot().claims?.ver).toBe(9);
    serve({ ver: 12 });
    expect(await store.refresh()).toBe('updated');
    expect(store.snapshot()).toMatchObject({ source: 'sso' });
  });
});

describe('the persisted token under pinned keys', () => {
  it('is verified against the pinned keys only: another key set, or its own key snapshot, is not trusted', async () => {
    const first = newStore();
    await first.install(token({ ver: 2 }));

    const rotated = newStore({ trustKeys: [other.jwk] });
    rotated.loadFromDisk();
    expect(rotated.snapshot().state).toBe('unknown');

    // a file written while licensing was not required (JWKS era, key snapshot inside) is not enough once required
    const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gms-license-legacy-'));
    try {
      const jwksEra = new LicenseStore(config({ required: false, trustKeys: [], dataDir: legacyDir }), () => NOW);
      sso.keys = [signer.jwk];
      sso.token = { status: 200, body: { token: signToken(signer, { iss: 'http://sso.test', ver: 3 }) } };
      expect(await jwksEra.refresh()).toBe('updated');
      const nowRequired = new LicenseStore(config({ trustKeys: [other.jwk], dataDir: legacyDir }), () => NOW);
      nowRequired.loadFromDisk();
      expect(nowRequired.snapshot().state).toBe('unknown');
      expect(nowRequired.entitlement()).toEqual({ licensed: false, reason: 'NO_LICENSE' });
    } finally {
      fs.rmSync(legacyDir, { recursive: true, force: true });
    }
  });
});

describe('SSO answering 404 for a system that held a token', () => {
  const noRecord = { status: 404, body: { error: { code: 'ERR-LICENSE-NOT-FOUND', message: 'No licence for this system.' }, meta: {} } };

  it('required: a token SSO served is dropped, its file removed, and the system becomes unlicensed', async () => {
    const store = newStore();
    serve({ ver: 5 });
    expect(await store.refresh()).toBe('updated');
    expect(store.entitlement().licensed).toBe(true);
    expect(fs.existsSync(path.join(dir, 'last-token.json'))).toBe(true);

    sso.token = noRecord;
    expect(await store.refresh()).toBe('unconfigured');
    expect(store.snapshot().claims).toBeNull();
    expect(store.entitlement()).toEqual({ licensed: false, reason: 'NO_LICENSE' });
    expect(fs.existsSync(path.join(dir, 'last-token.json'))).toBe(false);
  });

  it('required: a 404 for a system that never held a token leaves it unlicensed', async () => {
    const store = newStore();
    sso.token = noRecord;
    expect(await store.refresh()).toBe('unconfigured');
    expect(store.entitlement()).toEqual({ licensed: false, reason: 'NO_LICENSE' });
  });

  it('required: SSO\'s generic "unrecognised route" 404 still drops nothing', async () => {
    const store = newStore();
    await store.install(token({ ver: 5 }));
    sso.token = { status: 404, body: { error: 'invalid_request', error_description: 'unrecognized route' } };
    expect(await store.refresh()).toBe('unreachable');
    expect(store.entitlement().licensed).toBe(true);
  });

  it('required: a timeout, a 5xx and a network error never drop anything', async () => {
    const store = newStore();
    await store.install(token({ ver: 5 }));
    for (const answer of ['throw', { status: 503, body: { error: 'down' } }, { status: 500, body: null }] as const) {
      sso.token = answer;
      expect(await store.refresh()).toBe('unreachable');
      expect(store.snapshot().claims?.ver).toBe(5);
      expect(store.entitlement().licensed).toBe(true);
    }
    sso.token = 'hang';
    const quick = newStore({ requestTimeoutMs: 50 });
    await quick.install(token({ ver: 5 }));
    expect(await quick.refresh()).toBe('unreachable');
    expect(quick.entitlement().licensed).toBe(true);
  });

  it('not required: the 404 is the existing "no record" answer: unconfigured, nothing enforced, entitled', async () => {
    const store = newStore({ required: false });
    serve({ ver: 5, expiresAt: '2020-01-01T00:00:00.000Z', graceDays: 0 });
    await store.refresh();
    expect(store.snapshot().state).toBe('expired');
    sso.token = noRecord;
    expect(await store.refresh()).toBe('unconfigured');
    expect(store.snapshot().state).toBe('unconfigured');
    expect(store.entitlement()).toEqual({ licensed: true, reason: null }); // not required: always licensed
  });
});

describe('origin: only a token SSO served can be dropped by a 404 from SSO', () => {
  const noRecord = { status: 404, body: { error: { code: 'ERR-LICENSE-NOT-FOUND', message: 'No licence for this system.' }, meta: {} } };
  const file = () => path.join(dir, 'last-token.json');

  it.each([true, false])('an installed (offline-signed) token survives a 404 poll, required=%s', async (required) => {
    const store = newStore({ required });
    await store.install(token({ ver: 5 }));
    sso.token = noRecord;
    for (let i = 0; i < 3; i += 1) {
      expect(await store.refresh()).toBe('unchanged');
      expect(store.snapshot().claims?.ver).toBe(5);
      expect(store.entitlement().licensed).toBe(true);
    }
    expect(fs.existsSync(file())).toBe(true);
  });

  it('a token SSO served is dropped by a later 404 (both modes)', async () => {
    for (const required of [true, false]) {
      const store = newStore({ required });
      serve({ ver: 5 });
      await store.refresh();
      sso.token = noRecord;
      expect(await store.refresh()).toBe('unconfigured');
      expect(store.snapshot().claims).toBeNull();
    }
  });

  it('origin is persisted and survives a reload: sso is still droppable, installed still is not', async () => {
    const served = newStore();
    serve({ ver: 5 });
    await served.refresh();
    expect(JSON.parse(fs.readFileSync(file(), 'utf8')).origin).toBe('sso');
    const reloadedSso = newStore();
    reloadedSso.loadFromDisk();
    expect(reloadedSso.snapshot().source).toBe('cache');
    sso.token = noRecord;
    expect(await reloadedSso.refresh()).toBe('unconfigured');

    const installed = newStore();
    await installed.install(token({ ver: 6 }));
    expect(JSON.parse(fs.readFileSync(file(), 'utf8')).origin).toBe('installed');
    const reloadedInstalled = newStore();
    reloadedInstalled.loadFromDisk();
    expect(await reloadedInstalled.refresh()).toBe('unchanged');
    expect(reloadedInstalled.entitlement().licensed).toBe(true);
  });

  it('a file written before origin was recorded counts as installed: a 404 does not drop it', async () => {
    const first = newStore();
    await first.install(token({ ver: 4 }));
    const saved = JSON.parse(fs.readFileSync(file(), 'utf8'));
    delete saved.origin;
    fs.writeFileSync(file(), JSON.stringify(saved));
    const store = newStore();
    store.loadFromDisk();
    sso.token = noRecord;
    expect(await store.refresh()).toBe('unchanged');
    expect(store.snapshot().claims?.ver).toBe(4);
  });

  it('installing a newer token over an SSO-served one makes it installed; SSO later serving that same token makes it droppable', async () => {
    const store = newStore();
    serve({ ver: 5 });
    await store.refresh();
    const offline = token({ ver: 8 });
    await store.install(offline);
    sso.token = noRecord;
    expect(await store.refresh()).toBe('unchanged'); // ver 8 was installed here only

    sso.token = { status: 200, body: { token: offline } }; // SSO now serves it
    expect(await store.refresh()).toBe('unchanged');
    expect(JSON.parse(fs.readFileSync(file(), 'utf8')).origin).toBe('sso');
    sso.token = noRecord;
    expect(await store.refresh()).toBe('unconfigured');
  });
});

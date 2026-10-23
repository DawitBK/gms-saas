import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { applyCeiling, verifyCeilingToken, type CeilingClaims } from './license.ceiling';
import { LicenseStore, type LicenseStoreConfig } from './license.store';
import type { LicenseClaims } from './license.token';
import { TEST_ISSUER, TEST_SSO_URL, installFakeSso, makeTestKey, signCeiling, signToken, type FakeSsoState, type TestKey } from '../../tests/helpers/license';

const NOW = new Date('2026-10-19T12:00:00.000Z');
const CEILING_PATH = '/api/v1/licenses/public/sso-expiry';

const claims = (over: Partial<LicenseClaims> = {}): LicenseClaims => ({
  iss: '', aud: 'license:gms', sys: 'gms', ver: 1, iat: null, customer: 'Example', expiresAt: null, graceDays: 14, warnDays: 30,
  maxUsers: null, modules: null, modes: ['sso'], jti: null, ...over,
});
const ceilingOf = (over: Partial<CeilingClaims> = {}): CeilingClaims => ({
  iss: TEST_ISSUER, ver: 1, iat: null, customer: 'Example', expiresAt: new Date('2026-12-31T23:59:59.999Z'), graceDays: 3, warnDays: 9, jti: null, ...over,
});

describe('applyCeiling: the earlier of the licence and SSO, never later than the licence', () => {
  it('no note, or an SSO that never expires: the licence is untouched', () => {
    const c = claims({ expiresAt: new Date('2030-01-01') });
    expect(applyCeiling(c, null)).toEqual({ claims: c, limitedBy: 'licence' });
    expect(applyCeiling(c, ceilingOf({ expiresAt: null }))).toEqual({ claims: c, limitedBy: 'licence' });
  });
  it('SSO ends first: SSO date, grace and warning days apply, everything else is kept', () => {
    const c = claims({ expiresAt: new Date('2030-01-01'), maxUsers: 50, modules: ['visits'] });
    const out = applyCeiling(c, ceilingOf());
    expect(out.limitedBy).toBe('sso');
    expect(out.claims).toMatchObject({ expiresAt: new Date('2026-12-31T23:59:59.999Z'), graceDays: 3, warnDays: 9, maxUsers: 50, modules: ['visits'] });
  });
  it('a licence that never expires ends with SSO', () => {
    expect(applyCeiling(claims({ expiresAt: null }), ceilingOf()).claims.expiresAt).toEqual(new Date('2026-12-31T23:59:59.999Z'));
  });
  it('the licence ends first, or on the same instant: its own dates count (a note can never extend)', () => {
    const c = claims({ expiresAt: new Date('2026-06-30'), graceDays: 14 });
    expect(applyCeiling(c, ceilingOf())).toEqual({ claims: c, limitedBy: 'licence' });
    const same = claims({ expiresAt: new Date('2026-12-31T23:59:59.999Z') });
    expect(applyCeiling(same, ceilingOf()).limitedBy).toBe('licence');
  });
  it("SSO's grace days never carry the system past the end of its own grace period (a note only shortens)", () => {
    const c = claims({ expiresAt: new Date('2027-03-31T23:59:59.999Z'), graceDays: 3 });
    const out = applyCeiling(c, ceilingOf({ expiresAt: new Date('2027-03-30T23:59:59.999Z'), graceDays: 30 }));
    expect(out.limitedBy).toBe('sso');
    expect(out.claims.graceDays).toBe(4);
    expect(out.claims.expiresAt!.getTime() + out.claims.graceDays * 86_400_000).toBeLessThanOrEqual(c.expiresAt!.getTime() + 3 * 86_400_000);
    // a perpetual licence has no own hard stop to respect: SSO's grace days apply as given
    expect(applyCeiling(claims({ expiresAt: null }), ceilingOf({ graceDays: 30 })).claims.graceDays).toBe(30);
  });
  it('a licence that may also run standalone keeps its own dates: only an SSO-only licence ends with SSO', () => {
    const c = claims({ expiresAt: new Date('2030-01-01'), modes: ['sso', 'standalone'] });
    expect(applyCeiling(c, ceilingOf())).toEqual({ claims: c, limitedBy: 'licence' });
    expect(applyCeiling(claims({ expiresAt: new Date('2030-01-01'), modes: ['sso'] }), ceilingOf()).limitedBy).toBe('sso');
  });
});

describe('verifyCeilingToken', () => {
  const key = makeTestKey();
  const opts = { expectedIssuer: TEST_ISSUER, keys: [key.jwk] };
  it('accepts a note signed by the key in SSO\'s JWKS', () => {
    expect(verifyCeilingToken(signCeiling(key, { ver: 9, expiresAt: '2027-01-01T00:00:00.000Z' }), opts)).toMatchObject({ ver: 9, expiresAt: new Date('2027-01-01T00:00:00.000Z'), graceDays: 14 });
    expect(verifyCeilingToken(signCeiling(key, { expiresAt: null }), opts).expiresAt).toBeNull();
  });
  it.each([
    ['a different key', () => signCeiling(makeTestKey('test-kid-1'))],
    ['the wrong audience (a client licence audience)', () => signCeiling(key, { aud: 'license:gms' })],
    ['the wrong system', () => signCeiling(key, { sys: 'gms' })],
    ['the wrong issuer', () => signCeiling(key, { iss: 'http://evil.test' })],
    ['a licence token typ', () => signCeiling(key, {}, { typ: 'kcms-license+jwt' })],
    ['a non-RS256 alg', () => signCeiling(key, {}, { alg: 'HS256' })],
    ['graceDays out of range', () => signCeiling(key, { graceDays: 400 })],
    ['a malformed expiresAt', () => signCeiling(key, { expiresAt: 'soon' })],
  ])('rejects %s', (_l, make) => {
    expect(() => verifyCeilingToken(make(), opts)).toThrow();
  });
  it('a client licence is not an SSO note, and an SSO note is not a client licence', () => {
    expect(() => verifyCeilingToken(signToken(key), opts)).toThrow();
  });
  it('an unknown kid is reported as such (a JWKS refetch is worth one try)', () => {
    expect(() => verifyCeilingToken(signCeiling(makeTestKey('other-kid')), opts)).toThrow(expect.objectContaining({ reason: 'unknown_kid' }));
  });
  it('a payload edited after signing does not verify', () => {
    const good = signCeiling(key, { expiresAt: '2026-01-01T00:00:00.000Z' });
    const [h, , s] = good.split('.');
    const forged = Buffer.from(JSON.stringify({ iss: TEST_ISSUER, aud: 'license:ceiling', sys: 'sso', ver: 1, expiresAt: null, graceDays: 14, warnDays: 30 })).toString('base64url');
    expect(() => verifyCeilingToken(`${h}.${forged}.${s}`, opts)).toThrow();
  });
});

describe('LicenseStore follows SSO\'s note while holding an OFFLINE licence', () => {
  let dir: string;
  let ssoKey: TestKey; // SSO's OIDC key (published at /jwks)
  let ownerKey: TestKey; // the owner's offline licence key (pinned)
  let sso: FakeSsoState;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gms-ceiling-'));
    ssoKey = makeTestKey('sso-oidc-kid');
    ownerKey = makeTestKey('owner-licence-kid');
    sso = { keys: [ssoKey.jwk] };
    installFakeSso(sso);
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const config = (over: Partial<LicenseStoreConfig> = {}): LicenseStoreConfig => ({
    system: 'gms', enforcement: 'enforce', ssoUrl: TEST_SSO_URL, jwksPath: '/jwks', discoveryPath: '/.well-known/openid-configuration',
    publicTokenPath: '/api/v1/licenses/public/gms', requestTimeoutMs: 5_000, pollSeconds: 300, dataDir: dir,
    required: true, trustKeys: [ownerKey.jwk], deployment: 'sso', ceilingPath: CEILING_PATH, ...over,
  });
  const offline = async (store: LicenseStore, payload: Parameters<typeof signToken>[1] = {}) => {
    expect((await store.install(signToken(ownerKey, { expiresAt: '2027-12-31T23:59:59.999Z', ...payload }))).outcome).toBe('installed');
  };
  const note = (over: Record<string, unknown> = {}) => { sso.ceiling = { status: 200, body: { token: signCeiling(ssoKey, over) } }; };

  it('before any note: the licence\'s own date; after a note that ends sooner: SSO\'s date, grace and warning days', async () => {
    const store = new LicenseStore(config(), () => NOW);
    await offline(store);
    await store.refresh();
    expect(store.snapshot()).toMatchObject({ state: 'active', limitedBy: 'licence' });
    note({ ver: 5, expiresAt: '2026-10-19T00:00:00.000Z', graceDays: 3, warnDays: 9 });
    await store.refresh();
    const s = store.snapshot();
    expect(s.limitedBy).toBe('sso');
    expect(s.state).toBe('grace'); // SSO ended this morning, 3 grace days
    expect(s.claims?.expiresAt?.toISOString()).toBe('2026-10-19T00:00:00.000Z');
    // and four days later it is expired (read-only)
    expect(store.snapshot(new Date('2026-10-23T00:00:00.000Z')).state).toBe('expired');
  });

  it('a note signed by anything but SSO\'s published key is ignored: nobody can forge an early end with the owner key or a stranger\'s key', async () => {
    const store = new LicenseStore(config(), () => NOW);
    await offline(store);
    sso.ceiling = { status: 200, body: { token: signCeiling(makeTestKey('sso-oidc-kid'), { expiresAt: '2020-01-01T00:00:00.000Z' }) } }; // right kid, wrong key
    await store.refresh();
    expect(store.snapshot().limitedBy).toBe('licence');
  });

  it('a note can never extend: SSO renewed beyond the licence leaves the licence\'s own date in force', async () => {
    const store = new LicenseStore(config(), () => NOW);
    await offline(store, { expiresAt: '2026-11-30T00:00:00.000Z' });
    note({ ver: 2, expiresAt: '2031-01-01T00:00:00.000Z' });
    await store.refresh();
    expect(store.snapshot()).toMatchObject({ limitedBy: 'licence' });
    expect(store.snapshot().claims?.expiresAt?.toISOString()).toBe('2026-11-30T00:00:00.000Z');
  });

  it('SSO unreachable or answering garbage: the last note keeps ending the system (blocking SSO cannot bring it back)', async () => {
    const store = new LicenseStore(config(), () => NOW);
    await offline(store);
    note({ ver: 5, expiresAt: '2026-10-01T00:00:00.000Z', graceDays: 0 });
    await store.refresh();
    expect(store.snapshot().state).toBe('expired');
    sso.ceiling = 'throw';
    await store.refresh();
    expect(store.snapshot().state).toBe('expired');
    sso.ceiling = { status: 200, body: { token: 'garbage' } };
    await store.refresh();
    expect(store.snapshot().state).toBe('expired');
    sso.ceiling = { status: 500, body: {} };
    await store.refresh();
    expect(store.snapshot().state).toBe('expired');
  });

  it('survives a restart while SSO is down (the note is cached and re-verified from the key stored with it)', async () => {
    const first = new LicenseStore(config(), () => NOW);
    await offline(first);
    note({ ver: 5, expiresAt: '2026-10-01T00:00:00.000Z', graceDays: 0 });
    await first.refresh();
    sso.ceiling = 'throw';
    const second = new LicenseStore(config(), () => NOW);
    second.loadFromDisk();
    expect(second.snapshot()).toMatchObject({ state: 'expired', limitedBy: 'sso' });
  });

  it('an older note does not replace a newer one', async () => {
    const store = new LicenseStore(config(), () => NOW);
    await offline(store);
    note({ ver: 9, expiresAt: '2026-10-01T00:00:00.000Z', graceDays: 0 });
    await store.refresh();
    note({ ver: 3, expiresAt: '2029-01-01T00:00:00.000Z' }); // a replayed, older, later-dated note
    await store.refresh();
    expect(store.snapshot().state).toBe('expired');
  });

  it('SSO\'s "no licence" answer drops the note; an SSO without the route does not', async () => {
    const store = new LicenseStore(config(), () => NOW);
    await offline(store);
    note({ ver: 5, expiresAt: '2026-10-01T00:00:00.000Z', graceDays: 0 });
    await store.refresh();
    sso.ceiling = undefined; // the generic 404: an SSO that does not know the route
    await store.refresh();
    expect(store.snapshot().limitedBy).toBe('sso');
    sso.ceiling = { status: 404, body: { error: { code: 'ERR-LICENSE-NOT-FOUND' } } };
    await store.refresh();
    expect(store.snapshot().limitedBy).toBe('licence');
    expect(fs.existsSync(path.join(dir, 'sso-expiry.json'))).toBe(false);
  });

  it("a JSON 404 that is not SSO's own 'no licence' answer (a gateway, a proxy, an SSO mid-update) keeps the note", async () => {
    const store = new LicenseStore(config(), () => NOW);
    await offline(store);
    note({ ver: 5, expiresAt: '2026-10-01T00:00:00.000Z', graceDays: 0 });
    await store.refresh();
    for (const body of [{ error: { code: 'ERR-SOMETHING-ELSE' } }, { message: 'Not Found' }, { error: 'not_found' }]) {
      sso.ceiling = { status: 404, body };
      await store.refresh();
      expect(store.snapshot().limitedBy).toBe('sso');
    }
    expect(fs.existsSync(path.join(dir, 'sso-expiry.json'))).toBe(true);
  });

  it('an SSO that never expires (note with null) limits nothing', async () => {
    const store = new LicenseStore(config(), () => NOW);
    await offline(store);
    note({ ver: 5, expiresAt: null });
    await store.refresh();
    expect(store.snapshot().limitedBy).toBe('licence');
  });

  it('a standalone deployment, or no configured path, never asks SSO for the note', async () => {
    const calls: string[] = [];
    const mock = installFakeSso(sso);
    for (const over of [{ deployment: 'standalone' as const }, { ceilingPath: undefined }]) {
      const store = new LicenseStore(config(over), () => NOW);
      await offline(store);
      note({ ver: 5, expiresAt: '2026-10-01T00:00:00.000Z' });
      await store.refresh();
      calls.push(...mock.mock.calls.map((c) => String(c[0])).filter((u) => u.endsWith('sso-expiry')));
      expect(store.snapshot().limitedBy).toBe('licence');
    }
    expect(calls).toEqual([]);
  });
});

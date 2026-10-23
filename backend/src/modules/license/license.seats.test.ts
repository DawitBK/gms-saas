import fs from 'fs';
import path from 'path';
import { describe, expect, it, jest } from '@jest/globals';
import { assertSeatAvailable } from './license.seats';
import { buildLicenseStatus } from './license.service';
import { GMS_LICENSE_MODULES } from './license.catalog';
import type { LicenseSnapshot, LicenseStore } from './license.store';
import type { LicenseClaims } from './license.token';
import type { LicenseState } from './license.state';

const PA_EMAIL = 'pa-0123456789abcdef0123456789abcdef@platform.invalid';

const fakeStore = (
  state: LicenseState,
  over: Partial<LicenseClaims> = {},
  enforcement: 'enforce' | 'warn' | 'off' = 'enforce',
) => {
  const claims: LicenseClaims | null =
    state === 'unknown' || state === 'unconfigured'
      ? null
      : {
          iss: 'x',
          aud: 'license:gms',
          sys: 'gms',
          ver: 4,
          iat: null,
          customer: 'Example Corp',
          expiresAt: new Date('2027-01-01T00:00:00.000Z'),
          graceDays: 14,
          warnDays: 30,
          maxUsers: 3,
          modules: ['visits'],
          ...over,
        };
  const snap: LicenseSnapshot = {
    state,
    daysRemaining: state === 'grace' ? -3 : 120,
    graceEndsAt: '2027-01-15T00:00:00.000Z',
    source: 'sso',
    fetchedAt: new Date('2026-10-19T12:00:00.000Z'),
    claims,
  };
  return { enforcement, snapshot: () => snap } as unknown as LicenseStore;
};

describe('assertSeatAvailable', () => {
  it('refuses with 403 LICENSE_SEAT_LIMIT when seatsUsed >= maxUsers', async () => {
    const counter = jest.fn(async () => 3);
    await expect(assertSeatAvailable({ store: fakeStore('active'), counter, email: 'new@examplecorp.com' })).rejects.toMatchObject({
      statusCode: 403,
      code: 'LICENSE_SEAT_LIMIT',
      details: { maxUsers: 3, seatsUsed: 3 },
    });
  });

  it('allows while seatsUsed < maxUsers', async () => {
    await expect(assertSeatAvailable({ store: fakeStore('active'), counter: async () => 2 })).resolves.toBeUndefined();
  });

  it('applies in expiring, grace and expired as well as active', async () => {
    for (const state of ['active', 'expiring', 'grace', 'expired'] as const) {
      await expect(assertSeatAvailable({ store: fakeStore(state), counter: async () => 3 })).rejects.toMatchObject({ code: 'LICENSE_SEAT_LIMIT' });
    }
  });

  it('never refuses in unconfigured or unknown, and never even counts', async () => {
    const counter = jest.fn(async () => 999);
    await assertSeatAvailable({ store: fakeStore('unconfigured'), counter });
    await assertSeatAvailable({ store: fakeStore('unknown'), counter });
    expect(counter).not.toHaveBeenCalled();
  });

  it('never refuses when the licence has no seat limit', async () => {
    const counter = jest.fn(async () => 999);
    await assertSeatAvailable({ store: fakeStore('active', { maxUsers: null }), counter });
    expect(counter).not.toHaveBeenCalled();
  });

  it('excludes the platform administrator from the refusal', async () => {
    const counter = jest.fn(async () => 999);
    await assertSeatAvailable({ store: fakeStore('active'), counter, email: PA_EMAIL });
    expect(counter).not.toHaveBeenCalled();
  });

  it('warn mode lets the account through; off mode does not look', async () => {
    await expect(assertSeatAvailable({ store: fakeStore('active', {}, 'warn'), counter: async () => 9 })).resolves.toBeUndefined();
    const counter = jest.fn(async () => 9);
    await assertSeatAvailable({ store: fakeStore('active', {}, 'off'), counter });
    expect(counter).not.toHaveBeenCalled();
  });

  it('a failing count never refuses anyone', async () => {
    await expect(
      assertSeatAvailable({
        store: fakeStore('active'),
        counter: async () => {
          throw new Error('db down');
        },
      }),
    ).resolves.toBeUndefined();
  });
});

describe('GET /license/status payload', () => {
  it('has the contract shape for a licensed system', async () => {
    const status = await buildLicenseStatus(fakeStore('grace'), async () => 2);
    expect(status).toEqual({
      system: 'gms',
      state: 'grace',
      customer: 'Example Corp',
      expiresAt: '2027-01-01T00:00:00.000Z',
      graceEndsAt: '2027-01-15T00:00:00.000Z',
      daysRemaining: -3,
      warnDays: 30,
      graceDays: 14,
      readOnly: false,
      maxUsers: 3,
      seatsUsed: 2,
      modules: ['visits'],
      source: 'sso',
      fetchedAt: '2026-10-19T12:00:00.000Z',
      version: 4,
      enforcement: 'enforce',
      // section 9 additions: not required here, so always licensed
      required: false,
      licensed: true,
      reason: null,
      deployment: 'sso',
      // additive (2026-10-21): which date is binding; null here because the fake store reports no limit
      limitedBy: null,
    });
  });

  it('readOnly is true only for expired under enforce', async () => {
    expect((await buildLicenseStatus(fakeStore('expired'), async () => 0)).readOnly).toBe(true);
    expect((await buildLicenseStatus(fakeStore('expired', {}, 'warn'), async () => 0)).readOnly).toBe(false);
    expect((await buildLicenseStatus(fakeStore('active'), async () => 0)).readOnly).toBe(false);
  });

  it('reports unconfigured / unknown with null licence fields, and survives a failing seat count', async () => {
    const status = await buildLicenseStatus(fakeStore('unconfigured'), async () => {
      throw new Error('db down');
    });
    expect(status).toMatchObject({ state: 'unconfigured', customer: null, expiresAt: null, maxUsers: null, modules: null, seatsUsed: null, version: null });
  });
});

describe('module catalogue', () => {
  const CONTRACT = ['visits', 'scheduling', 'checkin', 'credentials', 'notifications', 'ocr'];

  it('is the contract list (section 7, GMS)', () => {
    expect([...GMS_LICENSE_MODULES].sort()).toEqual([...CONTRACT].sort());
  });

  // GMS is its own repo; the contract lives in the platform repo one level up. Compared when it is there. The test always RUNS
  // (it returns early when the file is absent, as in CI where only this repo is checked out) instead of being `it.skip`: a skipped test
  // changes the Jest totals, and docs/TEST_STATUS.md, which CI regenerates and diffs, must read the same on every machine.
  const docPath = path.resolve(__dirname, '../../../../../docs/operations/PLATFORM-LICENSING.md');
  it('matches docs/operations/PLATFORM-LICENSING.md section 7 when that file is present', () => {
    if (!fs.existsSync(docPath)) return;
    const lines = fs.readFileSync(docPath, 'utf8').split(/\r?\n/);
    const start = lines.findIndex((l) => l.startsWith('- **GMS:**'));
    expect(start).toBeGreaterThanOrEqual(0);
    // The bullet wraps over several lines; the gateable keys are everything before "Core:".
    const line = lines.slice(start, start + 3).join(' ');
    const documented = [...line.split('Core:')[0].matchAll(/`([a-z_]+)`/g)].map((m) => m[1]);
    expect([...documented].sort()).toEqual([...GMS_LICENSE_MODULES].sort());
  });
});

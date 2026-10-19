import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { envSchema, resolveLicenseDeployment, resolveLicenseRequired } from '../config/env.schema';
import { logger } from '../core/logger/logger';
import { LicenseStore, type LicenseStoreConfig } from '../modules/license/license.store';
import { TEST_SSO_URL, installFakeSso, makeTestKey } from './helpers/license';

// `logger` is a Proxy that hands out fresh wrapper functions, which jest.spyOn cannot hook: replace the module.
jest.mock('../core/logger/logger', () => {
  const fns = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), fatal: jest.fn(), trace: jest.fn() };
  return { logger: { ...fns, child: () => fns }, createLogger: () => fns };
});
const log = logger as unknown as Record<'info' | 'warn' | 'error', jest.Mock>;

const base = {
  NODE_ENV: 'test',
  DB_HOST: 'localhost',
  DB_USER: 'u',
  DB_PASSWORD: 'p',
  DB_NAME: 'n',
  JWT_SECRET: '0123456789abcdef',
};

describe('LICENSE_REQUIRED and LICENSE_TRUST_PUBLIC_KEYS in the env schema', () => {
  it('are optional: unset reads as undefined', () => {
    const env = envSchema.parse(base);
    expect(env.LICENSE_REQUIRED).toBeUndefined();
    expect(env.LICENSE_TRUST_PUBLIC_KEYS).toBeUndefined();
  });

  it('read blank as unset, so a template line cannot refuse a boot', () => {
    const env = envSchema.parse({ ...base, LICENSE_REQUIRED: '', LICENSE_TRUST_PUBLIC_KEYS: '  ' });
    expect(env.LICENSE_REQUIRED).toBeUndefined();
    expect(env.LICENSE_TRUST_PUBLIC_KEYS).toBeUndefined();
  });

  it('LICENSE_REQUIRED accepts true and false in any case, and refuses nonsense loudly', () => {
    expect(envSchema.parse({ ...base, LICENSE_REQUIRED: 'true' }).LICENSE_REQUIRED).toBe(true);
    expect(envSchema.parse({ ...base, LICENSE_REQUIRED: 'FALSE' }).LICENSE_REQUIRED).toBe(false);
    expect(envSchema.safeParse({ ...base, LICENSE_REQUIRED: 'maybe' }).success).toBe(false);
    expect(envSchema.safeParse({ ...base, LICENSE_REQUIRED: '1' }).success).toBe(false);
  });

  it('LICENSE_TRUST_PUBLIC_KEYS is carried through as the raw string (parsed, and reported, at boot)', () => {
    const raw = JSON.stringify([{ kty: 'RSA', n: 'x', e: 'AQAB' }]);
    expect(envSchema.parse({ ...base, LICENSE_TRUST_PUBLIC_KEYS: raw }).LICENSE_TRUST_PUBLIC_KEYS).toBe(raw);
    expect(envSchema.safeParse({ ...base, LICENSE_TRUST_PUBLIC_KEYS: 'not json' }).success).toBe(true);
  });
});

describe('resolveLicenseRequired', () => {
  it.each([
    ['production, unset', 'production', undefined, true],
    ['development, unset', 'development', undefined, false],
    ['test, unset', 'test', undefined, false],
    ['production, false', 'production', false, false],
    ['development, true', 'development', true, true],
  ] as const)('%s', (_label, nodeEnv, flag, expected) => {
    expect(resolveLicenseRequired({ NODE_ENV: nodeEnv, LICENSE_REQUIRED: flag })).toBe(expected);
  });
});

describe('resolveLicenseDeployment (from GMS\'s own SSO integration config)', () => {
  const KEY = 'k'.repeat(32);
  it.each([
    ['nothing configured', {}, 'standalone'],
    ['the token bridge key', { SSO_INTERNAL_API_KEY: KEY }, 'sso'],
    ['the roles API base and key', { SSO_API_BASE: 'http://127.0.0.1:7300', SSO_ROLES_API_KEY: KEY }, 'sso'],
    ['a roles API base alone', { SSO_API_BASE: 'http://127.0.0.1:7300' }, 'standalone'],
    ['a roles API key alone', { SSO_ROLES_API_KEY: KEY }, 'standalone'],
  ] as const)('%s -> %s', (_label, env, expected) => {
    expect(resolveLicenseDeployment(env)).toBe(expected);
  });
});

describe('the start-up posture is said at error level, every start', () => {
  const dirs: string[] = [];
  const store = (over: Partial<LicenseStoreConfig>) => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gms-license-posture-'));
    dirs.push(dataDir);
    return new LicenseStore({
      system: 'gms',
      enforcement: 'enforce',
      ssoUrl: TEST_SSO_URL,
      jwksPath: '/jwks',
      discoveryPath: '/.well-known/openid-configuration',
      publicTokenPath: '/api/v1/licenses/public/gms',
      requestTimeoutMs: 100,
      pollSeconds: 300,
      dataDir,
      ...over,
    });
  };
  const errors = () => log.error.mock.calls.map((c) => String(c[1]));

  beforeEach(() => {
    for (const fn of [log.info, log.warn, log.error]) fn.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  const run = (s: LicenseStore) => {
    installFakeSso({ keys: [] });
    s.start();
    s.stop();
  };

  it('LICENSE_REQUIRED=false in production', () => {
    run(store({ required: false, isProduction: true, enforcement: 'off' }));
    expect(errors().some((m) => m.includes('LICENSE_REQUIRED=false in production'))).toBe(true);
  });

  it('LICENSE_REQUIRED=false outside production is not an error', () => {
    run(store({ required: false, isProduction: false, enforcement: 'off' }));
    expect(errors()).toEqual([]);
  });

  it.each(['warn', 'off'] as const)('LICENSE_ENFORCEMENT=%s while required', (enforcement) => {
    run(store({ required: true, enforcement, trustKeys: [makeTestKey().jwk] }));
    expect(errors().some((m) => m.includes(`LICENSE_ENFORCEMENT=${enforcement} while LICENSE_REQUIRED is true`))).toBe(true);
  });

  it('required with no usable trust key says no token can verify, and reports each bad key', () => {
    run(store({ required: true, trustKeys: [], trustKeyErrors: ['LICENSE_TRUST_PUBLIC_KEYS[0] is not an object'] }));
    expect(errors().some((m) => m.includes('LICENSE_TRUST_PUBLIC_KEYS[0] is not an object'))).toBe(true);
    expect(errors().some((m) => m.includes('no licence token can verify'))).toBe(true);
  });

  it('a correct required setup logs no error', () => {
    run(store({ required: true, isProduction: true, trustKeys: [makeTestKey().jwk] }));
    expect(errors()).toEqual([]);
  });
});

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// PLATFORM-GAP-021 / P1-13 regression coverage. The durable `user_revocation_cutoffs`
// table (added by P1-13) means a Redis-only outage no longer needs to fail closed —
// isSessionRevoked answers from Postgres instead, in production and outside it alike.
// Only when BOTH Redis and the durable fallback are unavailable does production fail
// CLOSED (reject the request), matching DMS's shared/auth.ts revocationEnforced()
// pattern; non-production still fails open in that double-outage case so local
// dev/test isn't blocked by missing infra.

const redisState: { available: boolean; getResult: string | null; getError: Error | null } = {
  available: true,
  getResult: null,
  getError: null,
};

jest.mock('../infrastructure/cache/redis.client', () => ({
  isRedisAvailable: () => redisState.available,
  redisClient: {
    get: jest.fn(async () => {
      if (redisState.getError) throw redisState.getError;
      return redisState.getResult;
    }),
    set: jest.fn(async () => 'OK'),
  },
}));

const dbState: { cutoff: string | null; error: Error | null } = {
  cutoff: null,
  error: null,
};

jest.mock('../infrastructure/database/sequelize', () => ({
  sequelize: {
    query: jest.fn(async () => {
      if (dbState.error) throw dbState.error;
      return dbState.cutoff === null ? [] : [{ cutoff_at: dbState.cutoff }];
    }),
  },
}));

const appConfigState = { isProduction: false };

jest.mock('../config/app.config', () => ({
  appConfig: new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === 'isProduction') return appConfigState.isProduction;
        // session-revocation.service.ts reads appConfig.jwt.refreshExpiresIn at
        // module load time (CUTOFF_TTL_SECONDS) — the mock must shape that too,
        // not just the property this suite asserts on.
        if (prop === 'jwt') return { refreshExpiresIn: '7d' };
        return undefined;
      },
    },
  ),
}));

import { isSessionRevoked, RevocationCheckUnavailableError } from '../shared/services/session-revocation.service';

describe('session-revocation.service', () => {
  beforeEach(() => {
    redisState.available = true;
    redisState.getResult = null;
    redisState.getError = null;
    dbState.cutoff = null;
    dbState.error = null;
    appConfigState.isProduction = false;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns false when Redis is healthy and no cutoff is recorded', async () => {
    await expect(isSessionRevoked(1, 1000)).resolves.toBe(false);
  });

  it('returns true only for tokens issued at or before the recorded cutoff', async () => {
    redisState.getResult = '2000';
    await expect(isSessionRevoked(1, 1500)).resolves.toBe(true);
    await expect(isSessionRevoked(1, 2000)).resolves.toBe(true);
    await expect(isSessionRevoked(1, 2001)).resolves.toBe(false);
  });

  it('falls back to the durable Postgres cutoff when Redis is unreachable, outside production', async () => {
    redisState.available = false;
    appConfigState.isProduction = false;
    dbState.cutoff = '2000';
    await expect(isSessionRevoked(1, 1500)).resolves.toBe(true);
    await expect(isSessionRevoked(1, 2001)).resolves.toBe(false);
  });

  it('falls back to the durable Postgres cutoff when Redis is unreachable, in production too', async () => {
    // P1-13: the durable table means a Redis-only outage is no longer a reason to
    // fail closed in production — only a Redis+Postgres double outage is (below).
    redisState.available = false;
    appConfigState.isProduction = true;
    dbState.cutoff = '2000';
    await expect(isSessionRevoked(1, 1500)).resolves.toBe(true);
    await expect(isSessionRevoked(1, 2001)).resolves.toBe(false);
  });

  it('falls back to the durable Postgres cutoff when the Redis GET call itself throws', async () => {
    appConfigState.isProduction = true;
    redisState.getError = new Error('ECONNRESET');
    dbState.cutoff = '2000';
    await expect(isSessionRevoked(1, 1500)).resolves.toBe(true);
    await expect(isSessionRevoked(1, 2001)).resolves.toBe(false);
  });

  it('fails CLOSED in production when Redis is unreachable AND the durable fallback also fails', async () => {
    redisState.available = false;
    dbState.error = new Error('connection terminated');
    appConfigState.isProduction = true;
    await expect(isSessionRevoked(1, 1000)).rejects.toBeInstanceOf(RevocationCheckUnavailableError);
  });

  it('fails OPEN outside production when Redis is unreachable AND the durable fallback also fails', async () => {
    redisState.available = false;
    dbState.error = new Error('connection terminated');
    appConfigState.isProduction = false;
    await expect(isSessionRevoked(1, 1000)).resolves.toBe(false);
  });

  it('fails CLOSED in production when the Redis GET throws AND the durable fallback also fails', async () => {
    appConfigState.isProduction = true;
    redisState.getError = new Error('ECONNRESET');
    dbState.error = new Error('connection terminated');
    await expect(isSessionRevoked(1, 1000)).rejects.toBeInstanceOf(RevocationCheckUnavailableError);
  });

  it('fails OPEN outside production when the Redis GET throws AND the durable fallback also fails', async () => {
    appConfigState.isProduction = false;
    redisState.getError = new Error('ECONNRESET');
    dbState.error = new Error('connection terminated');
    await expect(isSessionRevoked(1, 1000)).resolves.toBe(false);
  });
});

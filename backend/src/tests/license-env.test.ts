import { describe, expect, it } from '@jest/globals';
import { envSchema } from '../config/env.schema';

const base = {
  NODE_ENV: 'test',
  DB_HOST: 'localhost',
  DB_USER: 'u',
  DB_PASSWORD: 'p',
  DB_NAME: 'n',
  JWT_SECRET: '0123456789abcdef',
};

describe('licence environment settings', () => {
  it('are all optional and default to enforce / SSO on 7300 / 300 s', () => {
    const env = envSchema.parse(base);
    expect(env.LICENSE_ENFORCEMENT).toBe('enforce');
    expect(env.LICENSE_SSO_URL).toBe('http://127.0.0.1:7300');
    expect(env.LICENSE_POLL_SECONDS).toBe(300);
    expect(env.LICENSE_ISSUER).toBeUndefined();
    expect(env.LICENSE_DATA_DIR).toBeUndefined();
  });

  it('read blank values as unset, so a template line cannot refuse a boot', () => {
    const env = envSchema.parse({ ...base, LICENSE_ENFORCEMENT: '', LICENSE_SSO_URL: ' ', LICENSE_POLL_SECONDS: '', LICENSE_ISSUER: '', LICENSE_DATA_DIR: '' });
    expect(env.LICENSE_ENFORCEMENT).toBe('enforce');
    expect(env.LICENSE_SSO_URL).toBe('http://127.0.0.1:7300');
    expect(env.LICENSE_POLL_SECONDS).toBe(300);
  });

  it('accept the three enforcement modes (any case) and the mirror SSO URL', () => {
    expect(envSchema.parse({ ...base, LICENSE_ENFORCEMENT: 'WARN' }).LICENSE_ENFORCEMENT).toBe('warn');
    expect(envSchema.parse({ ...base, LICENSE_ENFORCEMENT: 'off' }).LICENSE_ENFORCEMENT).toBe('off');
    expect(envSchema.parse({ ...base, LICENSE_SSO_URL: 'http://127.0.0.1:9300', LICENSE_POLL_SECONDS: '60' })).toMatchObject({
      LICENSE_SSO_URL: 'http://127.0.0.1:9300',
      LICENSE_POLL_SECONDS: 60,
    });
  });

  it('refuse nonsense loudly', () => {
    expect(envSchema.safeParse({ ...base, LICENSE_ENFORCEMENT: 'maybe' }).success).toBe(false);
    expect(envSchema.safeParse({ ...base, LICENSE_POLL_SECONDS: '1' }).success).toBe(false);
    expect(envSchema.safeParse({ ...base, LICENSE_SSO_URL: 'not a url' }).success).toBe(false);
  });
});

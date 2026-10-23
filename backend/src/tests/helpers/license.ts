/**
 * Test helpers for the platform licence: a throwaway RSA signing key, a token signer that follows
 * PLATFORM-LICENSING.md section 4, and a fake SSO served through a stubbed `fetch`.
 * No live SSO, no network.
 */
import crypto from 'crypto';
import { jest } from '@jest/globals';
import { LICENSE_TOKEN_TYP, type Jwk } from '../../modules/license/license.token';

export const TEST_ISSUER = 'http://sso.test';
export const TEST_SSO_URL = 'http://127.0.0.1:7300';

export interface TestKey {
  kid: string;
  privateKey: crypto.KeyObject;
  jwk: Jwk;
}

export function makeTestKey(kid = 'test-kid-1'): TestKey {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' } as Jwk;
  return { kid, privateKey, jwk };
}

export interface TestPayload {
  iss?: string;
  aud?: string;
  sys?: string;
  ver?: number;
  iat?: number;
  customer?: string;
  expiresAt?: string | null;
  graceDays?: number;
  warnDays?: number;
  maxUsers?: number | null;
  modules?: string[] | null;
  [key: string]: unknown;
}

export function defaultPayload(over: TestPayload = {}): TestPayload {
  return {
    iss: TEST_ISSUER,
    aud: 'license:gms',
    sys: 'gms',
    ver: 1,
    iat: 1_792_394_000,
    customer: 'Example Corp',
    expiresAt: '2099-01-01T00:00:00.000Z',
    graceDays: 14,
    warnDays: 30,
    maxUsers: null,
    modules: null,
    ...over,
  };
}

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

export function signToken(
  key: TestKey,
  payloadOver: TestPayload = {},
  headerOver: Record<string, unknown> = {},
): string {
  const header = { alg: 'RS256', typ: LICENSE_TOKEN_TYP, kid: key.kid, ...headerOver };
  const payload = defaultPayload(payloadOver);
  const input = `${b64(header)}.${b64(payload)}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(input), key.privateKey).toString('base64url');
  return `${input}.${signature}`;
}

/** A "SSO ends on this date" note (modules/license/license.ceiling.ts), signed like SSO signs it. */
export function signCeiling(
  key: TestKey,
  payloadOver: Record<string, unknown> = {},
  headerOver: Record<string, unknown> = {},
): string {
  const header = { alg: 'RS256', typ: 'kcms-license-ceiling+jwt', kid: key.kid, ...headerOver };
  const payload = {
    iss: TEST_ISSUER,
    aud: 'license:ceiling',
    sys: 'sso',
    ver: 1,
    iat: 1_792_394_000,
    customer: 'Example Corp',
    expiresAt: '2099-01-01T00:00:00.000Z',
    graceDays: 14,
    warnDays: 30,
    jti: 'sso-ceiling-v1',
    ...payloadOver,
  };
  const input = `${b64(header)}.${b64(payload)}`;
  return `${input}.${crypto.sign('RSA-SHA256', Buffer.from(input), key.privateKey).toString('base64url')}`;
}

export interface FakeSsoState {
  /** Answer of SSO's "SSO ends on this date" route; unset = SSO has no such route (the generic 404). */
  ceiling?: { status: number; body: unknown } | 'throw';
  /** Token route answer. */
  token?: { status: number; body: unknown } | 'throw' | 'hang';
  /** JWKS keys served at /jwks. */
  keys: Jwk[];
  /** Discovery issuer. */
  issuer?: string;
  jwksStatus?: number;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Installs a fake SSO as `global.fetch` and returns the mock plus its mutable state. */
export function installFakeSso(state: FakeSsoState) {
  const mock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith(TEST_SSO_URL)) throw new Error(`Unexpected network call during test: ${url}`);
    const path = url.slice(TEST_SSO_URL.length);
    if (path === '/api/v1/licenses/public/gms') {
      const answer = state.token;
      if (answer === 'throw') throw new Error('ECONNREFUSED');
      if (answer === 'hang') {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      }
      return json(answer?.status ?? 404, answer?.body ?? { error: 'invalid_request' });
    }
    if (path === '/api/v1/licenses/public/sso-expiry') {
      const answer = state.ceiling;
      if (answer === 'throw') throw new Error('ECONNREFUSED');
      return json(answer?.status ?? 404, answer?.body ?? { error: 'invalid_request' });
    }
    if (path === '/jwks') return json(state.jwksStatus ?? 200, { keys: state.keys });
    if (path === '/.well-known/openid-configuration') return json(200, { issuer: state.issuer ?? TEST_ISSUER });
    return json(404, { error: 'invalid_request' });
  });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

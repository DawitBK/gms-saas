import crypto from 'crypto';
import { describe, expect, it } from '@jest/globals';
import { jwkThumbprint, parseTrustPublicKeys } from './license.trust';
import { makeTestKey } from '../../tests/helpers/license';

describe('parseTrustPublicKeys (LICENSE_TRUST_PUBLIC_KEYS)', () => {
  it('unset or blank is no keys and no error', () => {
    expect(parseTrustPublicKeys(undefined)).toEqual({ keys: [], errors: [] });
    expect(parseTrustPublicKeys('  ')).toEqual({ keys: [], errors: [] });
  });

  it('reads a JSON array of public RSA JWKs and keeps only the public fields', () => {
    const key = makeTestKey('kid-a');
    const { keys, errors } = parseTrustPublicKeys(JSON.stringify([{ ...key.jwk, extra: 'x' }]));
    expect(errors).toEqual([]);
    expect(keys).toEqual([{ kty: 'RSA', kid: 'kid-a', n: key.jwk.n, e: key.jwk.e, alg: 'RS256', use: 'sig' }]);
  });

  it('gives a key with no kid its RFC 7638 thumbprint', () => {
    const key = makeTestKey('ignored');
    const bare = { kty: 'RSA', n: key.jwk.n, e: key.jwk.e };
    const { keys } = parseTrustPublicKeys(JSON.stringify([bare]));
    expect(keys[0].kid).toBe(jwkThumbprint({ e: key.jwk.e as string, n: key.jwk.n as string }));
    const canonical = JSON.stringify({ e: bare.e, kty: 'RSA', n: bare.n });
    expect(keys[0].kid).toBe(crypto.createHash('sha256').update(canonical).digest('base64url'));
  });

  it('refuses an entry carrying private key material, and says so', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pub = publicKey.export({ format: 'jwk' });
    const priv = privateKey.export({ format: 'jwk' });
    const { keys, errors } = parseTrustPublicKeys(JSON.stringify([priv, pub]));
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toHaveProperty('d');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/private key material/);
  });

  it.each([
    ['not JSON', '{ nope'],
    ['not an array', '{"kty":"RSA"}'],
  ])('%s: no keys and one error, never a throw', (_label, raw) => {
    const { keys, errors } = parseTrustPublicKeys(raw);
    expect(keys).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it('skips bad entries but keeps the good ones', () => {
    const key = makeTestKey('good');
    const { keys, errors } = parseTrustPublicKeys(
      JSON.stringify([null, 'x', { kty: 'EC', crv: 'P-256', x: 'a', y: 'b' }, { kty: 'RSA', n: '', e: 'AQAB' }, key.jwk]),
    );
    expect(keys.map((k) => k.kid)).toEqual(['good']);
    expect(errors).toHaveLength(4);
    expect(errors.join('\n')).toMatch(/is not a public RSA JWK/);
  });
});

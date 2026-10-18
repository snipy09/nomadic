import { describe, it, expect, beforeAll, vi } from 'vitest';
import {
  createJwksCache,
  verifyGoogleIdToken,
  type Jwks,
  type RsaJwk,
} from '../../functions/google-sign-in/verify.ts';

// S9: the google-sign-in Edge Function must only accept Google ID tokens that are signed by Google, issued to our
// client id, unexpired and for a verified email. A local RSA key stands in for Google's signing key.

const AUD = 'test-client.apps.googleusercontent.com';
const NOW = 1_800_000_000;

let goodKey: CryptoKeyPair;
let otherKey: CryptoKeyPair;
let jwks: Jwks;

const enc = (v: unknown) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

async function sign(
  claims: Record<string, unknown>,
  { key = goodKey, kid = 'kid-1', alg = 'RS256' }: { key?: CryptoKeyPair; kid?: string; alg?: string } = {},
): Promise<string> {
  const input = `${enc({ alg, kid, typ: 'JWT' })}.${enc(claims)}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key.privateKey, new TextEncoder().encode(input));
  return `${input}.${Buffer.from(sig).toString('base64url')}`;
}

function claims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: 'https://accounts.google.com',
    aud: AUD,
    azp: AUD,
    sub: '110169484474386276334',
    email: 'Person@Example.com',
    email_verified: true,
    name: 'Test Person',
    given_name: 'Test',
    family_name: 'Person',
    iat: NOW - 10,
    exp: NOW + 3600,
    ...overrides,
  };
}

const verify = (token: string, extra: Partial<Parameters<typeof verifyGoogleIdToken>[1]> = {}) =>
  verifyGoogleIdToken(token, { audience: AUD, getJwks: async () => jwks, nowSeconds: NOW, ...extra });

beforeAll(async () => {
  const params = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
  goodKey = (await crypto.subtle.generateKey(params, true, ['sign', 'verify'])) as CryptoKeyPair;
  otherKey = (await crypto.subtle.generateKey(params, true, ['sign', 'verify'])) as CryptoKeyPair;
  const pub = (await crypto.subtle.exportKey('jwk', goodKey.publicKey)) as RsaJwk;
  jwks = { keys: [{ kty: 'RSA', n: pub.n, e: pub.e, kid: 'kid-1', alg: 'RS256', use: 'sig' }] };
});

describe('verifyGoogleIdToken', () => {
  it('accepts a valid token and returns the normalized identity', async () => {
    const res = await verify(await sign(claims()));
    expect(res).toEqual({
      ok: true,
      identity: { sub: '110169484474386276334', email: 'person@example.com', name: 'Test Person', givenName: 'Test', familyName: 'Person' },
    });
  });

  it('accepts the issuer without https://', async () => {
    expect((await verify(await sign(claims({ iss: 'accounts.google.com' })))).ok).toBe(true);
  });

  it('rejects a token signed by another key under a known kid', async () => {
    expect(await verify(await sign(claims(), { key: otherKey }))).toEqual({ ok: false, error: 'bad_signature' });
  });

  it('rejects a tampered payload', async () => {
    const token = await sign(claims());
    const [h, , s] = token.split('.');
    const forged = `${h}.${enc(claims({ email: 'admin@example.com' }))}.${s}`;
    expect(await verify(forged)).toEqual({ ok: false, error: 'bad_signature' });
  });

  it('rejects alg=none and HS256 tokens', async () => {
    const none = `${enc({ alg: 'none', kid: 'kid-1' })}.${enc(claims())}.`;
    expect(await verify(none)).toEqual({ ok: false, error: 'unsupported_alg' });
    expect(await verify(await sign(claims(), { alg: 'HS256' }))).toEqual({ ok: false, error: 'unsupported_alg' });
  });

  it('rejects an unknown kid after one forced JWKS refresh', async () => {
    const getJwks = vi.fn(async () => jwks);
    const res = await verify(await sign(claims(), { kid: 'rotated' }), { getJwks });
    expect(res).toEqual({ ok: false, error: 'unknown_key' });
    expect(getJwks.mock.calls).toEqual([[false], [true]]);
  });

  it('finds a rotated key on the forced refresh', async () => {
    const getJwks = vi.fn(async (force: boolean) => (force ? { keys: [{ ...jwks.keys[0], kid: 'new' }] } : jwks));
    expect((await verify(await sign(claims(), { kid: 'new' }), { getJwks })).ok).toBe(true);
  });

  it('rejects the wrong audience, and fails closed when no audience is configured', async () => {
    expect(await verify(await sign(claims({ aud: 'someone-else.apps.googleusercontent.com' })))).toEqual({ ok: false, error: 'bad_audience' });
    expect(await verify(await sign(claims()), { audience: '' })).toEqual({ ok: false, error: 'bad_audience' });
    expect(await verify(await sign(claims()), { audience: [] })).toEqual({ ok: false, error: 'bad_audience' });
  });

  it('accepts any of several audiences (desktop client and the Android web client id)', async () => {
    const android = 'android-web.apps.googleusercontent.com';
    expect((await verify(await sign(claims({ aud: android })), { audience: [AUD, android] })).ok).toBe(true);
    expect((await verify(await sign(claims()), { audience: [android, AUD] })).ok).toBe(true);
    expect(await verify(await sign(claims({ aud: 'other.apps.googleusercontent.com' })), { audience: [AUD, android] }))
      .toEqual({ ok: false, error: 'bad_audience' });
  });

  it('rejects the wrong issuer', async () => {
    expect(await verify(await sign(claims({ iss: 'https://evil.example.com' })))).toEqual({ ok: false, error: 'bad_issuer' });
    expect(await verify(await sign(claims({ iss: undefined })))).toEqual({ ok: false, error: 'bad_issuer' });
  });

  it('rejects expired tokens and tokens without exp', async () => {
    expect(await verify(await sign(claims({ exp: NOW - 120 })))).toEqual({ ok: false, error: 'expired' });
    expect(await verify(await sign(claims({ exp: undefined })))).toEqual({ ok: false, error: 'expired' });
  });

  it('allows small clock skew but rejects tokens issued in the future', async () => {
    expect((await verify(await sign(claims({ exp: NOW - 30 })))).ok).toBe(true);
    expect(await verify(await sign(claims({ iat: NOW + 600 })))).toEqual({ ok: false, error: 'not_yet_valid' });
  });

  it('rejects an unverified email', async () => {
    expect(await verify(await sign(claims({ email_verified: false })))).toEqual({ ok: false, error: 'email_not_verified' });
    expect(await verify(await sign(claims({ email_verified: undefined })))).toEqual({ ok: false, error: 'email_not_verified' });
  });

  it('rejects tokens without sub or email', async () => {
    expect(await verify(await sign(claims({ email: undefined })))).toEqual({ ok: false, error: 'missing_claims' });
    expect(await verify(await sign(claims({ sub: '' })))).toEqual({ ok: false, error: 'missing_claims' });
  });

  it('checks the nonce when one is expected', async () => {
    const token = await sign(claims({ nonce: 'n-1' }));
    expect((await verify(token, { expectedNonce: 'n-1' })).ok).toBe(true);
    expect(await verify(token, { expectedNonce: 'n-2' })).toEqual({ ok: false, error: 'bad_nonce' });
  });

  it('rejects malformed tokens', async () => {
    for (const t of ['', 'a.b', 'a.b.c.d', '!!!.???.***', `${enc('not json')}.${enc(claims())}.x`]) {
      expect(await verify(t)).toEqual({ ok: false, error: 'malformed' });
    }
  });
});

describe('createJwksCache', () => {
  function response(body: unknown, cacheControl = 'public, max-age=600') {
    return new Response(JSON.stringify(body), { status: 200, headers: { 'cache-control': cacheControl } });
  }

  it('caches for max-age and refetches after it', async () => {
    let t = 0;
    const fetchFn = vi.fn(async () => response(jwks));
    const get = createJwksCache(fetchFn as unknown as typeof fetch, 'https://example.test/certs', () => t);
    await get(false);
    t = 599_000;
    await get(false);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    t = 601_000;
    await get(false);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('rate-limits forced refreshes to one per 30 seconds', async () => {
    let t = 0;
    const fetchFn = vi.fn(async () => response(jwks));
    const get = createJwksCache(fetchFn as unknown as typeof fetch, 'https://example.test/certs', () => t);
    await get(false);
    await get(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    t = 31_000;
    await get(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('throws when Google returns an error or a malformed body', async () => {
    const bad = createJwksCache((async () => new Response('x', { status: 500 })) as unknown as typeof fetch);
    await expect(bad(false)).rejects.toThrow(/JWKS fetch failed/);
    const malformed = createJwksCache((async () => response({ nope: true })) as unknown as typeof fetch);
    await expect(malformed(false)).rejects.toThrow(/malformed/);
  });
});

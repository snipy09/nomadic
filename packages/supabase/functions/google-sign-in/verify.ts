// Google ID token verification for the google-sign-in Edge Function (SECURITY_CHECKLIST S9).
// Pure module: WebCrypto + fetch only, no Deno or Node APIs, so it runs in the Edge runtime and is unit-tested
// with vitest (packages/supabase/src/__tests__/google-id-token.test.ts).
//
// Checks, per https://developers.google.com/identity/openid-connect/openid-connect#validatinganidtoken :
//   - RS256 signature against Google's JWKS (https://www.googleapis.com/oauth2/v3/certs), key chosen by `kid`
//   - iss is accounts.google.com (with or without https://)
//   - aud is one of our OAuth client ids (read from Vault by the caller)
//   - exp is in the future and iat is not in the future (small clock skew allowed)
//   - email is present and email_verified is true
//   - nonce matches when the caller supplies one

export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
export const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

export interface RsaJwk {
  kty: string;
  kid?: string;
  n: string;
  e: string;
  alg?: string;
  use?: string;
}

export interface Jwks {
  keys: RsaJwk[];
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  name?: string;
  givenName?: string;
  familyName?: string;
}

export type VerifyResult = { ok: true; identity: GoogleIdentity } | { ok: false; error: VerifyError };

export type VerifyError =
  | 'malformed'
  | 'unsupported_alg'
  | 'unknown_key'
  | 'bad_signature'
  | 'bad_issuer'
  | 'bad_audience'
  | 'expired'
  | 'not_yet_valid'
  | 'email_not_verified'
  | 'missing_claims'
  | 'bad_nonce';

export interface VerifyOptions {
  /**
   * The OAuth client id(s) the token may be issued to (desktop client, and the web client id the Android app passes
   * to Credential Manager). Required; empty fails closed.
   */
  audience: string | string[];
  /** Returns the JWKS; called again with `forceRefresh` when the token's kid is not in the cached set. */
  getJwks: (forceRefresh: boolean) => Promise<Jwks>;
  /** Current time in seconds since the epoch (tests). */
  nowSeconds?: number;
  /** Allowed clock skew in seconds. */
  clockSkewSeconds?: number;
  /** When set, the token's `nonce` claim must equal it. */
  expectedNonce?: string;
}

function base64UrlToBytes(input: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(input)) throw new Error('not base64url');
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeJsonSegment(segment: string): Record<string, unknown> {
  const json = new TextDecoder().decode(base64UrlToBytes(segment));
  const value = JSON.parse(json);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
  return value as Record<string, unknown>;
}

async function verifyRs256(jwk: RsaJwk, signingInput: string, signature: Uint8Array): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature as BufferSource, new TextEncoder().encode(signingInput));
}

function findKey(jwks: Jwks | undefined, kid: string): RsaJwk | undefined {
  return jwks?.keys?.find((k) => k && k.kid === kid && k.kty === 'RSA' && (!k.use || k.use === 'sig'));
}

export async function verifyGoogleIdToken(token: string, opts: VerifyOptions): Promise<VerifyResult> {
  const audiences = (Array.isArray(opts.audience) ? opts.audience : [opts.audience]).filter((a) => typeof a === 'string' && a);
  if (audiences.length === 0) return { ok: false, error: 'bad_audience' };
  if (typeof token !== 'string' || token.length > 8192) return { ok: false, error: 'malformed' };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, error: 'malformed' };

  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  let signature: Uint8Array;
  try {
    header = decodeJsonSegment(parts[0]);
    claims = decodeJsonSegment(parts[1]);
    signature = base64UrlToBytes(parts[2]);
  } catch {
    return { ok: false, error: 'malformed' };
  }

  if (header.alg !== 'RS256') return { ok: false, error: 'unsupported_alg' };
  const kid = typeof header.kid === 'string' ? header.kid : '';
  if (!kid) return { ok: false, error: 'unknown_key' };

  let jwk = findKey(await opts.getJwks(false), kid);
  if (!jwk) jwk = findKey(await opts.getJwks(true), kid); // Google rotates keys; refetch once.
  if (!jwk) return { ok: false, error: 'unknown_key' };

  let valid = false;
  try {
    valid = await verifyRs256(jwk, `${parts[0]}.${parts[1]}`, signature);
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, error: 'bad_signature' };

  if (typeof claims.iss !== 'string' || !GOOGLE_ISSUERS.includes(claims.iss)) return { ok: false, error: 'bad_issuer' };

  const aud = claims.aud;
  const audOk = typeof aud === 'string' ? audiences.includes(aud) : Array.isArray(aud) && aud.some((a) => audiences.includes(a));
  if (!audOk) return { ok: false, error: 'bad_audience' };

  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  const skew = opts.clockSkewSeconds ?? 60;
  if (typeof claims.exp !== 'number' || claims.exp + skew <= now) return { ok: false, error: 'expired' };
  if (typeof claims.iat === 'number' && claims.iat - skew > now) return { ok: false, error: 'not_yet_valid' };

  if (opts.expectedNonce !== undefined && claims.nonce !== opts.expectedNonce) return { ok: false, error: 'bad_nonce' };

  const sub = typeof claims.sub === 'string' ? claims.sub : '';
  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
  if (!sub || !email) return { ok: false, error: 'missing_claims' };
  if (claims.email_verified !== true && claims.email_verified !== 'true') return { ok: false, error: 'email_not_verified' };

  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  return {
    ok: true,
    identity: {
      sub,
      email,
      name: str(claims.name),
      givenName: str(claims.given_name),
      familyName: str(claims.family_name),
    },
  };
}

/**
 * Caches Google's JWKS in memory for its Cache-Control max-age (bounded to 1 min .. 24 h).
 * `forceRefresh` refetches, at most once per 30 s, so unknown-kid tokens cannot hammer Google.
 */
export function createJwksCache(fetchFn: typeof fetch = fetch, url = GOOGLE_JWKS_URL, clock: () => number = Date.now) {
  let cached: Jwks | null = null;
  let expiresAt = 0;
  let lastFetch = 0;

  async function load(): Promise<Jwks> {
    lastFetch = clock();
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
    const body = (await res.json()) as Jwks;
    if (!body || !Array.isArray(body.keys)) throw new Error('JWKS malformed');
    const m = /max-age=(\d+)/i.exec(res.headers.get('cache-control') ?? '');
    const maxAge = Math.min(Math.max(m ? Number(m[1]) : 3600, 60), 86400);
    cached = body;
    expiresAt = clock() + maxAge * 1000;
    return body;
  }

  return async function getJwks(forceRefresh: boolean): Promise<Jwks> {
    const now = clock();
    if (cached && now < expiresAt && (!forceRefresh || now - lastFetch < 30_000)) return cached;
    return load();
  };
}

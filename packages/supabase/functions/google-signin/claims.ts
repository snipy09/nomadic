// Pure checks for the google-signin Edge Function. No Deno or network imports, so
// they are unit-tested from packages/supabase/src/__tests__/google-signin-claims.test.ts.

export interface SignInRequest {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  nonce: string;
}

export interface VerifiedGoogleIdentity {
  sub: string;
  email: string;
  name: string | null;
}

// Desktop loopback redirect only (RFC 8252 section 7.3). Any other redirect is refused so the
// function cannot be used to exchange codes issued to other redirect targets.
const LOOPBACK_REDIRECT = /^http:\/\/127\.0\.0\.1:\d{1,5}\/callback$/;
// RFC 7636: verifier is 43-128 chars of [A-Z a-z 0-9 - . _ ~].
const PKCE_VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
const NONCE = /^[A-Za-z0-9\-_]{16,128}$/;

export function parseSignInRequest(body: unknown): SignInRequest | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Invalid request.' };
  const b = body as Record<string, unknown>;
  const code = typeof b.code === 'string' ? b.code : '';
  const codeVerifier = typeof b.code_verifier === 'string' ? b.code_verifier : '';
  const redirectUri = typeof b.redirect_uri === 'string' ? b.redirect_uri : '';
  const nonce = typeof b.nonce === 'string' ? b.nonce : '';
  if (!code || code.length > 2048) return { error: 'Missing authorization code.' };
  if (!PKCE_VERIFIER.test(codeVerifier)) return { error: 'Invalid PKCE verifier.' };
  if (!LOOPBACK_REDIRECT.test(redirectUri)) return { error: 'Invalid redirect URI.' };
  if (!NONCE.test(nonce)) return { error: 'Invalid nonce.' };
  return { code, codeVerifier, redirectUri, nonce };
}

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

/**
 * Claim checks on an ID token whose signature has already been verified against Google's JWKS.
 * Re-checks issuer, audience and expiry (defence in depth) and enforces the nonce and a verified email.
 */
export function checkIdTokenClaims(
  payload: Record<string, unknown>,
  opts: { clientId: string; nonce: string; nowSeconds: number }
): VerifiedGoogleIdentity | { error: string } {
  const aud = payload.aud;
  const audOk = Array.isArray(aud) ? aud.includes(opts.clientId) : aud === opts.clientId;
  if (!audOk) return { error: 'Token was issued to a different app.' };
  if (!GOOGLE_ISSUERS.includes(String(payload.iss))) return { error: 'Token was not issued by Google.' };
  if (typeof payload.exp !== 'number' || payload.exp <= opts.nowSeconds) return { error: 'Token has expired.' };
  if (payload.nonce !== opts.nonce) return { error: 'Sign-in request did not match. Try again.' };
  // Google sends email_verified as a boolean; older tokens used the string "true".
  if (payload.email_verified !== true && payload.email_verified !== 'true') {
    return { error: 'Your Google account email is not verified.' };
  }
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const sub = typeof payload.sub === 'string' ? payload.sub : '';
  if (!email || !sub) return { error: 'Google did not return an email address.' };
  const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : null;
  return { sub, email, name };
}

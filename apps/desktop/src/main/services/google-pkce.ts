import crypto from 'crypto';

// Pure helpers for Google sign-in with PKCE (RFC 7636) on a loopback redirect (RFC 8252).
// No client secret is involved on the desktop: the google-signin Edge Function holds it.

export const GOOGLE_LOOPBACK_PORT = 42813;
// IP literal, not "localhost": the listener binds 127.0.0.1 and localhost can resolve to ::1.
export const GOOGLE_REDIRECT_URI = `http://127.0.0.1:${GOOGLE_LOOPBACK_PORT}/callback`;

export interface PendingGoogleSignIn {
  codeVerifier: string;
  state: string;
  nonce: string;
  redirectUri: string;
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomUrlToken(bytes = 32): string {
  return base64url(crypto.randomBytes(bytes));
}

/** S256 challenge for a verifier. */
export function pkceChallenge(codeVerifier: string): string {
  return base64url(crypto.createHash('sha256').update(codeVerifier).digest());
}

export function createPendingSignIn(): PendingGoogleSignIn {
  // 32 random bytes -> 43 base64url chars, the RFC 7636 minimum verifier length.
  return { codeVerifier: randomUrlToken(32), state: randomUrlToken(24), nonce: randomUrlToken(24), redirectUri: GOOGLE_REDIRECT_URI };
}

export function buildGoogleAuthUrl(clientId: string, pending: PendingGoogleSignIn): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: pending.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    code_challenge: pkceChallenge(pending.codeVerifier),
    code_challenge_method: 'S256',
    state: pending.state,
    nonce: pending.nonce,
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** Constant-time comparison of the returned state with the one we sent. */
export function stateMatches(expected: string, received: string | null): boolean {
  if (!received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

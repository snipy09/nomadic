import { describe, it, expect } from 'vitest';
import { checkIdTokenClaims, parseSignInRequest } from '../../functions/google-signin/claims';

const CLIENT_ID = 'client-123.apps.googleusercontent.com';
const NOW = 1_800_000_000;
const VERIFIER = 'a'.repeat(43);

function claims(overrides: Record<string, unknown> = {}) {
  return {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    exp: NOW + 600,
    nonce: 'nonce-abcdefghijkl',
    sub: '1234567890',
    email: 'Student@Gmail.com',
    email_verified: true,
    name: 'A Student',
    ...overrides,
  };
}

const opts = { clientId: CLIENT_ID, nonce: 'nonce-abcdefghijkl', nowSeconds: NOW };

describe('parseSignInRequest', () => {
  const good = { code: '4/abc', code_verifier: VERIFIER, redirect_uri: 'http://127.0.0.1:42813/callback', nonce: 'nonce-abcdefghijkl' };

  it('accepts a loopback PKCE request', () => {
    expect(parseSignInRequest(good)).toEqual({
      code: '4/abc', codeVerifier: VERIFIER, redirectUri: 'http://127.0.0.1:42813/callback', nonce: 'nonce-abcdefghijkl',
    });
  });

  it('refuses non-loopback redirects', () => {
    for (const redirect_uri of ['https://evil.example/callback', 'http://127.0.0.1.evil.example:80/callback', 'http://localhost:42813/callback']) {
      expect(parseSignInRequest({ ...good, redirect_uri })).toEqual({ error: 'Invalid redirect URI.' });
    }
  });

  it('refuses a missing code, a short verifier, a bad nonce or a non-object body', () => {
    expect(parseSignInRequest({ ...good, code: '' })).toEqual({ error: 'Missing authorization code.' });
    expect(parseSignInRequest({ ...good, code_verifier: 'short' })).toEqual({ error: 'Invalid PKCE verifier.' });
    expect(parseSignInRequest({ ...good, nonce: 'x' })).toEqual({ error: 'Invalid nonce.' });
    expect(parseSignInRequest(null)).toEqual({ error: 'Invalid request.' });
  });
});

describe('checkIdTokenClaims', () => {
  it('returns the verified identity with a lower-cased email', () => {
    expect(checkIdTokenClaims(claims(), opts)).toEqual({ sub: '1234567890', email: 'student@gmail.com', name: 'A Student' });
  });

  it('rejects tokens for another audience, issuer, expired, or with a different nonce', () => {
    expect(checkIdTokenClaims(claims({ aud: 'other' }), opts)).toEqual({ error: 'Token was issued to a different app.' });
    expect(checkIdTokenClaims(claims({ iss: 'https://evil.example' }), opts)).toEqual({ error: 'Token was not issued by Google.' });
    expect(checkIdTokenClaims(claims({ exp: NOW }), opts)).toEqual({ error: 'Token has expired.' });
    expect(checkIdTokenClaims(claims({ nonce: 'replayed-nonce-xyz' }), opts)).toEqual({ error: 'Sign-in request did not match. Try again.' });
  });

  it('requires a verified email', () => {
    expect(checkIdTokenClaims(claims({ email_verified: false }), opts)).toEqual({ error: 'Your Google account email is not verified.' });
    expect(checkIdTokenClaims(claims({ email_verified: undefined }), opts)).toEqual({ error: 'Your Google account email is not verified.' });
    expect(checkIdTokenClaims(claims({ email_verified: 'true' }), opts)).toEqual({ sub: '1234567890', email: 'student@gmail.com', name: 'A Student' });
    expect(checkIdTokenClaims(claims({ email: '' }), opts)).toEqual({ error: 'Google did not return an email address.' });
  });

  it('accepts an audience array that contains the client id and returns null for a missing name', () => {
    expect(checkIdTokenClaims(claims({ aud: ['x', CLIENT_ID], name: '  ' }), opts)).toEqual({
      sub: '1234567890', email: 'student@gmail.com', name: null,
    });
  });
});

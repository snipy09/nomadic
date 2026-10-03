// google-signin: server-side Google sign-in (SECURITY_CHECKLIST S9).
//
// The desktop runs the authorization-code flow with PKCE against a loopback redirect and sends
// { code, code_verifier, redirect_uri, nonce } here. This function:
//   1. exchanges the code with Google using the client secret held as a Supabase secret
//      (Google's token endpoint requires it for Desktop clients even with PKCE, so it must not ship in the app),
//   2. verifies the ID token signature against Google's JWKS plus issuer, audience, expiry, nonce and email_verified,
//   3. calls google_signin() (migration 015, service role only), which finds or creates the user by the
//      verified email and returns the same row as authenticate_user, including a one-time login_ticket.
//
// Secrets: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET (supabase secrets set ...).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
import { createClient } from 'npm:@supabase/supabase-js@2.39.0';
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5.2.0';
import { checkIdTokenClaims, parseSignInRequest } from './claims.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID') || '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET') || '';

const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, reason: 'Method not allowed.' });
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[google-signin] Missing GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET or Supabase env.');
    return json(503, { ok: false, reason: 'Google sign-in is not configured on the server.' });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, reason: 'Invalid request.' });
  }
  const parsed = parseSignInRequest(body);
  if ('error' in parsed) return json(400, { ok: false, reason: parsed.error });

  // 1. Code exchange (PKCE-bound: Google checks code_verifier against the original code_challenge).
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: parsed.code,
      code_verifier: parsed.codeVerifier,
      redirect_uri: parsed.redirectUri,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: 'authorization_code',
    }).toString(),
  });
  if (!tokenRes.ok) {
    console.error(`[google-signin] Token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
    return json(401, { ok: false, reason: 'Google rejected the sign-in. Try again.' });
  }
  const tokenData = (await tokenRes.json()) as { id_token?: unknown };
  if (typeof tokenData.id_token !== 'string') {
    return json(401, { ok: false, reason: 'Google did not return an ID token.' });
  }

  // 2. Signature + standard claims, then our own claim checks.
  let payload: Record<string, unknown>;
  try {
    const verified = await jwtVerify(tokenData.id_token, googleJwks, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: GOOGLE_CLIENT_ID,
    });
    payload = verified.payload as Record<string, unknown>;
  } catch (err) {
    console.error(`[google-signin] ID token verification failed: ${err instanceof Error ? err.message : err}`);
    return json(401, { ok: false, reason: 'Could not verify the Google sign-in.' });
  }
  const identity = checkIdTokenClaims(payload, {
    clientId: GOOGLE_CLIENT_ID,
    nonce: parsed.nonce,
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  if ('error' in identity) return json(401, { ok: false, reason: identity.error });

  // 3. Find or create the account and issue a login ticket.
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc('google_signin', {
    p_email: identity.email,
    p_google_sub: identity.sub,
    p_full_name: identity.name,
  });
  if (error) {
    console.error(`[google-signin] google_signin RPC failed: ${error.message}`);
    return json(500, { ok: false, reason: 'Sign-in failed on the server. Try again.' });
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return json(500, { ok: false, reason: 'Sign-in failed on the server. Try again.' });
  // Refusals (suspended, expired, linked to another Google account) carry ok=false and a reason.
  return json(200, row as Record<string, unknown>);
});

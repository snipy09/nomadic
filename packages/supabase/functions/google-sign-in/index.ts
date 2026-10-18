// google-sign-in Edge Function (SECURITY_CHECKLIST S9, DECISIONS #24).
//
// POST { id_token, nonce? } with the anon key as bearer (the desktop app). Verifies the Google ID token server-side
// (signature via Google's JWKS, iss, aud in the comma-separated client ids stored in Vault as `google_oauth_client_id`
// — the desktop client, plus the web client id the Android app uses — exp,
// email_verified), then calls the service_role-only RPC google_sign_in (migration 021), which finds/links/creates the
// users_profile row and returns the same row shape as authenticate_user, including a single-use login_ticket. The
// desktop registers the device with that ticket exactly like password sign-in.
//
// Deploy: supabase functions deploy google-sign-in  (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided by the
// platform; no other environment variables are needed).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { createJwksCache, verifyGoogleIdToken } from './verify.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const getJwks = createJwksCache();
const NOT_VERIFIED = 'Google sign-in could not be verified.';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

let cachedClientId: { value: string; at: number } | null = null;

async function getClientId(supabase: ReturnType<typeof createClient>): Promise<string> {
  if (cachedClientId && Date.now() - cachedClientId.at < 5 * 60_000) return cachedClientId.value;
  const { data, error } = await supabase.rpc('server_secret', { p_name: 'google_oauth_client_id' });
  if (error) throw new Error(`server_secret: ${error.message}`);
  const value = typeof data === 'string' ? data.trim() : '';
  if (value) cachedClientId = { value, at: Date.now() };
  return value;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { ok: false, reason: 'Method Not Allowed' });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(503, { ok: false, reason: 'Google sign-in is not configured on the server.' });
  }

  let idToken = '';
  let nonce: string | undefined;
  try {
    const body = await req.json();
    idToken = typeof body?.id_token === 'string' ? body.id_token : '';
    nonce = typeof body?.nonce === 'string' && body.nonce ? body.nonce : undefined;
  } catch {
    return json(400, { ok: false, reason: 'Invalid request.' });
  }
  if (!idToken) return json(400, { ok: false, reason: 'Invalid request.' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const audience = await getClientId(supabase);
    if (!audience) {
      console.error('[google-sign-in] Vault secret google_oauth_client_id is not set.');
      return json(503, { ok: false, reason: 'Google sign-in is not configured on the server.' });
    }

    // The Vault value may list several client ids separated by commas: the desktop client and the web client id the
    // Android app asks Credential Manager for (its tokens carry that id as aud).
    const audiences = audience.split(',').map((s) => s.trim()).filter(Boolean);
    const result = await verifyGoogleIdToken(idToken, { audience: audiences, getJwks, expectedNonce: nonce });
    if (!result.ok) {
      console.warn(`[google-sign-in] Token rejected: ${result.error}`);
      return json(401, { ok: false, reason: NOT_VERIFIED });
    }

    const { identity } = result;
    const { data, error } = await supabase.rpc('google_sign_in', {
      p_email: identity.email,
      p_google_sub: identity.sub,
      p_full_name: identity.name ?? null,
    });
    if (error) {
      console.error('[google-sign-in] google_sign_in RPC error:', error.message);
      return json(500, { ok: false, reason: 'Sign-in failed. Please try again.' });
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return json(500, { ok: false, reason: 'Sign-in failed. Please try again.' });
    // Same row as authenticate_user (ok, reason, id, email, full_name, tier, role, status, license_key, expires_at,
    // apps_count, login_ticket). given/family name help the desktop seed the onboarding profile.
    return json(200, { ...row, given_name: identity.givenName ?? null, family_name: identity.familyName ?? null });
  } catch (err) {
    console.error('[google-sign-in] Exception:', err instanceof Error ? err.message : String(err));
    return json(500, { ok: false, reason: 'Sign-in failed. Please try again.' });
  }
});

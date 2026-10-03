import { shell } from 'electron';
import http from 'http';
import crypto from 'crypto';
import type { OAuthCallbackPayload } from '../../shared/ipc.js';
import { focusMainWindow, log, sendToRenderer } from './app-context.js';
import { getAnonSupabase } from './supabase.js';
import { isOnboardingCompleted, seedProfileIdentity } from './profile.js';
import { hashLogin, identifyDevice, startServerSession } from './auth.js';

// ── Google sign-in (SECURITY_CHECKLIST S9, DECISIONS #24) ──────────────────
// Installed-app OAuth flow: authorization code + PKCE (S256) + state + nonce, redirected to a loopback listener on
// 127.0.0.1:42813. The code is exchanged for a Google ID token, which the `google-sign-in` Edge Function verifies
// server-side and turns into the same row as authenticate_user (with a single-use login ticket). From there the
// session starts exactly like password sign-in (startServerSession in auth.ts): device registration with the
// ticket, heartbeat, cloud pull. Role and tier come only from that server row; nothing here touches users_profile.
//
// Client secret: Google's "Desktop app" client type still requires `client_secret` at the token endpoint even with
// PKCE. Google documents it as not confidential for installed apps (it cannot be kept secret in a shipped binary);
// PKCE is what protects the code. It is injected from the build environment (GOOGLE_OAUTH_CLIENT_SECRET, see
// build-main.mjs), never committed, and omitted from the request when empty.

const OAUTH_PORT = 42813;
export const GOOGLE_REDIRECT_URI = `http://127.0.0.1:${OAUTH_PORT}/callback`;
const FLOW_TTL_MS = 10 * 60_000;

// Injected at build time from GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET (see build-main.mjs).
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

export interface PendingFlow {
  state: string;
  codeVerifier: string;
  nonce: string;
  redirectUri: string;
  forceTakeover: boolean;
  createdAt: number;
}

let pendingFlow: PendingFlow | null = null;
let oauthServer: http.Server | null = null;
let oauthTimeoutTimer: NodeJS.Timeout | null = null;

export function closeOAuthServer(): void {
  if (oauthTimeoutTimer) {
    clearTimeout(oauthTimeoutTimer);
    oauthTimeoutTimer = null;
  }
  if (oauthServer) {
    try {
      oauthServer.close();
      oauthServer.closeAllConnections();
    } catch { /* already closed */ }
    oauthServer = null;
  }
}

const randomUrlToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

/** RFC 7636 code verifier (43 chars) and its S256 challenge. */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomUrlToken(32);
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function buildGoogleAuthUrl(
  clientId: string,
  p: { challenge: string; state: string; nonce: string; redirectUri: string }
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: p.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
    state: p.state,
    nonce: p.nonce,
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** Exchanges the authorization code (with the PKCE verifier) for a Google ID token. */
export async function exchangeCodeForIdToken(code: string, flow: PendingFlow): Promise<string> {
  const params = new URLSearchParams({
    code,
    client_id: GOOGLE_CLIENT_ID,
    code_verifier: flow.codeVerifier,
    redirect_uri: flow.redirectUri,
    grant_type: 'authorization_code',
  });
  if (GOOGLE_CLIENT_SECRET) params.set('client_secret', GOOGLE_CLIENT_SECRET);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) {
    log(`[Google OAuth] Token exchange failed (${res.status}).`);
    throw new Error('Google did not accept the sign-in. Try again.');
  }
  const body = (await res.json()) as { id_token?: unknown };
  if (typeof body.id_token !== 'string' || !body.id_token) {
    throw new Error('Google did not return an ID token.');
  }
  return body.id_token;
}

/**
 * Sends the Google ID token to the google-sign-in Edge Function (anon key as bearer), then starts the server
 * session with the returned row exactly like password sign-in.
 */
export async function signInWithGoogleIdToken(
  idToken: string,
  opts: { nonce?: string; forceTakeover?: boolean } = {}
): Promise<OAuthCallbackPayload> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const supabase = getAnonSupabase();
  if (!supabaseUrl || !anonKey || !supabase) {
    return { success: false, error: 'Licensing server is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.' };
  }

  let row: Record<string, any> | undefined;
  try {
    const res = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/functions/v1/google-sign-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ id_token: idToken, nonce: opts.nonce }),
    });
    const body = (await res.json().catch(() => null)) as Record<string, any> | null;
    if (!body) {
      log(`[Google OAuth] google-sign-in returned ${res.status} with no JSON body.`);
      return { success: false, error: 'Could not reach the sign-in server. Check your connection and try again.' };
    }
    row = body;
  } catch (err: unknown) {
    log(`[Google OAuth] google-sign-in unreachable: ${err instanceof Error ? err.message : String(err)}`);
    return { success: false, error: 'Could not reach the sign-in server. Check your connection and try again.' };
  }

  if (!row.ok || !row.id) {
    return { success: false, error: String(row.reason || 'Google sign-in failed.') };
  }

  const { deviceFingerprint, deviceName } = identifyDevice();
  const result = await startServerSession(supabase, row, {
    forceTakeover: Boolean(opts.forceTakeover),
    // Random, never shown: a Google account must not be usable for the offline password fallback.
    offlineCredentialHash: hashLogin(String(row.email), crypto.randomBytes(32).toString('hex')),
    deviceFingerprint,
    deviceName,
    source: 'Google',
  });

  if (result.success && result.user && !isOnboardingCompleted()) {
    try {
      const fullName = result.user.fullName || '';
      const given = typeof row.given_name === 'string' && row.given_name ? row.given_name : fullName.split(' ')[0] || '';
      const family = typeof row.family_name === 'string' && row.family_name
        ? row.family_name
        : fullName.split(' ').slice(1).join(' ');
      seedProfileIdentity(given, family, result.user.email);
    } catch (e: unknown) {
      log(`[Google OAuth] Profile seed note: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}

/** Validates the callback against the pending flow (state, age), exchanges the code and signs in. */
export async function completeGoogleSignIn(code: string, state: string | null): Promise<OAuthCallbackPayload> {
  const flow = pendingFlow;
  if (!flow || !state || state !== flow.state || Date.now() - flow.createdAt > FLOW_TTL_MS) {
    log('[Google OAuth] Callback rejected: unknown, mismatched or expired state.');
    return { success: false, error: 'This sign-in link is no longer valid. Start Google sign-in again.' };
  }
  pendingFlow = null; // single use

  try {
    const idToken = await exchangeCodeForIdToken(code, flow);
    return await signInWithGoogleIdToken(idToken, { nonce: flow.nonce, forceTakeover: flow.forceTakeover });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[Google OAuth] Sign-in failed: ${msg}`);
    return { success: false, error: msg };
  }
}

async function handleCallbackParams(params: URLSearchParams): Promise<OAuthCallbackPayload | null> {
  const error = params.get('error');
  const code = params.get('code');
  if (error) {
    pendingFlow = null;
    return { success: false, error: error === 'access_denied' ? 'Google sign-in was cancelled.' : error };
  }
  if (code) return completeGoogleSignIn(code, params.get('state'));
  return null;
}

/** nomadic:// deep links. Only a code with the pending flow's state is accepted. */
export async function handleProtocolUrl(rawUrl: string): Promise<void> {
  try {
    const queryIdx = rawUrl.indexOf('?');
    if (queryIdx === -1) return;
    const result = await handleCallbackParams(new URLSearchParams(rawUrl.substring(queryIdx + 1)));
    if (result) {
      sendToRenderer('oauth-callback', result);
      focusMainWindow();
    }
  } catch (err: any) {
    log(`[Deep Link] Protocol error: ${err?.message || String(err)}`);
  }
}

function callbackPage(ok: boolean, message: string): string {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
  <title>Nomadic sign-in</title>
  <style>
    body { background: #09090b; color: #fafafa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #121215; border: 1px solid #27272a; border-radius: 20px; padding: 36px 32px; text-align: center; max-width: 420px; }
    h2 { margin: 0 0 8px; font-size: 20px; }
    p { margin: 0; color: #a1a1aa; font-size: 13px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <h2>${ok ? 'Signed in' : 'Sign-in did not finish'}</h2>
    <p>${esc(message)}</p>
  </div>
</body>
</html>`;
}

function startOAuthLoopbackServer(): Promise<boolean> {
  return new Promise((resolve) => {
    closeOAuthServer();

    const server = http.createServer(async (req, res) => {
      const parsedUrl = new URL(req.url || '/', GOOGLE_REDIRECT_URI);
      if (req.method !== 'GET' || parsedUrl.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }

      const result = await handleCallbackParams(parsedUrl.searchParams);
      if (!result) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(callbackPage(false, 'Return to Nomadic and start Google sign-in again.'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(callbackPage(
        result.success,
        result.success ? 'You can close this tab and return to Nomadic.' : `${result.error ?? 'Sign-in failed.'} Return to Nomadic to try again.`
      ));
      sendToRenderer('oauth-callback', result);
      focusMainWindow();
      setTimeout(() => { if (oauthServer === server) closeOAuthServer(); }, 1000);
    });
    oauthServer = server;

    server.on('error', (err: any) => {
      log(`[OAuth Server] Loopback listener failed: ${err.message}`);
      resolve(false);
    });

    server.listen(OAUTH_PORT, '127.0.0.1', () => {
      log(`[OAuth Server] Loopback listener active on ${GOOGLE_REDIRECT_URI}`);
      resolve(true);
    });

    oauthTimeoutTimer = setTimeout(() => {
      log('[OAuth Server] Loopback listener closed after idle timeout.');
      pendingFlow = null;
      closeOAuthServer();
    }, FLOW_TTL_MS);
  });
}

/** Business logic behind the `auth-google` channel. */
export async function startGoogleSignIn(
  options: { forceTakeover?: boolean } = {}
): Promise<{ success: boolean; error?: string }> {
  if (!GOOGLE_CLIENT_ID) {
    log('[Google OAuth] GOOGLE_OAUTH_CLIENT_ID was not provided at build time — Google sign-in disabled.');
    return { success: false, error: 'Google sign-in is not configured for this build.' };
  }

  if (!(await startOAuthLoopbackServer())) {
    return { success: false, error: `Could not open the local sign-in port ${OAUTH_PORT}. Close other Nomadic windows and try again.` };
  }

  const { verifier, challenge } = createPkcePair();
  pendingFlow = {
    state: randomUrlToken(24),
    codeVerifier: verifier,
    nonce: randomUrlToken(24),
    redirectUri: GOOGLE_REDIRECT_URI,
    forceTakeover: Boolean(options.forceTakeover),
    createdAt: Date.now(),
  };

  const authUrl = buildGoogleAuthUrl(GOOGLE_CLIENT_ID, {
    challenge,
    state: pendingFlow.state,
    nonce: pendingFlow.nonce,
    redirectUri: pendingFlow.redirectUri,
  });
  log('[Google OAuth] Opening Google sign-in in the default browser.');
  try {
    await shell.openExternal(authUrl);
  } catch (err: unknown) {
    log(`[Google OAuth] Could not open the browser: ${err instanceof Error ? err.message : String(err)}`);
    return { success: false, error: 'Could not open Google sign-in in your browser.' };
  }
  return { success: true };
}

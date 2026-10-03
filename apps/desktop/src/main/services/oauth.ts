import { shell } from 'electron';
import http from 'http';
import crypto from 'crypto';
import { registerDeviceSession } from '@job-automator/supabase';
import type { OAuthCallbackPayload } from '../../shared/ipc.js';
import { focusMainWindow, log, sendToRenderer } from './app-context.js';
import { session, resolvePublicIp, startHeartbeatLoop } from './session.js';
import { getAnonSupabase } from './supabase.js';
import { syncPullUserDataToLocalDb } from './cloud-sync.js';
import { isOnboardingCompleted, seedProfileIdentity } from './profile.js';
import { cacheValidatedUser, identifyDevice, readLoginTicket, userFromAuthRow } from './auth.js';
import {
  GOOGLE_LOOPBACK_PORT,
  buildGoogleAuthUrl,
  createPendingSignIn,
  stateMatches,
  type PendingGoogleSignIn,
} from './google-pkce.js';

// ── Google sign-in (SECURITY_CHECKLIST S9) ────────────────────────────────
// Authorization-code flow with PKCE on a loopback redirect. The desktop never
// holds a client secret and never trusts a Google profile itself: it sends the
// code + verifier to the google-signin Edge Function, which exchanges it,
// verifies the ID token and returns the same row as authenticate_user with a
// one-time login ticket. The device is then registered exactly like password
// sign-in.

// Injected at build time from GOOGLE_OAUTH_CLIENT_ID (see build-main.mjs). The client id is public.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const SIGN_IN_TIMEOUT_MS = 180_000;

let oauthServer: http.Server | null = null;
let oauthTimeoutTimer: NodeJS.Timeout | null = null;
let pending: PendingGoogleSignIn | null = null;

export function closeOAuthServer(): void {
  if (oauthTimeoutTimer) {
    clearTimeout(oauthTimeoutTimer);
    oauthTimeoutTimer = null;
  }
  if (oauthServer) {
    try { oauthServer.close(); } catch {}
    oauthServer = null;
  }
}

/**
 * Sends the PKCE-bound code to the google-signin Edge Function and, on success,
 * registers this device with the returned login ticket.
 */
export async function completeGoogleSignIn(code: string, flow: PendingGoogleSignIn): Promise<OAuthCallbackPayload> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const supabase = getAnonSupabase();
  if (!supabaseUrl || !anonKey || !supabase) {
    return { success: false, error: 'Google sign-in needs the licensing server, which is not configured.' };
  }

  let row: Record<string, any> | undefined;
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/google-signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify({
        code,
        code_verifier: flow.codeVerifier,
        redirect_uri: flow.redirectUri,
        nonce: flow.nonce,
      }),
    });
    row = (await res.json().catch(() => undefined)) as Record<string, any> | undefined;
    if (!res.ok && !row?.reason) {
      log(`[Google OAuth] Server sign-in failed with HTTP ${res.status}`);
      return { success: false, error: 'Google sign-in failed on the server. Try again.' };
    }
  } catch (err: unknown) {
    log(`[Google OAuth] Server unreachable: ${err instanceof Error ? err.message : String(err)}`);
    return { success: false, error: 'Could not reach the server to finish Google sign-in. Check your connection.' };
  }

  if (!row || !row.ok) {
    return { success: false, error: String(row?.reason || 'Google sign-in failed. Try again.') };
  }

  const user = userFromAuthRow(row);
  const { deviceFingerprint, deviceName } = identifyDevice();
  const clientIp = await resolvePublicIp().catch(() => '127.0.0.1');
  const sessionToken = crypto.randomUUID();

  const devReg = await registerDeviceSession(
    supabase, user.id, sessionToken, deviceFingerprint, deviceName, clientIp, false, readLoginTicket(row)
  );
  if (devReg.conflict) {
    // The ticket is single use, so a takeover needs a fresh sign-in; password sign-in offers that prompt.
    return {
      success: false,
      error: `${devReg.reason || 'Account is currently active on another device.'} Sign out there, or sign in with your password to move the session here.`,
    };
  }
  if (!devReg.ok) {
    log(`[Google OAuth] Device registration failed: ${devReg.reason ?? 'unknown'}`);
    return { success: false, error: 'Could not start a session for this device. Try signing in again.' };
  }

  session.userId = user.id;
  session.sessionToken = sessionToken;
  // No password exists for this sign-in: cache an unguessable value so the offline
  // password fallback can never match it.
  cacheValidatedUser(user, crypto.randomBytes(32).toString('hex'));
  startHeartbeatLoop(user.id, sessionToken, deviceFingerprint);
  await syncPullUserDataToLocalDb(user.id, sessionToken, deviceFingerprint).catch(() => {});

  const onboardingCompleted = isOnboardingCompleted();
  if (!onboardingCompleted) {
    try {
      const parts = user.fullName.trim().split(/\s+/);
      seedProfileIdentity(parts[0] || '', parts.slice(1).join(' '), user.email);
    } catch {}
  }

  log(`[Google OAuth] Signed in via server: ${user.email} (${user.tier.toUpperCase()}) on [${deviceName}] ✓`);
  return {
    success: true,
    user: { ...user, onboardingCompleted, sessionToken, deviceFingerprint, deviceName },
  };
}

/** Validates a callback against the in-flight sign-in and completes it. Single use. */
export async function handleGoogleCallback(params: URLSearchParams): Promise<OAuthCallbackPayload> {
  const flow = pending;
  const error = params.get('error');
  if (!flow) return { success: false, error: 'No Google sign-in is in progress. Start again from Nomadic.' };
  if (!stateMatches(flow.state, params.get('state'))) {
    return { success: false, error: 'Sign-in response did not match this request. Start again from Nomadic.' };
  }
  pending = null;
  if (error) return { success: false, error: error === 'access_denied' ? 'Google sign-in was cancelled.' : `Google sign-in failed (${error}).` };
  const code = params.get('code');
  if (!code) return { success: false, error: 'Google did not return an authorization code.' };
  return completeGoogleSignIn(code, flow);
}

/** `nomadic://` deep links. Accepted only for the in-flight sign-in (state must match). */
export async function handleProtocolUrl(rawUrl: string): Promise<void> {
  try {
    const queryIdx = rawUrl.indexOf('?');
    if (queryIdx === -1) return;
    const params = new URLSearchParams(rawUrl.substring(queryIdx + 1));
    if (!params.get('code') && !params.get('error')) return;
    const result = await handleGoogleCallback(params);
    sendToRenderer('oauth-callback', result);
    focusMainWindow();
  } catch (err: any) {
    log(`[Deep Link] Protocol error: ${err?.message || String(err)}`);
  }
}

const CALLBACK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Nomadic sign-in</title>
  <style>
    body { background: #09090b; color: #fafafa; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { border: 1px solid #27272a; border-radius: 16px; padding: 32px; text-align: center; max-width: 420px; }
    p { color: #a1a1aa; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Return to Nomadic</h2>
    <p>Nomadic is finishing your sign-in. You can close this tab.</p>
  </div>
</body>
</html>`;

function startLoopbackServer(): Promise<boolean> {
  return new Promise((resolve) => {
    closeOAuthServer();
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://127.0.0.1:${GOOGLE_LOOPBACK_PORT}`);
      if (req.method !== 'GET' || url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(CALLBACK_HTML);
      // Ignore stray requests that are not for the in-flight sign-in (state checked inside).
      void handleGoogleCallback(url.searchParams).then((result) => {
        sendToRenderer('oauth-callback', result);
        focusMainWindow();
        if (!pending) closeOAuthServer();
      });
    });
    server.on('error', (err: any) => {
      log(`[OAuth Server] Loopback listener failed: ${err.message}`);
      resolve(false);
    });
    server.listen(GOOGLE_LOOPBACK_PORT, '127.0.0.1', () => {
      oauthServer = server;
      resolve(true);
    });
    oauthTimeoutTimer = setTimeout(() => {
      pending = null;
      closeOAuthServer();
      log('[OAuth Server] Google sign-in timed out; loopback listener closed.');
    }, SIGN_IN_TIMEOUT_MS);
  });
}

/** Business logic behind the `auth-google` channel. */
export async function startGoogleSignIn(): Promise<{ success: boolean; error?: string }> {
  if (!GOOGLE_CLIENT_ID) {
    log('[Google OAuth] GOOGLE_OAUTH_CLIENT_ID was not provided at build time — Google sign-in disabled.');
    return { success: false, error: 'Google sign-in is not configured for this build.' };
  }

  const listening = await startLoopbackServer();
  if (!listening) {
    return { success: false, error: `Could not open the sign-in listener on port ${GOOGLE_LOOPBACK_PORT}. Close other Nomadic windows and try again.` };
  }

  pending = createPendingSignIn();
  log('[Google OAuth] Opening Google sign-in in the default browser.');
  await shell.openExternal(buildGoogleAuthUrl(GOOGLE_CLIENT_ID, pending));
  return { success: true };
}

/** Test hook: seeds the in-flight sign-in. */
export function __setPendingGoogleSignInForTest(flow: PendingGoogleSignIn | null): void {
  pending = flow;
}

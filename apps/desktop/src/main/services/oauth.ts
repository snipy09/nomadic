import { shell } from 'electron';
import http from 'http';
import crypto from 'crypto';
import type { OAuthCallbackPayload, ValidatedUser } from '../../shared/ipc.js';
import { getDb } from '../db.js';
import { focusMainWindow, log, sendToRenderer } from './app-context.js';
import { session, startHeartbeatLoop } from './session.js';
import { getAnonSupabase } from './supabase.js';
import { syncPullUserDataToLocalDb } from './cloud-sync.js';
import { isOnboardingCompleted, seedProfileIdentity } from './profile.js';
import { cacheValidatedUser, hashLogin, identifyDevice, normalizeTier } from './auth.js';

// ── Google OAuth & Loopback Server (Port 42813) ──────────────────────────
const OAUTH_PORT = 42813;
let oauthServer: http.Server | null = null;
let oauthTimeoutTimer: NodeJS.Timeout | null = null;

export function closeOAuthServer(): void {
  if (oauthServer) {
    try { oauthServer.close(); } catch {}
    oauthServer = null;
  }
}

async function handleOAuthToken(accessToken: string, _refreshToken?: string): Promise<OAuthCallbackPayload> {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      return { success: false, error: 'Supabase credentials missing.' };
    }

    log('[OAuth] Fetching authenticated user profile from Supabase...');
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': anonKey,
      },
    });

    if (!userRes.ok) {
      const errBody = await userRes.text();
      log(`[OAuth] User verification failed: ${errBody}`);
      return { success: false, error: 'Failed to validate Google session with Supabase.' };
    }

    const userData: any = await userRes.json();
    const email = String(userData.email || '').toLowerCase().trim();
    const fullName = String(userData.user_metadata?.full_name || userData.user_metadata?.name || email.split('@')[0] || 'User');
    const userId = String(userData.id || crypto.randomUUID());

    const { deviceFingerprint, deviceName } = identifyDevice();

    const sessionToken = crypto.randomUUID();
    session.userId = userId;
    session.sessionToken = sessionToken;

    const isAdminUser = email === 'sajalmishra0906@gmail.com' || email === 'admin@jobmaxxer.com';
    const appUser: ValidatedUser = {
      id: userId,
      email,
      fullName,
      role: isAdminUser ? 'admin' : 'user',
      tier: isAdminUser ? 'lifetime' : 'free',
      licenseKey: isAdminUser ? `NOMADIC-ADMIN-MASTER` : `NOMADIC-GOOGLE-${userId.slice(0, 8).toUpperCase()}`,
      status: 'active',
      appsCount: isAdminUser ? 9999 : 0,
      createdAt: userData.created_at || new Date().toISOString(),
      lastLogin: new Date().toISOString(),
    };

    cacheValidatedUser(appUser, hashLogin(email, 'oauth_session_token'));
    startHeartbeatLoop(userId, sessionToken, deviceFingerprint);
    await syncPullUserDataToLocalDb(userId, sessionToken, deviceFingerprint).catch(() => {});

    const hasCompleted = isOnboardingCompleted();

    log(`[OAuth] Google authentication successful: ${email} (${fullName}) [existing=${hasCompleted}] ✓`);
    return {
      success: true,
      user: {
        ...appUser,
        onboardingCompleted: hasCompleted,
        sessionToken,
        deviceFingerprint,
        deviceName,
      },
    };
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[OAuth] Error processing token: ${msg}`);
    return { success: false, error: msg };
  }
}

// Injected at build time from GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET (see build-main.mjs).
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

async function handleGoogleAuthCode(code: string): Promise<OAuthCallbackPayload> {
  try {
    log('[Google OAuth] Exchanging authorization code for token with Google...');
    const tokenParams = new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: `http://localhost:${OAUTH_PORT}/callback`,
      grant_type: 'authorization_code',
    });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      log(`[Google OAuth] Token exchange failure: ${errText}`);
      return { success: false, error: 'Google authentication code exchange failed.' };
    }

    const tokenData: any = await tokenRes.json();
    const googleAccessToken = tokenData.access_token;

    log('[Google OAuth] Fetching verified profile from Google UserInfo API...');
    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${googleAccessToken}` },
    });

    if (!userRes.ok) {
      return { success: false, error: 'Failed to retrieve Google user profile.' };
    }

    const profile: any = await userRes.json();
    const email = String(profile.email || '').toLowerCase().trim();
    const fullName = String(profile.name || profile.given_name || email.split('@')[0]);
    const userId = String(profile.sub || crypto.randomUUID());

    const { deviceFingerprint, deviceName } = identifyDevice();

    const sessionToken = crypto.randomUUID();
    session.userId = userId;
    session.sessionToken = sessionToken;

    const isAdminUser = email === 'sajalmishra0906@gmail.com' || email === 'admin@jobmaxxer.com';
    let assignedTier = isAdminUser ? 'lifetime' : 'free';
    let assignedRole = isAdminUser ? 'admin' : 'user';
    let assignedStatus = 'active';

    const supabase = getAnonSupabase();
    if (supabase) {
      try {
        const { data: existingUser } = await supabase
          .from('users_profile')
          .select('*')
          .eq('email', email)
          .maybeSingle();

        if (existingUser) {
          assignedTier = isAdminUser ? 'lifetime' : (existingUser.subscription_tier || 'free');
          assignedRole = isAdminUser ? 'admin' : (existingUser.role || 'user');
          assignedStatus = existingUser.status || 'active';
          await supabase
            .from('users_profile')
            .update({
              full_name: fullName,
              last_login: new Date().toISOString(),
            })
            .eq('email', email);
        } else {
          await supabase.from('users_profile').insert({
            email,
            full_name: fullName,
            subscription_tier: assignedTier,
            role: assignedRole,
            status: assignedStatus,
            license_key: isAdminUser ? 'NOMADIC-ADMIN-MASTER' : `NOMADIC-GGL-${userId.slice(0, 8).toUpperCase()}`,
            apps_count: isAdminUser ? 9999 : 0,
            created_at: new Date().toISOString(),
            last_login: new Date().toISOString(),
          });
        }
      } catch (err: any) {
        log(`[Google OAuth] Supabase profile sync note: ${err?.message}`);
      }
    }

    const appUser: ValidatedUser = {
      id: userId,
      email,
      fullName,
      role: assignedRole as 'user' | 'admin',
      tier: normalizeTier(assignedTier),
      licenseKey: isAdminUser ? `NOMADIC-ADMIN-MASTER` : `NOMADIC-GGL-${userId.slice(0, 8).toUpperCase()}`,
      status: (assignedStatus === 'suspended' ? 'suspended' : 'active') as 'active' | 'suspended',
      appsCount: isAdminUser ? 9999 : 0,
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
    };

    cacheValidatedUser(appUser, hashLogin(email, 'google_oauth_token'));
    startHeartbeatLoop(userId, sessionToken, deviceFingerprint);
    await syncPullUserDataToLocalDb(userId, sessionToken, deviceFingerprint).catch(() => {});

    // Sync Google profile into master_profile for onboarding
    let hasCompleted = false;
    try {
      getDb();
      hasCompleted = isOnboardingCompleted();
      const givenName = profile.given_name || fullName.split(' ')[0] || '';
      const familyName = profile.family_name || (fullName.split(' ').slice(1).join(' ')) || '';

      if (!hasCompleted) {
        seedProfileIdentity(givenName, familyName, email);
      }
    } catch (e: any) {
      log(`[Google OAuth] Master profile sync note: ${e?.message}`);
    }

    log(`[Google OAuth] Verified Google identity: ${email} (${fullName}) [existing=${hasCompleted}] ✓`);
    return {
      success: true,
      user: {
        ...appUser,
        onboardingCompleted: hasCompleted,
        sessionToken,
        deviceFingerprint,
        deviceName,
      },
    };
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[Google OAuth] Exception: ${msg}`);
    return { success: false, error: msg };
  }
}

export async function handleProtocolUrl(rawUrl: string): Promise<void> {
  try {
    log(`[Deep Link] Processing OAuth callback: ${rawUrl.slice(0, 80)}...`);
    const hashIdx = rawUrl.indexOf('#');
    const queryIdx = rawUrl.indexOf('?');
    const queryString = hashIdx !== -1 ? rawUrl.substring(hashIdx + 1) : (queryIdx !== -1 ? rawUrl.substring(queryIdx + 1) : '');
    const params = new URLSearchParams(queryString);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const code = params.get('code');
    const error = params.get('error') || params.get('error_description');

    if (error) {
      sendToRenderer('oauth-callback', { success: false, error });
      return;
    }

    if (code) {
      const loginResult = await handleGoogleAuthCode(code);
      sendToRenderer('oauth-callback', loginResult);
      focusMainWindow();
      return;
    }

    if (accessToken) {
      const loginResult = await handleOAuthToken(accessToken, refreshToken || undefined);
      sendToRenderer('oauth-callback', loginResult);
      focusMainWindow();
    }
  } catch (err: any) {
    log(`[Deep Link] Protocol error: ${err?.message || String(err)}`);
  }
}

const OAUTH_CALLBACK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Nomadic — Authentication</title>
  <style>
    body { background: #09090b; color: #fafafa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #121215; border: 1px solid #27272a; border-radius: 20px; padding: 36px 32px; text-align: center; max-width: 420px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
    h2 { margin: 16px 0 8px; font-size: 20px; font-weight: 800; letter-spacing: -0.02em; }
    p { margin: 0; color: #a1a1aa; font-size: 13px; line-height: 1.5; }
    .spinner { width: 28px; height: 28px; border: 3px solid #27272a; border-top-color: #10b981; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner" id="spinner"></div>
    <h2 id="title">Authenticating...</h2>
    <p id="desc">Connecting your account to Nomadic Desktop.</p>
  </div>
  <script>
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash || window.location.search);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const code = params.get('code');
    const err = params.get('error') || params.get('error_description');

    if (err) {
      document.getElementById('spinner').style.display = 'none';
      document.getElementById('title').textContent = 'Authentication Failed';
      document.getElementById('desc').textContent = err;
      fetch('/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err }) });
    } else if (accessToken || code) {
      fetch('/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken, refreshToken, code })
      }).then(() => {
        document.getElementById('spinner').style.display = 'none';
        document.getElementById('title').textContent = '✓ Sign In Successful!';
        document.getElementById('desc').textContent = 'You can now close this tab and return to Nomadic.';
        setTimeout(() => window.close(), 1200);
      }).catch(() => {
        document.getElementById('desc').textContent = 'Connected. Return to Nomadic Desktop.';
      });
    } else {
      document.getElementById('desc').textContent = 'Please return to Nomadic Desktop.';
    }
  </script>
</body>
</html>`;

function startOAuthLoopbackServer(): Promise<number> {
  return new Promise((resolve) => {
    closeOAuthServer();
    if (oauthTimeoutTimer) {
      clearTimeout(oauthTimeoutTimer);
      oauthTimeoutTimer = null;
    }

    const port = OAUTH_PORT;
    oauthServer = http.createServer(async (req, res) => {
      const parsedUrl = new URL(req.url || '/', `http://localhost:${port}`);

      if (req.method === 'GET' && (parsedUrl.pathname === '/callback' || parsedUrl.pathname === '/')) {
        const error = parsedUrl.searchParams.get('error') || parsedUrl.searchParams.get('error_description');
        if (error) {
          sendToRenderer('oauth-callback', { success: false, error });
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(OAUTH_CALLBACK_HTML);
        return;
      }

      if (req.method === 'POST' && parsedUrl.pathname === '/token') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ received: true }));

          try {
            const data = JSON.parse(body);
            if (data.error) {
              sendToRenderer('oauth-callback', { success: false, error: data.error });
            } else if (data.accessToken) {
              const loginResult = await handleOAuthToken(data.accessToken, data.refreshToken);
              sendToRenderer('oauth-callback', loginResult);
              focusMainWindow();
            } else if (data.code) {
              const loginResult = await handleGoogleAuthCode(data.code);
              sendToRenderer('oauth-callback', loginResult);
              focusMainWindow();
            }
          } catch (e: any) {
            log(`[OAuth Server] Payload error: ${e?.message}`);
          }

          setTimeout(() => {
            if (oauthServer) {
              oauthServer.close();
              oauthServer = null;
            }
          }, 3000);
        });
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    });

    oauthServer.on('error', (err: any) => {
      log(`[OAuth Server] Loopback port note: ${err.message}`);
      resolve(0);
    });

    oauthServer.listen(port, '127.0.0.1', () => {
      log(`[OAuth Server] Loopback listener active on http://127.0.0.1:${port}/callback ✓`);
      resolve(port);
    });

    oauthTimeoutTimer = setTimeout(() => {
      if (oauthServer) {
        oauthServer.close();
        oauthServer = null;
        log('[OAuth Server] Loopback listener closed after idle timeout.');
      }
    }, 180_000);
  });
}

/** Business logic behind the `auth-google` channel. */
export async function startGoogleSignIn(): Promise<{ success: boolean; error?: string }> {
  const googleClientId = GOOGLE_CLIENT_ID;
  if (!googleClientId) {
    log('[Google OAuth] GOOGLE_OAUTH_CLIENT_ID was not provided at build time — Google sign-in disabled.');
    return { success: false, error: 'Google sign-in is not configured for this build.' };
  }

  await startOAuthLoopbackServer();

  const redirectUri = encodeURIComponent(`http://localhost:${OAUTH_PORT}/callback`);
  const scope = encodeURIComponent('openid email profile');
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${googleClientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;

  log(`[Google OAuth] Launching Google authentication in default browser: ${authUrl}`);
  shell.openExternal(authUrl);
  return { success: true };
}

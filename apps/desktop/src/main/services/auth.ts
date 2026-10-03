import { app } from 'electron';
import crypto from 'crypto';
import { registerDeviceSession } from '@job-automator/supabase';
import type { AuthCredentials, AuthResult, ValidatedUser } from '../../shared/ipc.js';
import { getDb, persistDb } from '../db.js';
import { getDeviceIdentifier } from '../device.js';
import { log } from './app-context.js';
import { session, resolvePublicIp, startHeartbeatLoop } from './session.js';
import { getAnonSupabase } from './supabase.js';
import { syncPullUserDataToLocalDb } from './cloud-sync.js';
import { isOnboardingCompleted, seedProfileIdentity } from './profile.js';

// ── Authentication & Licensing ────────────────────────────────────────────
// Login is SERVER-AUTHORITATIVE. The desktop app asks Supabase (via the
// authenticate_user RPC, anon key) who is allowed in and what tier they hold —
// the customer's machine can no longer self-provision or self-upgrade. On a
// successful login we cache the profile locally (password stored only as a
// sha256 hash) so the app tolerates a brief offline window; if Supabase is
// unreachable we fall back to that cache.

export type CanonicalTier = 'free' | 'lite' | 'pro' | 'max';

// sha256("email:password") — identical to the server-side jobmaxxer_hash_login().
export function hashLogin(email: string, password: string): string {
  return crypto
    .createHash('sha256')
    .update(`${email.trim().toLowerCase()}:${password}`)
    .digest('hex');
}

// Normalize and preserve all Nomadic subscription tiers
export function normalizeTier(t: unknown): CanonicalTier {
  const s = String(t ?? 'free').toLowerCase().trim();
  if (s === 'lite' || s === 'learner_pro' || s === 'learner') return 'lite';
  if (s === 'pro' || s === 'seeker_pro' || s === 'seeker') return 'pro';
  if (s === 'max' || s === 'seeker_max' || s === 'lifetime' || s === 'enterprise' || s === 'turbo') return 'max';
  return 'free';
}

export async function getVerifiedServerUserTier(email?: string): Promise<string> {
  const normEmail = (email || '').toLowerCase().trim();
  const supabase = getAnonSupabase();
  if (supabase && normEmail) {
    try {
      const { data, error } = await supabase
        .from('users_profile')
        .select('subscription_tier, role, status')
        .eq('email', normEmail)
        .maybeSingle();

      if (!error && data) {
        if (data.status === 'suspended') {
          return 'suspended';
        }
        const serverTier = normalizeTier(data.subscription_tier || 'free');
        try {
          const db = getDb();
          db.run('UPDATE user_cache SET tier = ?, status = ? WHERE email = ?', [serverTier, data.status || 'active', normEmail]);
          persistDb();
        } catch {}
        return serverTier;
      }
    } catch (err: any) {
      log(`[Security] Server tier verification note: ${err?.message}`);
    }
  }

  // Fallback to local cache if offline
  try {
    const db = getDb();
    const uc = db.exec('SELECT tier FROM user_cache WHERE email = ?', [normEmail]);
    if (uc.length && uc[0].values.length) {
      return normalizeTier(String(uc[0].values[0][0] || 'free'));
    }
  } catch {}

  return 'free';
}

export function cacheValidatedUser(u: ValidatedUser, passwordHash: string): void {
  try {
    const db = getDb();
    db.run(
      `INSERT OR REPLACE INTO user_cache
         (email, supabase_id, password_hash, full_name, role, tier, license_key,
          status, apps_count, created_at, expires_at, last_login, cached_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        u.email.toLowerCase(), u.id, passwordHash, u.fullName, u.role, u.tier,
        u.licenseKey, u.status, u.appsCount, u.createdAt,
        u.expiresAt ?? null, u.lastLogin ?? null,
      ]
    );
    persistDb();
  } catch (err: unknown) {
    log(`[Auth] Cache write skipped: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function tryOfflineLogin(
  email: string,
  passwordHash: string
): ValidatedUser | { error: string } | null {
  try {
    const db = getDb();
    const res = db.exec('SELECT * FROM user_cache WHERE email = ?', [email.toLowerCase()]);
    if (!res.length || !res[0].values.length) return null;
    const cols = res[0].columns;
    const row = Object.fromEntries(cols.map((c, i) => [c, res[0].values[0][i]]));
    // Same message as the server so the local cache does not reveal which emails signed in here.
    if (String(row['password_hash']) !== passwordHash) return { error: 'Incorrect email or password.' };
    if (String(row['status']) === 'suspended') {
      return { error: 'This account is suspended. Contact your administrator.' };
    }
    const expiresAt = row['expires_at'] ? String(row['expires_at']) : undefined;
    if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
      return { error: 'Your subscription has expired. Reconnect to the internet after renewing.' };
    }
    return {
      id: String(row['supabase_id'] ?? ''),
      email: String(row['email']),
      fullName: String(row['full_name'] ?? ''),
      role: String(row['role'] ?? 'user') as 'admin' | 'user',
      tier: String(row['tier'] ?? 'pro') as 'trial' | 'pro' | 'max' | 'lifetime',
      licenseKey: String(row['license_key'] ?? ''),
      status: String(row['status'] ?? 'active') as 'active' | 'suspended',
      appsCount: Number(row['apps_count'] ?? 0),
      createdAt: String(row['created_at'] ?? ''),
      expiresAt,
      lastLogin: row['last_login'] ? String(row['last_login']) : undefined,
    };
  } catch {
    return null;
  }
}

/** The one-time `login_ticket` column from an `authenticate_user` row (migration 008), if present. */
export function readLoginTicket(row: unknown): string | undefined {
  if (!row || typeof row !== 'object') return undefined;
  const t = (row as Record<string, unknown>)['login_ticket'];
  return typeof t === 'string' && t.length > 0 ? t : undefined;
}

/**
 * Signs in once to obtain a login ticket for a freshly created account.
 * register_user (009) does not issue a ticket, and register_device_session needs one
 * once require_login_ticket is on. Returns undefined if the server gives none.
 */
async function obtainLoginTicket(
  supabase: NonNullable<ReturnType<typeof getAnonSupabase>>,
  email: string,
  password: string,
  userId: string
): Promise<string | undefined> {
  try {
    const { data, error } = await supabase.rpc('authenticate_user', { p_email: email, p_password: password });
    if (error) return undefined;
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
    if (!row || !row['ok'] || String(row['id']) !== userId) return undefined;
    return readLoginTicket(row);
  } catch {
    return undefined;
  }
}

/** Resolves this machine's identity and records it on the active session. */
export function identifyDevice(): { deviceFingerprint: string; deviceName: string } {
  const { deviceFingerprint, deviceName } = getDeviceIdentifier(app.getPath('userData'));
  session.deviceFingerprint = deviceFingerprint;
  session.deviceName = deviceName;
  return { deviceFingerprint, deviceName };
}

/** Business logic behind the `auth-login` channel. */
export async function loginWithCredentials(credentials: AuthCredentials): Promise<AuthResult> {
  try {
    const email = String(credentials['email'] ?? credentials['username'] ?? '').trim().toLowerCase();
    const password = String(credentials['password'] ?? credentials['licenseKey'] ?? '').trim();
    const forceTakeover = Boolean(credentials['forceTakeover']);

    if (!email || !password) {
      return { success: false, error: 'Email and password are required.' };
    }
    if (!email.includes('@')) {
      return { success: false, error: 'Please sign in with the email address your license was issued to.' };
    }

    const passwordHash = hashLogin(email, password);
    const supabase = getAnonSupabase();
    const { deviceFingerprint, deviceName } = identifyDevice();

    // Authenticate exclusively via Supabase
    if (supabase) {
      try {
        const { data, error } = await supabase.rpc('authenticate_user', {
          p_email: email,
          p_password: password,
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) return { success: false, error: 'Login failed. Please try again.' };
        if (!row.ok) return { success: false, error: row.reason || 'Login failed.' };

        const tier: ValidatedUser['tier'] =
          ['trial', 'pro', 'max', 'lifetime'].includes(row.tier) ? row.tier : 'pro';
        const user: ValidatedUser = {
          id: String(row.id),
          email: String(row.email),
          fullName: String(row.full_name ?? ''),
          role: row.role === 'admin' ? 'admin' : 'user',
          tier,
          licenseKey: String(row.license_key ?? ''),
          status: row.status === 'suspended' ? 'suspended' : 'active',
          appsCount: Number(row.apps_count ?? 0),
          createdAt: '',
          expiresAt: row.expires_at ? String(row.expires_at) : undefined,
          lastLogin: new Date().toISOString(),
        };

        // Enforce Single-Laptop Lock
        const clientIp = await resolvePublicIp().catch(() => '127.0.0.1');
        const sessionToken = crypto.randomUUID();

        // The one-time login ticket proves this device just authenticated as user.id
        // (SECURITY_CHECKLIST S3). It is single use, so a force-takeover retry signs in again.
        const devReg = await registerDeviceSession(
          supabase,
          user.id,
          sessionToken,
          deviceFingerprint,
          deviceName,
          clientIp,
          forceTakeover,
          readLoginTicket(row)
        );

        if (devReg.conflict && !forceTakeover) {
          log(`[Auth] Device lock conflict: Account in use on "${devReg.activeDevice}".`);
          return {
            success: false,
            conflict: true,
            activeDevice: devReg.activeDevice || 'Another Laptop',
            error: devReg.reason || 'Account is currently active on another device.',
          };
        }

        session.userId = user.id;
        session.sessionToken = sessionToken;

        cacheValidatedUser(user, passwordHash);
        log(`[Auth] Authenticated via Supabase: ${user.email} (${user.tier.toUpperCase()}) on [${deviceName}]`);

        // Start heartbeat loop immediately
        startHeartbeatLoop(user.id, sessionToken, deviceFingerprint);

        // Pull cloud data into local SQLite
        await syncPullUserDataToLocalDb(user.id, sessionToken, deviceFingerprint);

        return {
          success: true,
          user: {
            ...user,
            onboardingCompleted: isOnboardingCompleted(),
            sessionToken,
            deviceFingerprint,
            deviceName,
          }
        };
      } catch (rpcErr: unknown) {
        const msg = rpcErr instanceof Error ? rpcErr.message : String(rpcErr);
        log(`[Auth] Supabase unreachable (${msg}) — trying offline cache.`);
      }
    }

    // Offline fallback: only users who previously logged in successfully.
    const offline = tryOfflineLogin(email, passwordHash);
    if (offline && 'error' in offline) return { success: false, error: offline.error };
    if (offline) {
      const offlineSessionToken = crypto.randomUUID();
      session.userId = offline.id;
      session.sessionToken = offlineSessionToken;

      const hasCompleted = isOnboardingCompleted();

      log(`[Auth] Authenticated from offline cache: ${offline.email}`);
      return {
        success: true,
        user: {
          ...offline,
          onboardingCompleted: hasCompleted,
          sessionToken: offlineSessionToken,
          deviceFingerprint,
          deviceName,
        }
      };
    }

    return {
      success: false,
      error: supabase
        ? 'Could not reach the licensing server and no offline session is cached. Check your connection.'
        : 'Licensing server is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[Auth] Login error: ${msg}`);
    return { success: false, error: msg };
  }
}

/** Business logic behind the `auth-signup` channel. */
export async function signupLocalAccount(credentials: AuthCredentials): Promise<AuthResult> {
  try {
    const email = String(credentials['email'] ?? '').trim().toLowerCase();
    const password = String(credentials['password'] ?? '').trim();
    const fullName = String(credentials['fullName'] ?? '').trim() || email.split('@')[0];

    if (!email || !password) {
      return { success: false, error: 'Email and password are required.' };
    }
    if (!email.includes('@')) {
      return { success: false, error: 'Please enter a valid email address.' };
    }
    if (password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters.' };
    }

    const supabase = getAnonSupabase();
    if (!supabase) {
      return { success: false, error: 'Sign-up needs the licensing server, which is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.' };
    }

    const { deviceFingerprint, deviceName } = identifyDevice();

    // Create the account on the server so it works on any machine.
    let row: Record<string, unknown> | undefined;
    try {
      const { data, error } = await supabase.rpc('register_user', {
        p_email: email,
        p_password: password,
        p_full_name: fullName,
      });
      if (error) throw error;
      row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
    } catch (rpcErr: unknown) {
      const msg = rpcErr instanceof Error ? rpcErr.message : String(rpcErr);
      log(`[Auth] Sign-up could not reach server: ${msg}`);
      return { success: false, error: 'Could not reach the server to create your account. Check your connection and try again.' };
    }
    if (!row) return { success: false, error: 'Sign-up failed. Please try again.' };
    if (!row['ok']) return { success: false, error: String(row['reason'] || 'Sign-up failed.') };

    const appUser: ValidatedUser = {
      id: String(row['id']),
      email: String(row['email']),
      fullName: String(row['full_name'] ?? fullName),
      role: 'user',
      tier: 'trial',
      licenseKey: String(row['license_key'] ?? ''),
      status: 'active',
      appsCount: Number(row['apps_count'] ?? 0),
      createdAt: new Date().toISOString(),
      expiresAt: row['expires_at'] ? String(row['expires_at']) : undefined,
      lastLogin: new Date().toISOString(),
      onboardingCompleted: false,
    };

    // Same device lock + session start as login.
    const clientIp = await resolvePublicIp().catch(() => '127.0.0.1');
    const sessionToken = crypto.randomUUID();
    const loginTicket = await obtainLoginTicket(supabase, email, password, appUser.id);
    const devReg = await registerDeviceSession(
      supabase, appUser.id, sessionToken, deviceFingerprint, deviceName, clientIp, false, loginTicket
    );
    if (!devReg.ok && !devReg.conflict) {
      log(`[Auth] Device registration after sign-up failed: ${devReg.reason ?? 'unknown'}`);
      return { success: false, error: 'Your account was created. Please sign in to continue.' };
    }

    session.userId = appUser.id;
    session.sessionToken = sessionToken;
    cacheValidatedUser(appUser, hashLogin(email, password));
    startHeartbeatLoop(appUser.id, sessionToken, deviceFingerprint);

    // Save initial profile in local DB for onboarding
    try {
      const parts = fullName.split(' ');
      seedProfileIdentity(parts[0] || '', parts.slice(1).join(' ') || '', email);
    } catch {}

    log(`[Auth] New account created on server: ${email} ✓`);
    return {
      success: true,
      user: {
        ...appUser,
        onboardingCompleted: false,
        sessionToken,
        deviceFingerprint,
        deviceName,
      },
    };
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[Auth] Signup error: ${msg}`);
    return { success: false, error: msg };
  }
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import http from 'http';

// Security S9: Google sign-in must use PKCE, have the server verify the ID token (google-sign-in Edge Function),
// and then start the session exactly like password sign-in: register_device_session with the server's single-use
// login ticket, heartbeat and cloud pull for the server's users_profile id. Nothing reads or writes users_profile.

// oauth.ts reads the build-time values when it is imported.
vi.hoisted(() => {
  process.env.GOOGLE_CLIENT_ID = 'desktop-client.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_SECRET = '';
  process.env.SUPABASE_URL = 'https://proj.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
});

const rpc = vi.fn();
const from = vi.fn(() => { throw new Error('users_profile must not be accessed from the desktop'); });
const openExternal = vi.fn<(url: string) => Promise<void>>(async () => {});
const sendToRenderer = vi.fn();
const startHeartbeatLoop = vi.fn();
const syncPull = vi.fn(async () => true);
const seedProfileIdentity = vi.fn();
const dbRun = vi.fn();

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/nomadic-test' }, shell: { openExternal: (u: string) => openExternal(u) } }));
vi.mock('../db.js', () => ({ getDb: () => ({ run: dbRun, exec: () => [] }), persistDb: vi.fn() }));
vi.mock('../device.js', () => ({
  getDeviceIdentifier: () => ({ deviceFingerprint: 'fp-1', deviceName: 'Test Laptop' }),
}));
vi.mock('../services/app-context.js', () => ({
  log: vi.fn(),
  sendToRenderer: (...a: unknown[]) => sendToRenderer(...a),
  focusMainWindow: vi.fn(),
}));
vi.mock('../services/session.js', () => ({
  session: { userId: null, sessionToken: null, deviceFingerprint: null, deviceName: null },
  resolvePublicIp: () => Promise.resolve('1.2.3.4'),
  startHeartbeatLoop: (...a: unknown[]) => startHeartbeatLoop(...a),
}));
vi.mock('../services/supabase.js', () => ({ getAnonSupabase: () => ({ rpc, from }) }));
vi.mock('../services/cloud-sync.js', () => ({ syncPullUserDataToLocalDb: (...a: unknown[]) => syncPull(...(a as [])) }));
vi.mock('../services/profile.js', () => ({
  isOnboardingCompleted: () => false,
  seedProfileIdentity: (...a: unknown[]) => seedProfileIdentity(...a),
}));

import {
  closeOAuthServer,
  completeGoogleSignIn,
  createPkcePair,
  GOOGLE_REDIRECT_URI,
  startGoogleSignIn,
} from '../services/oauth';
import { hashLogin } from '../services/auth';
import { session } from '../services/session.js';

const USER_ID = '22222222-2222-2222-2222-222222222222';

function serverRow(overrides: Record<string, unknown> = {}) {
  return {
    ok: true, reason: 'ok', id: USER_ID, email: 'person@example.com', full_name: 'Test Person', tier: 'max',
    role: 'admin', status: 'active', license_key: 'NOMADIC-ABC', expires_at: null, apps_count: 3,
    login_ticket: 'ticket-from-server', given_name: 'Test', family_name: 'Person', ...overrides,
  };
}

const fetchMock = vi.fn();
let functionRow: Record<string, unknown> = serverRow();

function installFetch() {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ id_token: 'google.id.token', access_token: 'x' }), { status: 200 });
    }
    if (url === 'https://proj.supabase.co/functions/v1/google-sign-in') {
      return new Response(JSON.stringify(functionRow), { status: functionRow.ok ? 200 : 401 });
    }
    throw new Error(`unexpected fetch ${url} ${init?.method}`);
  });
}

function callsTo(url: string) {
  return fetchMock.mock.calls.filter(([u]) => u === url);
}

function registerCalls() {
  return rpc.mock.calls.filter(([name]) => name === 'register_device_session').map(([, p]) => p);
}

/** Starts the flow and returns the parameters Google would receive. */
async function begin(options?: { forceTakeover?: boolean }) {
  const res = await startGoogleSignIn(options);
  expect(res.success).toBe(true);
  const url = new URL(openExternal.mock.calls.at(-1)![0]);
  return url.searchParams;
}

beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(async (name: string) => {
    if (name === 'register_device_session') return { data: [{ ok: true, conflict: false }], error: null };
    return { data: null, error: null };
  });
  from.mockClear();
  openExternal.mockClear();
  sendToRenderer.mockClear();
  startHeartbeatLoop.mockClear();
  syncPull.mockClear();
  seedProfileIdentity.mockClear();
  dbRun.mockClear();
  fetchMock.mockReset();
  functionRow = serverRow();
  installFetch();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  closeOAuthServer();
  vi.unstubAllGlobals();
});

describe('createPkcePair', () => {
  it('returns an RFC 7636 verifier and its S256 challenge', () => {
    const { verifier, challenge } = createPkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(challenge).toBe(crypto.createHash('sha256').update(verifier).digest('base64url'));
  });
});

describe('Google sign-in (installed-app flow with PKCE)', () => {
  it('opens Google with PKCE S256, state and nonce on the loopback redirect, and no secret', async () => {
    const q = await begin();
    expect(q.get('client_id')).toBe('desktop-client.apps.googleusercontent.com');
    expect(q.get('redirect_uri')).toBe(GOOGLE_REDIRECT_URI);
    expect(GOOGLE_REDIRECT_URI).toBe('http://127.0.0.1:42813/callback');
    expect(q.get('response_type')).toBe('code');
    expect(q.get('scope')).toBe('openid email profile');
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(q.get('state')).toBeTruthy();
    expect(q.get('nonce')).toBeTruthy();
    expect(q.has('client_secret')).toBe(false);
    expect(q.has('access_type')).toBe(false);
  });

  it('exchanges the code with the PKCE verifier, has the server verify the ID token, and registers with its ticket', async () => {
    const q = await begin();
    const res = await completeGoogleSignIn('auth-code', q.get('state'));

    // Token exchange: verifier matches the challenge sent to Google; no client secret configured in this build.
    const [, tokenInit] = callsTo('https://oauth2.googleapis.com/token')[0];
    const body = new URLSearchParams(String(tokenInit!.body));
    expect(body.get('code')).toBe('auth-code');
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('redirect_uri')).toBe(GOOGLE_REDIRECT_URI);
    expect(crypto.createHash('sha256').update(body.get('code_verifier')!).digest('base64url')).toBe(q.get('code_challenge'));
    expect(body.has('client_secret')).toBe(false);

    // Edge Function: ID token + nonce, anon key as bearer.
    const [, fnInit] = callsTo('https://proj.supabase.co/functions/v1/google-sign-in')[0];
    expect(JSON.parse(String(fnInit!.body))).toEqual({ id_token: 'google.id.token', nonce: q.get('nonce') });
    expect((fnInit!.headers as Record<string, string>).Authorization).toBe('Bearer anon-key');

    // Same path as password sign-in: ticket -> device registration -> heartbeat -> pull, server UUID everywhere.
    expect(registerCalls()).toHaveLength(1);
    expect(registerCalls()[0]).toMatchObject({ p_user_id: USER_ID, p_login_ticket: 'ticket-from-server', p_force_takeover: false, p_device_fingerprint: 'fp-1' });
    const token = registerCalls()[0].p_session_token;
    expect(startHeartbeatLoop).toHaveBeenCalledWith(USER_ID, token, 'fp-1');
    expect(syncPull).toHaveBeenCalledWith(USER_ID, token, 'fp-1');
    expect(session.userId).toBe(USER_ID);
    expect(session.sessionToken).toBe(token);

    // Role and tier come from the server row only.
    expect(res.success).toBe(true);
    expect(res.user).toMatchObject({ id: USER_ID, role: 'admin', tier: 'max', email: 'person@example.com', sessionToken: token });
    expect(seedProfileIdentity).toHaveBeenCalledWith('Test', 'Person', 'person@example.com');
    expect(from).not.toHaveBeenCalled();
  });

  it('caches an unguessable offline credential, not a fixed one', async () => {
    const q = await begin();
    await completeGoogleSignIn('auth-code', q.get('state'));
    const cached = dbRun.mock.calls.find(([sql]) => String(sql).includes('user_cache'));
    expect(cached).toBeTruthy();
    const storedHash = (cached![1] as unknown[])[2];
    expect(storedHash).not.toBe(hashLogin('person@example.com', 'google_oauth_token'));
    expect(storedHash).not.toBe(hashLogin('person@example.com', 'oauth_session_token'));
  });

  it('rejects a callback with the wrong state without contacting Google', async () => {
    await begin();
    const res = await completeGoogleSignIn('auth-code', 'forged-state');
    expect(res.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(registerCalls()).toHaveLength(0);
  });

  it('accepts each flow once', async () => {
    const q = await begin();
    expect((await completeGoogleSignIn('auth-code', q.get('state'))).success).toBe(true);
    const again = await completeGoogleSignIn('auth-code', q.get('state'));
    expect(again.success).toBe(false);
    expect(callsTo('https://oauth2.googleapis.com/token')).toHaveLength(1);
  });

  it('returns the server reason and registers nothing when the server refuses (e.g. suspended)', async () => {
    functionRow = { ok: false, reason: 'This account is suspended. Contact your administrator.' };
    const q = await begin();
    const res = await completeGoogleSignIn('auth-code', q.get('state'));
    expect(res).toEqual({ success: false, error: 'This account is suspended. Contact your administrator.' });
    expect(registerCalls()).toHaveLength(0);
    expect(startHeartbeatLoop).not.toHaveBeenCalled();
  });

  it('fails when Google refuses the code exchange', async () => {
    fetchMock.mockImplementation(async () => new Response('{"error":"invalid_grant"}', { status: 400 }));
    const q = await begin();
    const res = await completeGoogleSignIn('bad-code', q.get('state'));
    expect(res.success).toBe(false);
    expect(registerCalls()).toHaveLength(0);
  });

  it('reports a device conflict, and a takeover retry signs in again with a fresh ticket', async () => {
    rpc.mockImplementation(async (name: string, params: Record<string, unknown>) => {
      if (name !== 'register_device_session') return { data: null, error: null };
      return params.p_force_takeover
        ? { data: [{ ok: true, conflict: false }], error: null }
        : { data: [{ ok: false, conflict: true, active_device: 'Office PC', reason: 'busy' }], error: null };
    });

    const q1 = await begin();
    const first = await completeGoogleSignIn('code-1', q1.get('state'));
    expect(first).toMatchObject({ success: false, conflict: true, activeDevice: 'Office PC' });
    expect(startHeartbeatLoop).not.toHaveBeenCalled();

    functionRow = serverRow({ login_ticket: 'ticket-2' });
    const q2 = await begin({ forceTakeover: true });
    const second = await completeGoogleSignIn('code-2', q2.get('state'));
    expect(second.success).toBe(true);
    expect(registerCalls()[1]).toMatchObject({ p_force_takeover: true, p_login_ticket: 'ticket-2' });
  });

  it('completes through the loopback listener and notifies the renderer', async () => {
    const q = await begin();
    const status = await new Promise<number>((resolve, reject) => {
      http.get(`${GOOGLE_REDIRECT_URI}?code=auth-code&state=${encodeURIComponent(q.get('state')!)}`, { agent: false }, (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      }).on('error', reject);
    });
    expect(status).toBe(200);
    expect(sendToRenderer).toHaveBeenCalledWith('oauth-callback', expect.objectContaining({ success: true }));
    expect(registerCalls()[0]).toMatchObject({ p_login_ticket: 'ticket-from-server' });
  });

  it('reports a cancelled consent screen to the renderer', async () => {
    await begin();
    await new Promise<void>((resolve, reject) => {
      http.get(`${GOOGLE_REDIRECT_URI}?error=access_denied`, { agent: false }, (res) => { res.resume(); res.on('end', () => resolve()); }).on('error', reject);
    });
    expect(sendToRenderer).toHaveBeenCalledWith('oauth-callback', { success: false, error: 'Google sign-in was cancelled.' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

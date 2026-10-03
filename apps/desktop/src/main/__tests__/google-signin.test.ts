import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

// Security S9: Google sign-in uses PKCE (no client secret on the desktop), the server
// verifies the Google token and returns a login ticket, and the device is registered with it.

const { rpc, cacheValidatedUser } = vi.hoisted(() => ({ rpc: vi.fn(), cacheValidatedUser: vi.fn() }));

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/nomadic-test' }, shell: { openExternal: vi.fn() } }));
vi.mock('../db.js', () => ({ getDb: () => ({ run: vi.fn(), exec: () => [] }), persistDb: vi.fn() }));
vi.mock('../device.js', () => ({
  getDeviceIdentifier: () => ({ deviceFingerprint: 'fp-1', deviceName: 'Test Laptop' }),
}));
vi.mock('../services/app-context.js', () => ({ log: vi.fn(), sendToRenderer: vi.fn(), focusMainWindow: vi.fn() }));
vi.mock('../services/session.js', () => ({
  session: { userId: null, sessionToken: null, deviceFingerprint: null, deviceName: null },
  resolvePublicIp: () => Promise.resolve('1.2.3.4'),
  startHeartbeatLoop: vi.fn(),
}));
vi.mock('../services/supabase.js', () => ({ getAnonSupabase: () => ({ rpc }) }));
vi.mock('../services/cloud-sync.js', () => ({ syncPullUserDataToLocalDb: vi.fn().mockResolvedValue(true) }));
vi.mock('../services/profile.js', () => ({ isOnboardingCompleted: () => false, seedProfileIdentity: vi.fn() }));
vi.mock('../services/auth.js', async (orig) => ({ ...(await orig<typeof import('../services/auth')>()), cacheValidatedUser }));

import { buildGoogleAuthUrl, createPendingSignIn, pkceChallenge, stateMatches } from '../services/google-pkce';
import { __setPendingGoogleSignInForTest, handleGoogleCallback } from '../services/oauth';

const USER_ID = '22222222-2222-2222-2222-222222222222';
const fetchMock = vi.fn();

function serverRow(overrides: Record<string, unknown> = {}) {
  return {
    ok: true, reason: 'ok', id: USER_ID, email: 'student@gmail.com', full_name: 'A Student', tier: 'trial',
    role: 'user', status: 'active', license_key: 'NOMADIC-G', expires_at: null, apps_count: 0, login_ticket: 'g-ticket',
    ...overrides,
  };
}

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });
}

beforeEach(() => {
  rpc.mockReset();
  fetchMock.mockReset();
  cacheValidatedUser.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  process.env.SUPABASE_URL = 'https://proj.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
  rpc.mockResolvedValue({ data: [{ ok: true, conflict: false }], error: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  __setPendingGoogleSignInForTest(null);
});

describe('PKCE helpers', () => {
  it('creates an RFC 7636 verifier and an S256 challenge', () => {
    const flow = createPendingSignIn();
    expect(flow.codeVerifier).toMatch(/^[A-Za-z0-9\-_]{43,128}$/);
    const expected = crypto.createHash('sha256').update(flow.codeVerifier).digest('base64url');
    expect(pkceChallenge(flow.codeVerifier)).toBe(expected);
    expect(flow.redirectUri).toBe('http://127.0.0.1:42813/callback');
  });

  it('builds an auth URL with challenge, state and nonce and no secret', () => {
    const flow = createPendingSignIn();
    const url = new URL(buildGoogleAuthUrl('cid.apps.googleusercontent.com', flow));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(pkceChallenge(flow.codeVerifier));
    expect(url.searchParams.get('state')).toBe(flow.state);
    expect(url.searchParams.get('nonce')).toBe(flow.nonce);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.has('client_secret')).toBe(false);
    expect(url.toString()).not.toContain(flow.codeVerifier);
  });

  it('compares state exactly', () => {
    expect(stateMatches('abc', 'abc')).toBe(true);
    expect(stateMatches('abc', 'abd')).toBe(false);
    expect(stateMatches('abc', 'abcd')).toBe(false);
    expect(stateMatches('abc', null)).toBe(false);
  });
});

describe('handleGoogleCallback', () => {
  it('sends code, verifier, redirect and nonce to the google-signin function and registers the device with the ticket', async () => {
    const flow = createPendingSignIn();
    __setPendingGoogleSignInForTest(flow);
    respond(200, serverRow());

    const res = await handleGoogleCallback(new URLSearchParams({ code: '4/code', state: flow.state }));

    expect(res.success).toBe(true);
    expect(res.user?.id).toBe(USER_ID);
    expect(res.user?.tier).toBe('trial');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://proj.supabase.co/functions/v1/google-signin');
    expect(JSON.parse(init.body)).toEqual({
      code: '4/code', code_verifier: flow.codeVerifier, redirect_uri: flow.redirectUri, nonce: flow.nonce,
    });
    const reg = rpc.mock.calls.find(([name]) => name === 'register_device_session');
    expect(reg?.[1].p_login_ticket).toBe('g-ticket');
    expect(reg?.[1].p_user_id).toBe(USER_ID);
    // The cached credential is random, never a guessable constant.
    expect(cacheValidatedUser.mock.calls[0][1]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses a callback whose state does not match and keeps the flow pending', async () => {
    const flow = createPendingSignIn();
    __setPendingGoogleSignInForTest(flow);

    const res = await handleGoogleCallback(new URLSearchParams({ code: '4/code', state: 'forged' }));

    expect(res.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    respond(200, serverRow());
    const real = await handleGoogleCallback(new URLSearchParams({ code: '4/code', state: flow.state }));
    expect(real.success).toBe(true);
  });

  it('is single use', async () => {
    const flow = createPendingSignIn();
    __setPendingGoogleSignInForTest(flow);
    respond(200, serverRow());
    await handleGoogleCallback(new URLSearchParams({ code: '4/code', state: flow.state }));

    const again = await handleGoogleCallback(new URLSearchParams({ code: '4/code', state: flow.state }));

    expect(again.success).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows the server refusal reason and does not register a device', async () => {
    const flow = createPendingSignIn();
    __setPendingGoogleSignInForTest(flow);
    respond(200, serverRow({ ok: false, reason: 'This account is suspended. Contact your administrator.', login_ticket: null }));

    const res = await handleGoogleCallback(new URLSearchParams({ code: '4/code', state: flow.state }));

    expect(res).toEqual({ success: false, error: 'This account is suspended. Contact your administrator.' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reports a cancelled Google consent', async () => {
    const flow = createPendingSignIn();
    __setPendingGoogleSignInForTest(flow);

    const res = await handleGoogleCallback(new URLSearchParams({ error: 'access_denied', state: flow.state }));

    expect(res).toEqual({ success: false, error: 'Google sign-in was cancelled.' });
  });

  it('does not start a session when the device is in use elsewhere', async () => {
    const flow = createPendingSignIn();
    __setPendingGoogleSignInForTest(flow);
    respond(200, serverRow());
    rpc.mockResolvedValue({ data: [{ ok: false, conflict: true, active_device: 'Other', reason: 'Account is currently active on another device (Other).' }], error: null });

    const res = await handleGoogleCallback(new URLSearchParams({ code: '4/code', state: flow.state }));

    expect(res.success).toBe(false);
    expect(res.error).toContain('another device');
    expect(cacheValidatedUser).not.toHaveBeenCalled();
  });

  it('handles an unreachable server', async () => {
    const flow = createPendingSignIn();
    __setPendingGoogleSignInForTest(flow);
    fetchMock.mockRejectedValue(new Error('ENOTFOUND'));

    const res = await handleGoogleCallback(new URLSearchParams({ code: '4/code', state: flow.state }));

    expect(res).toEqual({ success: false, error: 'Could not reach the server to finish Google sign-in. Check your connection.' });
  });
});

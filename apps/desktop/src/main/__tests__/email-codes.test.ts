import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Password reset and email verification (migration 019 + Edge Function send-email-code).

const rpc = vi.fn();
const dbRun = vi.fn();
const logMock = vi.fn();
const activeSession = {
  value: null as null | { userId: string; sessionToken: string; deviceFingerprint: string },
};

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/nomadic-test' } }));
vi.mock('../db.js', () => ({ getDb: () => ({ run: dbRun, exec: () => [] }), persistDb: vi.fn() }));
vi.mock('../device.js', () => ({ getDeviceIdentifier: () => ({ deviceFingerprint: 'fp-1', deviceName: 'Test Laptop' }) }));
vi.mock('../services/app-context.js', () => ({ log: (msg: string) => logMock(msg) }));
vi.mock('../services/session.js', () => ({
  session: { userId: null, sessionToken: null, deviceFingerprint: null, deviceName: null },
  getActiveSyncSession: () => activeSession.value,
  resolvePublicIp: () => Promise.resolve('1.2.3.4'),
  startHeartbeatLoop: vi.fn(),
}));
vi.mock('../services/supabase.js', () => ({ getAnonSupabase: () => ({ rpc }) }));
vi.mock('../services/cloud-sync.js', () => ({ syncPullUserDataToLocalDb: vi.fn() }));
vi.mock('../services/profile.js', () => ({ isOnboardingCompleted: () => false, seedProfileIdentity: vi.fn() }));

import {
  INVALID_CODE_MESSAGE,
  SEND_EMAIL_CODE_PATH,
  confirmEmailVerification,
  confirmPasswordReset,
  getEmailVerificationStatus,
  requestPasswordReset,
  sendVerificationEmail,
} from '../services/email-codes';
import { hashLogin } from '../services/auth';
import { emailVerificationConfirmArgs, passwordResetConfirmArgs, passwordResetRequestArgs } from '../ipc/schemas';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const fetchMock = vi.fn();

function reply(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  rpc.mockReset();
  dbRun.mockReset();
  logMock.mockReset();
  fetchMock.mockReset();
  activeSession.value = null;
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('SUPABASE_URL', 'https://proj.supabase.co/');
  vi.stubEnv('SUPABASE_ANON_KEY', 'anon-key');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function loggedText() {
  return logMock.mock.calls.map((c) => String(c[0])).join('\n');
}

describe('requestPasswordReset', () => {
  it('calls the Edge Function with the anon key and a normalised email', async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: true }));
    const res = await requestPasswordReset({ email: ' Asha@Example.com ' });
    expect(res).toEqual({ success: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://proj.supabase.co${SEND_EMAIL_CODE_PATH}`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer anon-key');
    expect(init.headers.apikey).toBe('anon-key');
    expect(JSON.parse(init.body)).toEqual({ purpose: 'reset', email: 'asha@example.com' });
  });

  it('reports a network failure, but never anything about the account', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const res = await requestPasswordReset({ email: 'a@b.co' });
    expect(res.success).toBe(false);
    expect(res.code).toBe('network');
  });

  it('treats a server error as a temporary failure', async () => {
    fetchMock.mockResolvedValue(reply(503, { ok: false, error: 'unavailable' }));
    const res = await requestPasswordReset({ email: 'a@b.co' });
    expect(res).toMatchObject({ success: false, code: 'network' });
  });

  it('needs the server to be configured', async () => {
    vi.stubEnv('SUPABASE_URL', '');
    const res = await requestPasswordReset({ email: 'a@b.co' });
    expect(res.code).toBe('not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('confirmPasswordReset', () => {
  it('applies the same password rule as sign-up before calling the server', async () => {
    const res = await confirmPasswordReset({ email: 'a@b.co', code: '123456', newPassword: '  12345  ' });
    expect(res).toMatchObject({ success: false, code: 'invalid_password', error: 'Password must be at least 6 characters.' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('confirms with the server and refreshes the offline cache with the new password', async () => {
    rpc.mockResolvedValue({ data: [{ ok: true, reason: 'ok' }], error: null });
    const res = await confirmPasswordReset({ email: 'Asha@Example.com', code: ' 042917 ', newPassword: ' newpass123 ' });
    expect(res).toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith('confirm_password_reset', {
      p_email: 'asha@example.com', p_code: '042917', p_new_password: 'newpass123',
    });
    expect(dbRun).toHaveBeenCalledWith('UPDATE user_cache SET password_hash = ? WHERE email = ?', [
      hashLogin('asha@example.com', 'newpass123'), 'asha@example.com',
    ]);
    expect(loggedText()).not.toContain('042917');
    expect(loggedText()).not.toContain('newpass123');
  });

  it('collapses every code failure into one message', async () => {
    rpc.mockResolvedValue({ data: [{ ok: false, reason: 'anything the server says' }], error: null });
    const res = await confirmPasswordReset({ email: 'a@b.co', code: '000000', newPassword: 'newpass123' });
    expect(res).toEqual({ success: false, code: 'invalid_code', error: INVALID_CODE_MESSAGE });
    expect(dbRun).not.toHaveBeenCalled();
  });

  it('passes the server password rule through', async () => {
    rpc.mockResolvedValue({ data: [{ ok: false, reason: 'Password must be at least 6 characters.' }], error: null });
    const res = await confirmPasswordReset({ email: 'a@b.co', code: '000000', newPassword: 'newpass123' });
    expect(res.code).toBe('invalid_password');
  });

  it('reports an unreachable server', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'fetch failed' } });
    const res = await confirmPasswordReset({ email: 'a@b.co', code: '000000', newPassword: 'newpass123' });
    expect(res.code).toBe('network');
  });
});

describe('email verification', () => {
  it('needs an online session', async () => {
    expect((await sendVerificationEmail()).code).toBe('not_signed_in');
    expect((await confirmEmailVerification({ code: '123456' })).code).toBe('not_signed_in');
    expect((await getEmailVerificationStatus()).code).toBe('not_signed_in');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sends the session (not an email) to the Edge Function', async () => {
    activeSession.value = { userId: USER_ID, sessionToken: 'tok', deviceFingerprint: 'fp-1' };
    fetchMock.mockResolvedValue(reply(200, { ok: true }));
    expect(await sendVerificationEmail()).toEqual({ success: true, alreadyVerified: false });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      purpose: 'verify', user_id: USER_ID, session_token: 'tok', device_fingerprint: 'fp-1',
    });
  });

  it('maps Edge Function statuses', async () => {
    activeSession.value = { userId: USER_ID, sessionToken: 'tok', deviceFingerprint: 'fp-1' };
    const cases: Array<[number, unknown, Record<string, unknown>]> = [
      [200, { ok: true, alreadyVerified: true }, { success: true, alreadyVerified: true }],
      [401, {}, { success: false, code: 'unauthorized' }],
      [429, {}, { success: false, code: 'rate_limited' }],
      [502, {}, { success: false, code: 'email_failed' }],
      [500, {}, { success: false, code: 'network' }],
    ];
    for (const [status, body, expected] of cases) {
      fetchMock.mockResolvedValueOnce(reply(status, body));
      expect(await sendVerificationEmail()).toMatchObject(expected);
    }
  });

  it('confirms a code with the session', async () => {
    activeSession.value = { userId: USER_ID, sessionToken: 'tok', deviceFingerprint: 'fp-1' };
    rpc.mockResolvedValueOnce({ data: [{ ok: true, reason: 'ok', verified_at: '2026-10-03T10:00:00Z' }], error: null });
    expect(await confirmEmailVerification({ code: '123456' })).toEqual({ success: true, alreadyVerified: false });
    expect(rpc).toHaveBeenCalledWith('confirm_email_verification', {
      p_user_id: USER_ID, p_session_token: 'tok', p_device_fingerprint: 'fp-1', p_code: '123456',
    });
    rpc.mockResolvedValueOnce({ data: [{ ok: false, reason: 'whatever' }], error: null });
    expect(await confirmEmailVerification({ code: '000000' })).toEqual({ success: false, code: 'invalid_code', error: INVALID_CODE_MESSAGE });
    rpc.mockResolvedValueOnce({ data: [{ ok: false, reason: 'unauthorized' }], error: null });
    expect((await confirmEmailVerification({ code: '000000' })).code).toBe('unauthorized');
  });

  it('reads the verification status', async () => {
    activeSession.value = { userId: USER_ID, sessionToken: 'tok', deviceFingerprint: 'fp-1' };
    rpc.mockResolvedValueOnce({ data: [{ ok: true, email: 'a@b.co', verified_at: null }], error: null });
    expect(await getEmailVerificationStatus()).toEqual({ success: true, verified: false, verifiedAt: null, email: 'a@b.co' });
    rpc.mockResolvedValueOnce({ data: [{ ok: true, email: 'a@b.co', verified_at: '2026-10-03T10:00:00Z' }], error: null });
    expect(await getEmailVerificationStatus()).toMatchObject({ success: true, verified: true });
    rpc.mockResolvedValueOnce({ data: [{ ok: false }], error: null });
    expect(await getEmailVerificationStatus()).toEqual({ success: false, code: 'unauthorized' });
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Could not find the function' } });
    expect(await getEmailVerificationStatus()).toEqual({ success: false, code: 'network' });
  });
});

describe('IPC schemas', () => {
  it('validate reset and verification input', () => {
    expect(passwordResetRequestArgs[0].safeParse({ email: 'a@b.co' }).success).toBe(true);
    expect(passwordResetRequestArgs[0].safeParse({ email: 'nope' }).success).toBe(false);
    expect(passwordResetRequestArgs[0].safeParse({ email: 'a@b.co', extra: 1 }).success).toBe(false);
    expect(passwordResetConfirmArgs[0].safeParse({ email: 'a@b.co', code: '123456', newPassword: 'x' }).success).toBe(true);
    expect(passwordResetConfirmArgs[0].safeParse({ email: 'a@b.co', code: '12345', newPassword: 'secret' }).success).toBe(false);
    expect(passwordResetConfirmArgs[0].safeParse({ email: 'a@b.co', code: '12a456', newPassword: 'secret' }).success).toBe(false);
    expect(emailVerificationConfirmArgs[0].safeParse({ code: ' 123456 ' }).success).toBe(true);
    expect(emailVerificationConfirmArgs[0].safeParse({ code: '1234567' }).success).toBe(false);
  });
});

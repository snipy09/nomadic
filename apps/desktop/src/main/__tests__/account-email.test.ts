import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { rpc, session } = vi.hoisted(() => ({
  rpc: vi.fn(),
  session: { userId: null as string | null, sessionToken: null as string | null, deviceFingerprint: null as string | null },
}));

vi.mock('../services/app-context.js', () => ({ log: vi.fn() }));
vi.mock('../services/session.js', () => ({ session }));
vi.mock('../services/supabase.js', () => ({ getAnonSupabase: () => ({ rpc }) }));

import {
  confirmEmailVerification, confirmPasswordReset, getEmailStatus, requestPasswordReset, sendVerificationEmail,
} from '../services/account-email';
import {
  confirmEmailVerificationArgs, confirmPasswordResetArgs, requestPasswordResetArgs,
} from '../ipc/schemas';

const USER_ID = '44444444-4444-4444-4444-444444444444';
const fetchMock = vi.fn();

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValue({ ok: status < 300, status, json: async () => body });
}

beforeEach(() => {
  rpc.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  process.env.SUPABASE_URL = 'https://proj.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
  Object.assign(session, { userId: USER_ID, sessionToken: 'tok', deviceFingerprint: 'fp' });
});

afterEach(() => vi.unstubAllGlobals());

describe('password reset', () => {
  it('asks the auth-email function to send a code', async () => {
    respond(200, { ok: true });
    expect(await requestPasswordReset(' Asha@Example.com ')).toEqual({ success: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://proj.supabase.co/functions/v1/auth-email');
    expect(JSON.parse(init.body)).toEqual({ action: 'password_reset', email: 'asha@example.com' });
  });

  it('passes the server reason through when the function is not configured', async () => {
    respond(503, { ok: false, reason: 'Email is not configured on the server yet.' });
    expect(await requestPasswordReset('a@b.co')).toEqual({ success: false, error: 'Email is not configured on the server yet.' });
  });

  it('reports an unreachable server', async () => {
    fetchMock.mockRejectedValue(new Error('ENOTFOUND'));
    expect((await requestPasswordReset('a@b.co')).success).toBe(false);
  });

  it('confirms with the code and new password', async () => {
    rpc.mockResolvedValue({ data: [{ ok: true, reason: 'Password changed.' }], error: null });
    expect(await confirmPasswordReset({ email: 'A@b.co', code: '12345678', newPassword: 'newpass1' })).toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith('confirm_password_reset', { p_email: 'a@b.co', p_code: '12345678', p_new_password: 'newpass1' });
  });

  it('shows the server refusal', async () => {
    rpc.mockResolvedValue({ data: [{ ok: false, reason: 'That code is wrong or has expired. Request a new one.' }], error: null });
    expect(await confirmPasswordReset({ email: 'a@b.co', code: '00000000', newPassword: 'newpass1' })).toEqual({
      success: false, error: 'That code is wrong or has expired. Request a new one.',
    });
  });
});

describe('email verification', () => {
  it('sends the device session to the function, never the user id alone', async () => {
    respond(200, { ok: true });
    expect(await sendVerificationEmail()).toEqual({ success: true });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      action: 'email_verification', user_id: USER_ID, session_token: 'tok', device_fingerprint: 'fp',
    });
  });

  it('refuses without a session', async () => {
    Object.assign(session, { userId: null, sessionToken: null, deviceFingerprint: null });
    expect(await sendVerificationEmail()).toEqual({ success: false, error: 'Sign in again to verify your email.' });
    expect(await confirmEmailVerification('12345678')).toEqual({ success: false, error: 'Sign in again to verify your email.' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('confirms a code with the session', async () => {
    rpc.mockResolvedValue({ data: [{ ok: true, reason: 'Email verified.', email_verified_at: '2026-10-03T10:00:00Z' }], error: null });
    expect(await confirmEmailVerification('12345678')).toEqual({ success: true, verifiedAt: '2026-10-03T10:00:00Z' });
    expect(rpc).toHaveBeenCalledWith('confirm_email_verification', {
      p_user_id: USER_ID, p_session_token: 'tok', p_device_fingerprint: 'fp', p_code: '12345678',
    });
  });

  it('reads the status from the server', async () => {
    rpc.mockResolvedValue({ data: [{ ok: true, email: 'a@b.co', email_verified_at: null }], error: null });
    expect(await getEmailStatus()).toEqual({ success: true, email: 'a@b.co', verified: false, verifiedAt: undefined });
    rpc.mockResolvedValue({ data: [{ ok: false, error: 'Unauthorized: Active session required.' }], error: null });
    expect(await getEmailStatus()).toEqual({ success: false, error: 'Unauthorized: Active session required.' });
  });
});

describe('IPC schemas', () => {
  it('normalises and validates the reset email', () => {
    expect(requestPasswordResetArgs[0].parse(' A@B.co ')).toBe('a@b.co');
    expect(requestPasswordResetArgs[0].safeParse('nope').success).toBe(false);
    expect(requestPasswordResetArgs[0].safeParse(42).success).toBe(false);
  });

  it('accepts only 8-digit codes and a 6+ character password', () => {
    expect(confirmEmailVerificationArgs[0].parse(' 12345678 ')).toBe('12345678');
    expect(confirmEmailVerificationArgs[0].safeParse('1234567').success).toBe(false);
    expect(confirmEmailVerificationArgs[0].safeParse('abcdefgh').success).toBe(false);
    expect(confirmPasswordResetArgs[0].safeParse({ email: 'a@b.co', code: '12345678', newPassword: 'newpass1' }).success).toBe(true);
    expect(confirmPasswordResetArgs[0].safeParse({ email: 'a@b.co', code: '12345678', newPassword: '123' }).success).toBe(false);
    expect(confirmPasswordResetArgs[0].safeParse({ email: 'a@b.co', code: '12345678' }).success).toBe(false);
  });
});

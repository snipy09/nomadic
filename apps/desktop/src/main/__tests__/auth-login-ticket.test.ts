import { describe, it, expect, vi, beforeEach } from 'vitest';

// Security S3: the desktop must prove a fresh login to register_device_session by
// passing the one-time ticket that authenticate_user returns.

const rpc = vi.fn();

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/nomadic-test' } }));
vi.mock('../db.js', () => ({
  getDb: () => ({ run: vi.fn(), exec: () => [] }),
  persistDb: vi.fn(),
}));
vi.mock('../device.js', () => ({
  getDeviceIdentifier: () => ({ deviceFingerprint: 'fp-1', deviceName: 'Test Laptop' }),
}));
vi.mock('../services/app-context.js', () => ({ log: vi.fn() }));
vi.mock('../services/session.js', () => ({
  session: { userId: null, sessionToken: null, deviceFingerprint: null, deviceName: null },
  resolvePublicIp: () => Promise.resolve('1.2.3.4'),
  startHeartbeatLoop: vi.fn(),
}));
vi.mock('../services/supabase.js', () => ({ getAnonSupabase: () => ({ rpc }) }));
vi.mock('../services/cloud-sync.js', () => ({ syncPullUserDataToLocalDb: vi.fn().mockResolvedValue(true) }));
vi.mock('../services/profile.js', () => ({
  isOnboardingCompleted: () => false,
  seedProfileIdentity: vi.fn(),
}));

import { loginWithCredentials, readLoginTicket, signupLocalAccount } from '../services/auth';

const USER_ID = '11111111-1111-1111-1111-111111111111';

function authRow(overrides: Record<string, unknown> = {}) {
  return {
    ok: true, reason: 'ok', id: USER_ID, email: 'a@b.co', full_name: 'A B', tier: 'trial', role: 'user',
    status: 'active', license_key: 'NOMADIC-X', expires_at: null, apps_count: 0, login_ticket: 'ticket-123',
    ...overrides,
  };
}

function registerCalls() {
  return rpc.mock.calls.filter(([name]) => name === 'register_device_session').map(([, params]) => params);
}

beforeEach(() => {
  rpc.mockReset();
});

describe('readLoginTicket', () => {
  it('returns the ticket only when it is a non-empty string', () => {
    expect(readLoginTicket({ login_ticket: 'abc' })).toBe('abc');
    expect(readLoginTicket({ login_ticket: '' })).toBe(undefined);
    expect(readLoginTicket({ login_ticket: null })).toBe(undefined);
    expect(readLoginTicket({})).toBe(undefined);
    expect(readLoginTicket(null)).toBe(undefined);
  });
});

describe('password login', () => {
  it('passes the login ticket from authenticate_user to register_device_session', async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === 'authenticate_user') return { data: [authRow()], error: null };
      if (name === 'register_device_session') return { data: [{ ok: true, conflict: false }], error: null };
      return { data: null, error: null };
    });

    const res = await loginWithCredentials({ email: 'A@B.co', password: 'secret12' });

    expect(res.success).toBe(true);
    const calls = registerCalls();
    expect(calls.length).toBe(1);
    expect(calls[0].p_login_ticket).toBe('ticket-123');
    expect(calls[0].p_user_id).toBe(USER_ID);
  });

  it('signs in again on force takeover so a fresh single-use ticket is sent', async () => {
    let n = 0;
    rpc.mockImplementation(async (name: string) => {
      if (name === 'authenticate_user') return { data: [authRow({ login_ticket: `ticket-${++n}` })], error: null };
      if (name === 'register_device_session') return { data: [{ ok: true, conflict: false }], error: null };
      return { data: null, error: null };
    });

    await loginWithCredentials({ email: 'a@b.co', password: 'secret12' });
    await loginWithCredentials({ email: 'a@b.co', password: 'secret12', forceTakeover: true });

    const calls = registerCalls();
    expect(calls[0].p_login_ticket).toBe('ticket-1');
    expect(calls[1].p_login_ticket).toBe('ticket-2');
    expect(calls[1].p_force_takeover).toBe(true);
  });

  it('omits the ticket against a database without migration 008', async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === 'authenticate_user') return { data: [authRow({ login_ticket: undefined })], error: null };
      if (name === 'register_device_session') return { data: [{ ok: true, conflict: false }], error: null };
      return { data: null, error: null };
    });

    await loginWithCredentials({ email: 'a@b.co', password: 'secret12' });

    expect(registerCalls()[0]).not.toHaveProperty('p_login_ticket');
  });

  it('returns the server message and registers nothing on bad credentials', async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === 'authenticate_user') {
        return { data: [authRow({ ok: false, reason: 'Incorrect email or password.', login_ticket: null })], error: null };
      }
      return { data: null, error: null };
    });

    const res = await loginWithCredentials({ email: 'a@b.co', password: 'wrong' });

    expect(res.success).toBe(false);
    expect(res.error).toBe('Incorrect email or password.');
    expect(registerCalls().length).toBe(0);
  });
});

describe('sign-up', () => {
  it('signs in after register_user and sends that ticket to register_device_session', async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === 'register_user') return { data: [authRow({ login_ticket: undefined })], error: null };
      if (name === 'authenticate_user') return { data: [authRow({ login_ticket: 'signup-ticket' })], error: null };
      if (name === 'register_device_session') return { data: [{ ok: true, conflict: false }], error: null };
      return { data: null, error: null };
    });

    const res = await signupLocalAccount({ email: 'a@b.co', password: 'secret12', fullName: 'A B' });

    expect(res.success).toBe(true);
    expect(registerCalls()[0].p_login_ticket).toBe('signup-ticket');
  });

  it('does not use a ticket issued for a different user id', async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === 'register_user') return { data: [authRow()], error: null };
      if (name === 'authenticate_user') return { data: [authRow({ id: 'someone-else', login_ticket: 'x' })], error: null };
      if (name === 'register_device_session') return { data: [{ ok: true, conflict: false }], error: null };
      return { data: null, error: null };
    });

    await signupLocalAccount({ email: 'a@b.co', password: 'secret12' });

    expect(registerCalls()[0]).not.toHaveProperty('p_login_ticket');
  });

  it('asks the user to sign in when the device cannot be registered', async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === 'register_user') return { data: [authRow()], error: null };
      if (name === 'authenticate_user') return { data: null, error: { message: 'down' } };
      if (name === 'register_device_session') {
        return { data: [{ ok: false, conflict: false, reason: 'Sign in again to register this device.' }], error: null };
      }
      return { data: null, error: null };
    });

    const res = await signupLocalAccount({ email: 'a@b.co', password: 'secret12' });

    expect(res.success).toBe(false);
    expect(res.error).toBe('Your account was created. Please sign in to continue.');
  });
});

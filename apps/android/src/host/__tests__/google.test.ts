import { describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ registerPlugin: vi.fn() }));
vi.mock('@nomadic/app-core/main/services/app-context', () => ({ sendToRenderer: vi.fn() }));
vi.mock('@nomadic/app-core/main/services/oauth', () => ({ signInWithGoogleIdToken: vi.fn() }));

import { GOOGLE_CANCELLED, phoneGoogleSignIn, type GoogleDeps } from '../google';

const user = { id: 'u1', email: 'person@example.com' };

function deps(over: Partial<GoogleDeps> = {}): GoogleDeps {
  return {
    clientId: 'web-client.apps.googleusercontent.com',
    plugin: { signIn: vi.fn(async () => ({ idToken: 'id.token.sig' })) },
    signIn: vi.fn(async () => ({ success: true, user: user as never })),
    emit: vi.fn(),
    ...over,
  };
}

describe('phone Google sign-in', () => {
  it('asks the picker for the web client id with a fresh nonce, and verifies the token with that nonce', async () => {
    const d = deps();
    expect(await phoneGoogleSignIn(d, { forceTakeover: true })).toEqual({ success: true });
    const req = (d.plugin.signIn as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(req.serverClientId).toBe('web-client.apps.googleusercontent.com');
    expect(req.nonce).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(d.signIn).toHaveBeenCalledWith('id.token.sig', { nonce: req.nonce, forceTakeover: true });
    expect(d.emit).toHaveBeenCalledWith({ success: true, user });

    await phoneGoogleSignIn(d);
    const second = (d.plugin.signIn as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(second.nonce).not.toBe(req.nonce);
  });

  it('hands a single-device conflict to the sign-in screen', async () => {
    const d = deps({ signIn: vi.fn(async () => ({ success: false, conflict: true, activeDevice: 'Pixel 7' })) });
    expect(await phoneGoogleSignIn(d)).toEqual({ success: true });
    expect(d.emit).toHaveBeenCalledWith({ success: false, conflict: true, activeDevice: 'Pixel 7' });
  });

  it('returns server and picker errors directly, without emitting', async () => {
    const rejected = deps({ signIn: vi.fn(async () => ({ success: false, error: 'Google sign-in could not be verified.' })) });
    expect(await phoneGoogleSignIn(rejected)).toEqual({ success: false, error: 'Google sign-in could not be verified.' });
    expect(rejected.emit).not.toHaveBeenCalled();

    const cancelled = deps({ plugin: { signIn: vi.fn(async () => { throw Object.assign(new Error('x'), { code: 'cancelled' }); }) } });
    expect(await phoneGoogleSignIn(cancelled)).toEqual({ success: false, error: GOOGLE_CANCELLED });
    expect(cancelled.signIn).not.toHaveBeenCalled();

    const noAccount = deps({ plugin: { signIn: vi.fn(async () => { throw Object.assign(new Error('x'), { code: 'no_account' }); }) } });
    expect((await phoneGoogleSignIn(noAccount)).error).toMatch(/Add a Google account/);
  });

  it('is off without a client id, and refuses a second picker while one is open', async () => {
    const off = deps({ clientId: '' });
    expect((await phoneGoogleSignIn(off)).success).toBe(false);
    expect(off.plugin.signIn).not.toHaveBeenCalled();

    let release!: (v: { idToken: string }) => void;
    const slow = deps({ plugin: { signIn: vi.fn(() => new Promise<{ idToken: string }>((r) => { release = r; })) } });
    const first = phoneGoogleSignIn(slow);
    expect(await phoneGoogleSignIn(slow)).toEqual({ success: false, error: 'Google sign-in is already open.' });
    release({ idToken: 't' });
    expect(await first).toEqual({ success: true });
  });
});

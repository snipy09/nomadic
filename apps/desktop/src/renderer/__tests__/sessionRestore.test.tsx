// @vitest-environment jsdom
import './radixShims';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { storedSession, useSessionRestore } from '../features/auth/useSessionRestore';
import { AuthScreen } from '../features/auth/AuthScreen';
import { UIProvider } from '@nomadic/ui';
import type { AppUser, HeartbeatStatus } from '../types';

afterEach(() => { cleanup(); delete (window as any).api; });

const ID = '3f2c9a4e-8b1d-4c6e-9a7f-1e2d3c4b5a69';
const user = (extra: Record<string, unknown> = {}): AppUser => ({
  id: ID, email: 'a@b.in', fullName: 'A', role: 'user', tier: 'free', status: 'active', appsCount: 0, createdAt: '2026-10-01',
  ...extra,
}) as AppUser;

function Probe(props: { user: AppUser | null; onEnded: (r?: string) => void; onStatus: (s: HeartbeatStatus) => void }) {
  const ready = useSessionRestore(props.user, props.onEnded, props.onStatus);
  return <p>{ready ? 'ready' : 'waiting'}</p>;
}

function stubApi() {
  let listener: ((s: HeartbeatStatus) => void) | null = null;
  const api = {
    startHeartbeat: vi.fn().mockResolvedValue({ success: true }),
    onHeartbeatStatus: vi.fn((cb: (s: HeartbeatStatus) => void) => { listener = cb; return () => { listener = null; }; }),
  };
  (window as any).api = api;
  return { api, emit: (s: HeartbeatStatus) => listener?.(s) };
}

describe('storedSession', () => {
  it('needs a user id, session token and device fingerprint', () => {
    expect(storedSession(null)).toBeNull();
    expect(storedSession(user())).toBeNull();
    expect(storedSession(user({ sessionToken: 't' }))).toBeNull();
    expect(storedSession(user({ sessionToken: 't', deviceFingerprint: 'f' })))
      .toEqual({ userId: ID, sessionToken: 't', deviceFingerprint: 'f' });
  });

  it('refuses ids saved by older builds (not an account UUID)', () => {
    expect(storedSession(user({ id: '107482865242299648263', sessionToken: 't', deviceFingerprint: 'f' }))).toBeNull();
    expect(storedSession(user({ id: 7, sessionToken: 't', deviceFingerprint: 'f' }))).toBeNull();
  });
});

describe('useSessionRestore', () => {
  it('hands the saved session back to the main process before the app renders', async () => {
    const { api } = stubApi();
    const onEnded = vi.fn();
    render(<Probe user={user({ sessionToken: 't', deviceFingerprint: 'f' })} onEnded={onEnded} onStatus={vi.fn()} />);
    expect(screen.getByText('waiting')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('ready')).toBeTruthy());
    expect(api.startHeartbeat).toHaveBeenCalledWith(ID, 't', 'f');
    expect(onEnded).not.toHaveBeenCalled();
  });

  it('signs out a saved user that has no session to resume', async () => {
    const { api } = stubApi();
    const onEnded = vi.fn();
    render(<Probe user={user()} onEnded={onEnded} onStatus={vi.fn()} />);
    await waitFor(() => expect(onEnded).toHaveBeenCalled());
    expect(api.startHeartbeat).not.toHaveBeenCalled();
  });

  it('is ready at once with nobody signed in', () => {
    const { api } = stubApi();
    render(<Probe user={null} onEnded={vi.fn()} onStatus={vi.fn()} />);
    expect(screen.getByText('ready')).toBeTruthy();
    expect(api.startHeartbeat).not.toHaveBeenCalled();
  });

  it('shows a sign-out notice that arrives after the sign-in screen mounted', async () => {
    (window as any).api = { onOauthCallback: () => () => {} };
    const { rerender } = render(<UIProvider><AuthScreen onLoginSuccess={vi.fn()} /></UIProvider>);
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(<UIProvider><AuthScreen onLoginSuccess={vi.fn()} notice="You were signed out." /></UIProvider>);
    expect((await screen.findByRole('alert')).textContent).toContain('You were signed out.');
  });

  it('signs out only when the server ends the session, not on a network error', () => {
    const { emit } = stubApi();
    const onEnded = vi.fn();
    const onStatus = vi.fn();
    render(<Probe user={null} onEnded={onEnded} onStatus={onStatus} />);
    act(() => emit({ valid: false, reason: 'fetch failed' }));
    expect(onEnded).not.toHaveBeenCalled();
    act(() => emit({ valid: false, reason: 'Signed in on another device', ended: true }));
    expect(onEnded).toHaveBeenCalledWith('Signed in on another device');
    expect(onStatus).toHaveBeenCalledTimes(2);
  });
});

// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UIProvider } from '@nomadic/ui';
import './radixShims';
import { AuthScreen } from '../features/auth/AuthScreen';

afterEach(() => {
  cleanup();
  delete (window as any).api;
  localStorage.clear();
});

const user = { id: 'u1', email: 'asha@example.com', fullName: 'Asha Rao', role: 'user', tier: 'trial', status: 'active', appsCount: 0, createdAt: '' };

function setup(api: Record<string, unknown> = {}) {
  let oauthCb: ((data: unknown) => void) | null = null;
  (window as any).api = {
    authLogin: vi.fn().mockResolvedValue({ success: true, user }),
    authSignup: vi.fn().mockResolvedValue({ success: true, user }),
    authGoogle: vi.fn().mockResolvedValue({ success: true }),
    onOauthCallback: (cb: (data: unknown) => void) => { oauthCb = cb; return () => { oauthCb = null; }; },
    ...api,
  };
  const onLoginSuccess = vi.fn();
  render(<UIProvider><AuthScreen onLoginSuccess={onLoginSuccess} /></UIProvider>);
  return { onLoginSuccess, api: (window as any).api, emitOAuth: (d: unknown) => act(() => oauthCb?.(d)) };
}

const fillSignIn = async (email = 'asha@example.com', password = 'secret12') => {
  await userEvent.type(screen.getByLabelText(/^email/i), email);
  await userEvent.type(screen.getByLabelText(/^password/i), password);
};

describe('AuthScreen', () => {
  it('requires accepting the terms before signing in', async () => {
    const { api, onLoginSuccess } = setup();
    await fillSignIn();
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(await screen.findByText(/accept the terms/i)).toBeTruthy();
    expect(api.authLogin).not.toHaveBeenCalled();
    expect(onLoginSuccess).not.toHaveBeenCalled();
  });

  it('signs in and remembers that the terms were accepted', async () => {
    const { api, onLoginSuccess } = setup();
    await fillSignIn('Asha@Example.com');
    await userEvent.click(screen.getByRole('checkbox', { name: /terms of service/i }));
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    await waitFor(() => expect(onLoginSuccess).toHaveBeenCalledWith(user));
    expect(api.authLogin).toHaveBeenCalledWith({ email: 'asha@example.com', password: 'secret12', forceTakeover: false });
    expect(localStorage.getItem('nomadic_terms_accepted')).toBe('true');
  });

  it('shows one generic message for bad credentials, whatever the server said', async () => {
    localStorage.setItem('nomadic_terms_accepted', 'true');
    const { onLoginSuccess } = setup({ authLogin: vi.fn().mockResolvedValue({ success: false, error: 'Incorrect password.' }) });
    await fillSignIn();
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    const alert = await screen.findByText('Incorrect email or password.');
    expect(alert).toBeTruthy();
    expect(screen.queryByText(/incorrect password\./i)).toBe(null);
    expect(onLoginSuccess).not.toHaveBeenCalled();
  });

  it('asks before taking over a session on another computer', async () => {
    localStorage.setItem('nomadic_terms_accepted', 'true');
    const authLogin = vi.fn()
      .mockResolvedValueOnce({ success: false, conflict: true, activeDevice: 'HP Pavilion' })
      .mockResolvedValueOnce({ success: true, user });
    const { onLoginSuccess } = setup({ authLogin });
    await fillSignIn();
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(await screen.findByText(/active on HP Pavilion/i)).toBeTruthy();
    expect(onLoginSuccess).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /continue here/i }));
    await waitFor(() => expect(onLoginSuccess).toHaveBeenCalledWith(user));
    expect(authLogin.mock.calls[1][0].forceTakeover).toBe(true);
  });

  it('creates an account with name, email and password', async () => {
    localStorage.setItem('nomadic_terms_accepted', 'true');
    const { api, onLoginSuccess } = setup();
    await userEvent.click(screen.getByRole('tab', { name: /create account/i }));
    await userEvent.type(await screen.findByLabelText(/full name/i), 'Asha Rao');
    await userEvent.type(screen.getByLabelText(/^email/i), 'asha@example.com');
    await userEvent.type(screen.getByLabelText(/^password/i), '123');
    await userEvent.click(screen.getByRole('button', { name: /^create account$/i }));
    expect(await screen.findByText(/at least 6 characters\./i)).toBeTruthy();
    expect(api.authSignup).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText(/^password/i), '456');
    await userEvent.click(screen.getByRole('button', { name: /^create account$/i }));
    await waitFor(() => expect(onLoginSuccess).toHaveBeenCalledWith(user));
    expect(api.authSignup).toHaveBeenCalledWith({ email: 'asha@example.com', password: '123456', fullName: 'Asha Rao' });
  });

  it('shows the server reason when sign-up is refused', async () => {
    localStorage.setItem('nomadic_terms_accepted', 'true');
    setup({ authSignup: vi.fn().mockResolvedValue({ success: false, error: 'Too many sign-up attempts. Try again in 15 minutes.' }) });
    await userEvent.click(screen.getByRole('tab', { name: /create account/i }));
    await userEvent.type(await screen.findByLabelText(/full name/i), 'Asha');
    await fillSignIn('asha@example.com', 'secret12');
    await userEvent.click(screen.getByRole('button', { name: /^create account$/i }));
    expect(await screen.findByText(/too many sign-up attempts/i)).toBeTruthy();
  });

  it('can be completed with the keyboard only', async () => {
    const { onLoginSuccess } = setup();
    // Email has focus on load.
    await userEvent.keyboard('asha@example.com');
    await userEvent.tab();
    await userEvent.keyboard('secret12');
    await userEvent.tab(); // show-password toggle
    await userEvent.tab(); // forgot password link
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /forgot password/i }));
    await userEvent.tab(); // terms checkbox
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: /terms of service/i }));
    await userEvent.keyboard(' ');
    await userEvent.click(screen.getByLabelText(/^password/i)); // back into a field, then submit with Enter
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(onLoginSuccess).toHaveBeenCalledWith(user));
  });

  it('signs in with Google once the browser flow reports back', async () => {
    const { api, onLoginSuccess, emitOAuth } = setup();
    await userEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    expect(await screen.findByText(/accept the terms/i)).toBeTruthy();
    expect(screen.queryByText(/enter your email/i)).toBe(null);
    expect(api.authGoogle).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('checkbox', { name: /terms of service/i }));
    await userEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    expect(await screen.findByText(/finish signing in with google/i)).toBeTruthy();
    expect(api.authGoogle).toHaveBeenCalledTimes(1);

    emitOAuth({ success: true, user });
    expect(onLoginSuccess).toHaveBeenCalledWith(user);
  });

  it('reports a failed Google sign-in and lets the user retry', async () => {
    localStorage.setItem('nomadic_terms_accepted', 'true');
    const { emitOAuth, onLoginSuccess } = setup();
    await userEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    emitOAuth({ success: false, error: 'access_denied' });
    expect(await screen.findByText(/google sign-in did not finish: access_denied/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeTruthy();
    expect(onLoginSuccess).not.toHaveBeenCalled();
  });
});

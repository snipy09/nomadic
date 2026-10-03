// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UIProvider } from '@nomadic/ui';
import './radixShims';
import { AuthScreen } from '../features/auth/AuthScreen';

afterEach(() => {
  cleanup();
  delete (window as any).api;
  localStorage.clear();
});

function setup(over: Record<string, unknown> = {}) {
  const api = {
    authLogin: vi.fn(),
    authSignup: vi.fn(),
    authGoogle: vi.fn(),
    onOauthCallback: () => () => {},
    requestPasswordReset: vi.fn().mockResolvedValue({ success: true }),
    confirmPasswordReset: vi.fn().mockResolvedValue({ success: true }),
    ...over,
  };
  (window as any).api = api;
  render(<UIProvider><AuthScreen onLoginSuccess={vi.fn()} /></UIProvider>);
  return api;
}

describe('Forgot password', () => {
  it('requests a code, then sets a new password with it', async () => {
    const api = setup();
    await userEvent.type(screen.getByLabelText(/^email/i), 'Asha@Example.com');
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }));

    // The email typed on the sign-in form carries over.
    expect((screen.getByLabelText(/^email/i) as HTMLInputElement).value).toBe('Asha@Example.com');
    await userEvent.click(screen.getByRole('button', { name: /email me a code/i }));
    await waitFor(() => expect(api.requestPasswordReset).toHaveBeenCalledWith('asha@example.com'));
    expect(await screen.findByText(/if asha@example.com has a nomadic account/i)).toBeTruthy();

    await userEvent.type(screen.getByLabelText(/^code/i), '1234 5678');
    await userEvent.type(screen.getByLabelText(/^new password/i), 'newpass1');
    await userEvent.type(screen.getByLabelText(/^confirm new password/i), 'newpass1');
    await userEvent.click(screen.getByRole('button', { name: /set new password/i }));

    await waitFor(() => expect(api.confirmPasswordReset).toHaveBeenCalledWith({
      email: 'asha@example.com', code: '12345678', newPassword: 'newpass1',
    }));
    expect(await screen.findByText(/password changed/i)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /back to sign in/i }));
    expect(screen.getByRole('form', { name: /sign in/i })).toBeTruthy();
    expect((screen.getByLabelText(/^email/i) as HTMLInputElement).value).toBe('asha@example.com');
  });

  it('validates before calling the server', async () => {
    const api = setup();
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }));
    await userEvent.click(screen.getByRole('button', { name: /email me a code/i }));
    expect(await screen.findByText('Enter your email.')).toBeTruthy();
    expect(api.requestPasswordReset).not.toHaveBeenCalled();
  });

  it('shows the server error for a wrong code and lets the user try again', async () => {
    const api = setup({
      confirmPasswordReset: vi.fn().mockResolvedValue({ success: false, error: 'That code is wrong or has expired. Request a new one.' }),
    });
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }));
    await userEvent.type(screen.getByLabelText(/^email/i), 'a@b.co');
    await userEvent.click(screen.getByRole('button', { name: /email me a code/i }));
    await userEvent.type(await screen.findByLabelText(/^code/i), '00000000');
    await userEvent.type(screen.getByLabelText(/^new password/i), 'newpass1');
    await userEvent.type(screen.getByLabelText(/^confirm new password/i), 'newpass1');
    await userEvent.click(screen.getByRole('button', { name: /set new password/i }));

    expect((await screen.findByRole('alert')).textContent).toContain('wrong or has expired');
    await userEvent.click(screen.getByRole('button', { name: /send a new code/i }));
    await waitFor(() => expect(api.requestPasswordReset).toHaveBeenCalledTimes(2));
  });

  it('is not offered on the create-account tab', async () => {
    setup();
    await userEvent.click(screen.getByRole('tab', { name: /create account/i }));
    expect(screen.queryByRole('button', { name: /forgot password/i })).toBe(null);
  });
});

// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UIProvider } from '@nomadic/ui';
import './radixShims';
import { AuthScreen } from '../features/auth/AuthScreen';
import { EmailVerificationNotice } from '../features/auth/EmailVerificationNotice';

afterEach(() => {
  cleanup();
  delete (window as any).api;
  localStorage.clear();
});

const user = { id: 'u1', email: 'asha@example.com', fullName: 'Asha Rao', role: 'user', tier: 'trial', status: 'active', appsCount: 0, createdAt: '' };
const INVALID = 'That code is not valid or has expired. Request a new code.';

function setup(api: Record<string, unknown> = {}) {
  (window as any).api = {
    authLogin: vi.fn().mockResolvedValue({ success: true, user }),
    authSignup: vi.fn().mockResolvedValue({ success: true, user }),
    authGoogle: vi.fn().mockResolvedValue({ success: true }),
    onOauthCallback: () => () => {},
    authRequestPasswordReset: vi.fn().mockResolvedValue({ success: true }),
    authConfirmPasswordReset: vi.fn().mockResolvedValue({ success: true }),
    authSendVerification: vi.fn().mockResolvedValue({ success: true }),
    authConfirmVerification: vi.fn().mockResolvedValue({ success: true }),
    ...api,
  };
  const onLoginSuccess = vi.fn();
  render(<UIProvider><AuthScreen onLoginSuccess={onLoginSuccess} /></UIProvider>);
  return { onLoginSuccess, api: (window as any).api };
}

describe('Forgot password', () => {
  it('resets the password: email, code and new password, then back to sign in', async () => {
    const { api } = setup();
    await userEvent.type(screen.getByLabelText(/^email/i), 'Asha@Example.com');
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }));

    expect(screen.getByRole('heading', { name: /reset your password/i })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /create account/i })).toBe(null);
    const email = screen.getByLabelText(/^email/i) as HTMLInputElement;
    expect(email.value).toBe('Asha@Example.com');
    await userEvent.click(screen.getByRole('button', { name: /send code/i }));

    expect(api.authRequestPasswordReset).toHaveBeenCalledWith({ email: 'asha@example.com' });
    expect(await screen.findByText(/if an account exists for/i)).toBeTruthy();

    await userEvent.type(screen.getByLabelText(/^code/i), '042 917');
    await userEvent.type(screen.getByLabelText(/^new password/i), 'newpass123');
    await userEvent.click(screen.getByRole('button', { name: /update password/i }));

    expect(api.authConfirmPasswordReset).toHaveBeenCalledWith({ email: 'asha@example.com', code: '042917', newPassword: 'newpass123' });
    expect(await screen.findByRole('heading', { name: /password updated/i })).toBeTruthy();
    expect(screen.getByText(/has been signed out/i)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /back to sign in/i }));
    expect(screen.getByRole('heading', { name: /sign in to nomadic/i })).toBeTruthy();
    expect((screen.getByLabelText(/^email/i) as HTMLInputElement).value).toBe('asha@example.com');
    expect((screen.getByLabelText(/^password/i) as HTMLInputElement).value).toBe('');
  });

  it('checks the email and the password rule before calling the main process', async () => {
    const { api } = setup();
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }));
    await userEvent.click(screen.getByRole('button', { name: /send code/i }));
    expect(await screen.findByText(/enter your email/i)).toBeTruthy();
    expect(api.authRequestPasswordReset).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/^email/i), 'asha@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send code/i }));
    await userEvent.type(await screen.findByLabelText(/^code/i), '12345');
    await userEvent.type(screen.getByLabelText(/^new password/i), '123');
    await userEvent.click(screen.getByRole('button', { name: /update password/i }));
    expect(await screen.findByText(/enter the 6-digit code/i)).toBeTruthy();
    expect(screen.getByText(/use at least 6 characters/i)).toBeTruthy();
    expect(api.authConfirmPasswordReset).not.toHaveBeenCalled();
  });

  it('shows one generic message for a bad code and clears the field', async () => {
    setup({ authConfirmPasswordReset: vi.fn().mockResolvedValue({ success: false, code: 'invalid_code', error: INVALID }) });
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }));
    await userEvent.type(screen.getByLabelText(/^email/i), 'asha@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send code/i }));
    await userEvent.type(await screen.findByLabelText(/^code/i), '000000');
    await userEvent.type(screen.getByLabelText(/^new password/i), 'newpass123');
    await userEvent.click(screen.getByRole('button', { name: /update password/i }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(INVALID);
    expect((screen.getByLabelText(/^code/i) as HTMLInputElement).value).toBe('');
  });

  it('can request a new code and go back', async () => {
    const { api } = setup();
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }));
    await userEvent.type(screen.getByLabelText(/^email/i), 'asha@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send code/i }));
    await userEvent.click(await screen.findByRole('button', { name: /send a new code/i }));
    expect(api.authRequestPasswordReset).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/earlier codes no longer work/i)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /back to sign in/i }));
    expect(screen.getByRole('heading', { name: /sign in to nomadic/i })).toBeTruthy();
  });

  it('shows a network error from the main process', async () => {
    setup({ authRequestPasswordReset: vi.fn().mockResolvedValue({ success: false, code: 'network', error: 'Could not reach the server. Check your connection and try again.' }) });
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }));
    await userEvent.type(screen.getByLabelText(/^email/i), 'asha@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send code/i }));
    expect(await screen.findByText(/could not reach the server/i)).toBeTruthy();
    expect(screen.queryByLabelText(/^code/i)).toBe(null);
  });

  it('can be completed with the keyboard only', async () => {
    const { api } = setup();
    // Email (focused) -> password -> show-password -> terms -> read terms -> sign in -> forgot password
    await userEvent.keyboard('asha@example.com');
    for (let i = 0; i < 6; i++) await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /forgot password/i }));
    await userEvent.keyboard('{Enter}');
    expect(document.activeElement).toBe(screen.getByLabelText(/^email/i));
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/^code/i)));
    await userEvent.keyboard('123456');
    await userEvent.tab();
    await userEvent.keyboard('newpass123{Enter}');
    expect(api.authConfirmPasswordReset).toHaveBeenCalledWith({ email: 'asha@example.com', code: '123456', newPassword: 'newpass123' });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: /back to sign in/i })));
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/^password/i)));
  });
});

describe('Verify email after sign-up', () => {
  async function signUp() {
    localStorage.setItem('nomadic_terms_accepted', 'true');
    const ctx = setup();
    await userEvent.click(screen.getByRole('tab', { name: /create account/i }));
    await userEvent.type(await screen.findByLabelText(/full name/i), 'Asha Rao');
    await userEvent.type(screen.getByLabelText(/^email/i), 'asha@example.com');
    await userEvent.type(screen.getByLabelText(/^password/i), 'secret12');
    await userEvent.click(screen.getByRole('button', { name: /^create account$/i }));
    return ctx;
  }

  it('sends a code once and continues after verifying', async () => {
    const { api, onLoginSuccess } = await signUp();
    expect(await screen.findByRole('heading', { name: /verify your email/i })).toBeTruthy();
    expect(await screen.findByText(/we sent a 6-digit code to asha@example.com/i)).toBeTruthy();
    expect(api.authSendVerification).toHaveBeenCalledTimes(1);
    expect(onLoginSuccess).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/^code/i)));
    await userEvent.keyboard('123456{Enter}');
    expect(api.authConfirmVerification).toHaveBeenCalledWith({ code: '123456' });
    await waitFor(() => expect(onLoginSuccess).toHaveBeenCalledWith(user));
  });

  it('can be skipped without blocking the account', async () => {
    const { onLoginSuccess } = await signUp();
    await userEvent.click(await screen.findByRole('button', { name: /skip for now/i }));
    expect(onLoginSuccess).toHaveBeenCalledWith(user);
  });

  it('shows why a code could not be sent and still allows skipping', async () => {
    localStorage.setItem('nomadic_terms_accepted', 'true');
    const { onLoginSuccess } = setup({
      authSendVerification: vi.fn().mockResolvedValue({ success: false, code: 'email_failed', error: 'We could not send the email right now. Try again later.' }),
    });
    await userEvent.click(screen.getByRole('tab', { name: /create account/i }));
    await userEvent.type(await screen.findByLabelText(/full name/i), 'Asha');
    await userEvent.type(screen.getByLabelText(/^email/i), 'asha@example.com');
    await userEvent.type(screen.getByLabelText(/^password/i), 'secret12');
    await userEvent.click(screen.getByRole('button', { name: /^create account$/i }));
    expect(await screen.findByText(/could not send the email/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /send code/i })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    expect(onLoginSuccess).toHaveBeenCalledWith(user);
  });
});

describe('EmailVerificationNotice (Settings > Account)', () => {
  function renderNotice(api: Record<string, unknown>) {
    (window as any).api = {
      authSendVerification: vi.fn().mockResolvedValue({ success: true }),
      authConfirmVerification: vi.fn().mockResolvedValue({ success: true }),
      ...api,
    };
    render(<UIProvider><EmailVerificationNotice email="asha@example.com" /></UIProvider>);
    return (window as any).api;
  }

  it('reminds an unverified account and verifies through a dialog', async () => {
    const api = renderNotice({ authVerificationStatus: vi.fn().mockResolvedValue({ success: true, verified: false }) });
    expect(await screen.findByText(/not verified yet/i)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /verify email/i }));
    expect(await screen.findByRole('dialog', { name: /verify your email/i })).toBeTruthy();
    await waitFor(() => expect(api.authSendVerification).toHaveBeenCalledTimes(1));
    await userEvent.type(await screen.findByLabelText(/^code/i), '654321');
    await userEvent.click(screen.getByRole('button', { name: /^verify email$/i, hidden: false }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBe(null));
    expect(api.authConfirmVerification).toHaveBeenCalledWith({ code: '654321' });
    expect(screen.getByText('Verified')).toBeTruthy();
  });

  it('shows a badge when verified', async () => {
    renderNotice({ authVerificationStatus: vi.fn().mockResolvedValue({ success: true, verified: true }) });
    expect(await screen.findByText('Verified')).toBeTruthy();
  });

  it('shows nothing when the status cannot be read', async () => {
    const status = vi.fn().mockResolvedValue({ success: false, code: 'network' });
    renderNotice({ authVerificationStatus: status });
    await waitFor(() => expect(status).toHaveBeenCalled());
    expect(screen.queryByText(/not verified/i)).toBe(null);
    expect(screen.queryByText('Verified')).toBe(null);
  });
});

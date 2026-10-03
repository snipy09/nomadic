// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UIProvider } from '@nomadic/ui';
import { EmailVerificationBanner } from '../features/auth/EmailVerificationBanner';

afterEach(() => {
  cleanup();
  delete (window as any).api;
});

function mockApi(over: Record<string, unknown> = {}) {
  const api = {
    getEmailStatus: vi.fn().mockResolvedValue({ success: true, email: 'asha@example.com', verified: false }),
    sendVerificationEmail: vi.fn().mockResolvedValue({ success: true }),
    confirmEmailVerification: vi.fn().mockResolvedValue({ success: true, verifiedAt: '2026-10-03T10:00:00Z' }),
    ...over,
  };
  (window as any).api = api;
  return api;
}

const renderBanner = () => render(<UIProvider><EmailVerificationBanner userId="u1" /></UIProvider>);

describe('EmailVerificationBanner', () => {
  it('sends a code and verifies it, then disappears', async () => {
    const api = mockApi();
    renderBanner();
    expect(await screen.findByText(/confirm asha@example.com/i)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /email me a code/i }));
    await waitFor(() => expect(api.sendVerificationEmail).toHaveBeenCalledTimes(1));
    await userEvent.type(await screen.findByLabelText(/^code/i), '87654321');
    await userEvent.click(screen.getByRole('button', { name: /^verify$/i }));

    await waitFor(() => expect(api.confirmEmailVerification).toHaveBeenCalledWith('87654321'));
    await waitFor(() => expect(screen.queryByRole('region', { name: /verify your email/i })).toBe(null));
  });

  it('shows nothing when the server says the email is verified', async () => {
    const api = mockApi({ getEmailStatus: vi.fn().mockResolvedValue({ success: true, email: 'a@b.co', verified: true }) });
    renderBanner();
    await waitFor(() => expect(api.getEmailStatus).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: /verify your email/i })).toBe(null);
  });

  it('shows nothing when the status is unknown (offline), rather than guessing', async () => {
    const api = mockApi({ getEmailStatus: vi.fn().mockResolvedValue({ success: false, error: 'Could not reach the server.' }) });
    renderBanner();
    await waitFor(() => expect(api.getEmailStatus).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: /verify your email/i })).toBe(null);
  });

  it('shows the send error with a way to retry', async () => {
    mockApi({ sendVerificationEmail: vi.fn().mockResolvedValue({ success: false, error: 'Too many emails requested. Try again later.' }) });
    renderBanner();
    await userEvent.click(await screen.findByRole('button', { name: /email me a code/i }));
    expect((await screen.findByRole('alert')).textContent).toContain('Too many emails');
    expect(screen.getByRole('button', { name: /email me a code/i })).toBeTruthy();
  });

  it('can be put off for this session', async () => {
    mockApi();
    renderBanner();
    await userEvent.click(await screen.findByRole('button', { name: /later/i }));
    expect(screen.queryByRole('region', { name: /verify your email/i })).toBe(null);
  });
});

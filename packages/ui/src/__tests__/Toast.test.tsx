// @vitest-environment jsdom
import './setup';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, UIProvider, useToast, type ToastOptions } from '../index';

function Trigger({ options }: { options: ToastOptions }) {
  const { toast } = useToast();
  return <Button onClick={() => toast(options)}>Notify</Button>;
}

describe('Toast', () => {
  it('shows a toast from the hook inside a labelled notifications region', async () => {
    const user = userEvent.setup();
    render(
      <UIProvider>
        <Trigger options={{ title: 'Saved', description: 'Profile updated.', tone: 'success' }} />
      </UIProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Notify' }));
    expect(await screen.findByText('Saved')).toBeTruthy();
    expect(screen.getByText('Profile updated.')).toBeTruthy();
    expect(screen.getByRole('region', { name: /Notifications/ })).toBeTruthy();
  });

  it('runs the action and can be dismissed with the close button', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    render(
      <UIProvider>
        <Trigger options={{ title: 'Job archived', action: { label: 'Undo', onClick: onUndo } }} />
      </UIProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Notify' }));
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Notify' }));
    await screen.findByText('Job archived');
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    await waitFor(() => expect(screen.queryByText('Job archived')).toBeNull());
  });

  it('updates a toast in place when the same id is reused', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => <UIProvider>{children}</UIProvider>;
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current.toast({ id: 'apply', title: 'Applying…', tone: 'loading' });
    });
    expect(await screen.findByText('Applying…')).toBeTruthy();
    act(() => {
      result.current.toast({ id: 'apply', title: 'Applied to 3 jobs', tone: 'success' });
    });
    expect(await screen.findByText('Applied to 3 jobs')).toBeTruthy();
    expect(screen.queryByText('Applying…')).toBeNull();
  });

  it('auto-dismisses after its duration', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => <UIProvider>{children}</UIProvider>;
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current.toast({ title: 'Quick note', duration: 50 });
    });
    expect(await screen.findByText('Quick note')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Quick note')).toBeNull(), { timeout: 2000 });
  });

  it('throws a helpful error outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const swallow = (e: ErrorEvent) => e.preventDefault();
    window.addEventListener('error', swallow);
    expect(() => renderHook(() => useToast())).toThrow(/ToastProvider/);
    window.removeEventListener('error', swallow);
    spy.mockRestore();
  });
});

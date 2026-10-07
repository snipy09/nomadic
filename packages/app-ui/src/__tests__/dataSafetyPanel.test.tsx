// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UIProvider } from '@nomadic/ui';
import './radixShims';
import { DataSafetyPanel } from '../features/data-safety/DataSafetyPanel';

afterEach(() => {
  cleanup();
  delete (window as any).api;
});

const healthy = {
  success: true,
  health: { startup: 'ok', migration: 'up_to_date', schemaVersion: 2, latestSchemaVersion: 2, integrity: 'ok', checkedAt: '2026-10-03T10:00:00Z' },
  backups: 2,
  latestBackupAt: '2026-10-02T10:00:00Z',
  sizeBytes: 40960,
};

function mockApi(over: Record<string, unknown> = {}) {
  const api = {
    getDataHealth: vi.fn().mockResolvedValue(healthy),
    copyDiagnostics: vi.fn().mockResolvedValue({ success: true, text: 'Nomadic diagnostics\nApp: 1.0.6' }),
    exportAccountData: vi.fn().mockResolvedValue({ success: true, filePath: 'C:/Downloads/nomadic-export.json', serverIncluded: true }),
    deleteAccount: vi.fn().mockResolvedValue({ success: true }),
    ...over,
  };
  (window as any).api = api;
  return api;
}

const renderPanel = (onAccountDeleted = vi.fn()) => {
  render(<UIProvider><DataSafetyPanel accountEmail="asha@example.com" onAccountDeleted={onAccountDeleted} /></UIProvider>);
  return onAccountDeleted;
};

describe('DataSafetyPanel', () => {
  it('shows the local database health reported by the main process', async () => {
    mockApi();
    renderPanel();
    expect(await screen.findByText('Local data is healthy')).toBeTruthy();
    expect(screen.getByText(/40\.0 KB/)).toBeTruthy();
    expect(screen.getByText(/2 backups kept/)).toBeTruthy();
  });

  it('warns when the database was restored from a backup', async () => {
    mockApi({ getDataHealth: vi.fn().mockResolvedValue({ ...healthy, health: { ...healthy.health, startup: 'recovered_from_backup' } }) });
    renderPanel();
    expect(await screen.findByText('Restored from backup')).toBeTruthy();
  });

  it('shows an error with retry when the status cannot be read', async () => {
    const api = mockApi({ getDataHealth: vi.fn().mockRejectedValue(new Error('IPC down')) });
    renderPanel();
    expect((await screen.findByRole('alert')).textContent).toContain('IPC down');
    api.getDataHealth.mockResolvedValue(healthy);
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('Local data is healthy')).toBeTruthy();
  });

  it('copies diagnostics and shows what was copied', async () => {
    const api = mockApi();
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: /copy diagnostics/i }));
    await waitFor(() => expect(api.copyDiagnostics).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/diagnostics copied/i)).toBeTruthy();
    expect(screen.getByText(/show what was copied/i)).toBeTruthy();
  });

  it('exports data and says when only local data could be included', async () => {
    mockApi({ exportAccountData: vi.fn().mockResolvedValue({ success: true, filePath: 'D:/x.json', serverIncluded: false }) });
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: /export data/i }));
    expect(await screen.findByText(/only data on this computer is included/i)).toBeTruthy();
  });

  it('treats a cancelled save dialog as nothing happened', async () => {
    mockApi({ exportAccountData: vi.fn().mockResolvedValue({ success: false, canceled: true }) });
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: /export data/i }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBe(null));
  });

  it('deletes the account only after the email and password are confirmed', async () => {
    const api = mockApi();
    const onDeleted = renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: /delete account…/i }));
    await userEvent.click(screen.getByRole('button', { name: /delete account permanently/i }));
    expect(await screen.findByText('Type your account email.')).toBeTruthy();
    expect(api.deleteAccount).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/to confirm/i), 'someone@else.com');
    await userEvent.type(screen.getByLabelText(/^password/i), 'secret12');
    await userEvent.click(screen.getByRole('button', { name: /delete account permanently/i }));
    expect(await screen.findByText('This does not match your account email.')).toBeTruthy();
    expect(api.deleteAccount).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText(/to confirm/i));
    await userEvent.type(screen.getByLabelText(/to confirm/i), 'Asha@Example.com');
    await userEvent.click(screen.getByRole('button', { name: /delete account permanently/i }));
    await waitFor(() => expect(api.deleteAccount).toHaveBeenCalledWith({ confirmEmail: 'asha@example.com', password: 'secret12' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });

  it('keeps the dialog open with the server reason when deletion fails', async () => {
    mockApi({ deleteAccount: vi.fn().mockResolvedValue({ success: false, error: 'Incorrect email or password.' }) });
    const onDeleted = renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: /delete account…/i }));
    await userEvent.type(screen.getByLabelText(/to confirm/i), 'asha@example.com');
    await userEvent.type(screen.getByLabelText(/^password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /delete account permanently/i }));
    expect((await screen.findByRole('alert')).textContent).toContain('Incorrect email or password.');
    expect(onDeleted).not.toHaveBeenCalled();
  });
});

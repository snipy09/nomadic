// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UIProvider } from '@nomadic/ui';
import './radixShims';
import { summarizeUpdater, topBarUpdateLabel } from '../features/updates/updatesLogic';
import { UpdateSettingsCard } from '../features/updates/UpdateSettingsCard';
import { TopBarUpdateButton } from '../features/updates/TopBarUpdateButton';
import { UpdateRequiredScreen } from '../features/updates/UpdateRequiredScreen';
import { WhatsNewDialog } from '../features/updates/WhatsNewDialog';
import { HelpView } from '../features/help/HelpView';
import { CrashReportsCard } from '../features/help/CrashReportsCard';
import { validateFeedback } from '../features/help/feedbackLogic';

afterEach(() => {
  cleanup();
  delete (window as any).api;
});

const status = (over: Record<string, unknown> = {}) => ({ state: 'idle', currentVersion: '1.0.6', channel: 'stable', ...over });

function mockApi(over: Record<string, unknown> = {}) {
  let push: ((s: unknown) => void) | null = null;
  const api = {
    updaterGetStatus: vi.fn().mockResolvedValue(status()),
    updaterCheck: vi.fn().mockResolvedValue(status({ state: 'available', version: '1.0.7', releaseNotes: 'Fixes login' })),
    updaterDownload: vi.fn().mockResolvedValue(status({ state: 'downloading', version: '1.0.7', percent: 0 })),
    updaterInstall: vi.fn().mockResolvedValue({ success: true }),
    updaterSetChannel: vi.fn().mockImplementation(async (c: string) => status({ channel: c, state: 'up_to_date' })),
    onUpdaterStatus: (cb: (s: unknown) => void) => { push = cb; return () => { push = null; }; },
    getWhatsNew: vi.fn().mockResolvedValue(null),
    dismissWhatsNew: vi.fn().mockResolvedValue({ success: true }),
    getTelemetry: vi.fn().mockResolvedValue({ crashReports: false, available: true, active: false }),
    setTelemetry: vi.fn().mockImplementation(async (v: boolean) => ({ crashReports: v, available: true, active: v })),
    sendFeedback: vi.fn().mockResolvedValue({ success: true, via: 'email', note: 'Your email app opened a message to sajalmishra0908@gmail.com. Press send there.' }),
    openExternalUrl: vi.fn().mockResolvedValue({ success: true }),
    ...over,
  };
  (window as any).api = api;
  return { api, push: (s: unknown) => act(() => push?.(s)) };
}

const ui = (el: React.ReactElement) => render(<UIProvider>{el}</UIProvider>);

describe('updates logic', () => {
  it('offers the one sensible action per state', () => {
    expect(summarizeUpdater(status({ state: 'available', version: '1.0.7' }) as any).action).toBe('download');
    expect(summarizeUpdater(status({ state: 'downloaded', version: '1.0.7' }) as any).action).toBe('install');
    expect(summarizeUpdater(status({ state: 'downloading', percent: 40 }) as any).busy).toBe(true);
    expect(summarizeUpdater(status({ state: 'unsupported' }) as any).action).toBe(null);
    expect(topBarUpdateLabel(status({ state: 'up_to_date' }) as any)).toBe(null);
    expect(topBarUpdateLabel(status({ state: 'downloaded' }) as any)).toBe('Restart to update');
  });
});

describe('UpdateSettingsCard', () => {
  it('checks, downloads with progress, and installs on request', async () => {
    const { api, push } = mockApi();
    ui(<UpdateSettingsCard />);
    await userEvent.click(await screen.findByRole('button', { name: /check for updates/i }));
    expect(await screen.findByText('Version 1.0.7 is available')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /download update/i }));
    await waitFor(() => expect(api.updaterDownload).toHaveBeenCalled());
    push(status({ state: 'downloading', version: '1.0.7', percent: 55 }));
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('55');
    push(status({ state: 'downloaded', version: '1.0.7' }));
    await userEvent.click(screen.getByRole('button', { name: /restart and update/i }));
    expect(api.updaterInstall).toHaveBeenCalledTimes(1);
  });

  it('switches to the beta channel', async () => {
    const { api } = mockApi();
    ui(<UpdateSettingsCard />);
    await userEvent.click(await screen.findByRole('radio', { name: /beta/i }));
    await waitFor(() => expect(api.updaterSetChannel).toHaveBeenCalledWith('beta'));
  });

  it('explains when updates are not available (browser preview)', () => {
    (window as any).api = {};
    ui(<UpdateSettingsCard />);
    expect(screen.getByText(/available in the installed desktop app/i)).toBeTruthy();
  });
});

describe('TopBarUpdateButton', () => {
  it('stays hidden until an update needs attention', async () => {
    const { push } = mockApi();
    ui(<TopBarUpdateButton />);
    await waitFor(() => expect(screen.queryByRole('button')).toBe(null));
    push(status({ state: 'available', version: '1.0.7' }));
    await userEvent.click(screen.getByRole('button', { name: /update 1\.0\.7/i }));
    expect(await screen.findByRole('dialog', { name: /update nomadic/i })).toBeTruthy();
  });
});

describe('UpdateRequiredScreen', () => {
  const policy = { required: true, currentVersion: '1.0.6', minimumVersion: '1.0.7', message: 'This version has a security problem.' };

  it('blocks with the reason and the update action', async () => {
    mockApi({ updaterGetStatus: vi.fn().mockResolvedValue(status({ state: 'available', version: '1.0.7' })) });
    ui(<UpdateRequiredScreen policy={policy} />);
    expect(screen.getByRole('heading', { name: 'Update required' })).toBeTruthy();
    expect(screen.getByText('This version has a security problem.')).toBeTruthy();
    expect(await screen.findByRole('button', { name: /download update/i })).toBeTruthy();
  });

  it('links to the release page when automatic updates are unavailable', async () => {
    const { api } = mockApi({ updaterGetStatus: vi.fn().mockResolvedValue(status({ state: 'unsupported' })) });
    ui(<UpdateRequiredScreen policy={policy} />);
    await userEvent.click(await screen.findByRole('button', { name: /download the latest version/i }));
    expect(api.openExternalUrl).toHaveBeenCalledWith('https://github.com/snipy09/nomadic/releases');
  });
});

describe('WhatsNewDialog', () => {
  it('shows the real notes once and dismisses', async () => {
    const { api } = mockApi({ getWhatsNew: vi.fn().mockResolvedValue({ show: true, version: '1.0.7', previousVersion: '1.0.6', notes: 'Faster sign-in', releaseUrl: 'https://github.com/snipy09/nomadic/releases/tag/v1.0.7' }) });
    ui(<WhatsNewDialog />);
    expect(await screen.findByText('Faster sign-in')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /got it/i }));
    expect(api.dismissWhatsNew).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('Faster sign-in')).toBe(null));
  });

  it('links to the release page instead of inventing notes', async () => {
    mockApi({ getWhatsNew: vi.fn().mockResolvedValue({ show: true, version: '1.0.7', previousVersion: '1.0.6', notes: null, releaseUrl: 'u' }) });
    ui(<WhatsNewDialog />);
    expect(await screen.findByText(/notes for this release are on the release page/i)).toBeTruthy();
  });
});

describe('Help and feedback', () => {
  it('lists the real shortcuts and links', () => {
    mockApi();
    ui(<HelpView />);
    expect(screen.getByText('Open search and commands')).toBeTruthy();
    expect(screen.getByRole('button', { name: /release notes/i })).toBeTruthy();
  });

  it('validates, then sends feedback with diagnostics attached by default', async () => {
    const { api } = mockApi();
    ui(<HelpView />);
    await userEvent.click(screen.getByRole('button', { name: /^send$/i }));
    expect(await screen.findByText(/tell us a little more/i)).toBeTruthy();
    expect(api.sendFeedback).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/^message/i), 'The feed is empty after sign in.');
    await userEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(api.sendFeedback).toHaveBeenCalledWith({
      kind: 'bug', message: 'The feed is empty after sign in.', includeDiagnostics: true, contactEmail: undefined,
    }));
    expect(await screen.findByText(/press send there/i)).toBeTruthy();
  });

  it('checks the optional reply email', () => {
    expect(validateFeedback({ kind: 'idea', message: 'A long enough idea', contactEmail: 'nope', includeDiagnostics: false })).toEqual({
      contactEmail: 'Enter a valid email, or leave it empty.',
    });
  });
});

describe('CrashReportsCard', () => {
  it('is off by default and turns on only when the user flips it', async () => {
    const { api } = mockApi();
    ui(<CrashReportsCard />);
    const toggle = await screen.findByRole('switch', { name: /send anonymous crash reports/i });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    await userEvent.click(toggle);
    await waitFor(() => expect(api.setTelemetry).toHaveBeenCalledWith(true));
  });

  it('is disabled when the build has no DSN', async () => {
    mockApi({ getTelemetry: vi.fn().mockResolvedValue({ crashReports: false, available: false, active: false }) });
    ui(<CrashReportsCard />);
    expect((await screen.findByRole('switch')).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/not available in this build/i)).toBeTruthy();
  });
});

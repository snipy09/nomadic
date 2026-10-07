import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

const { settingsStore, clipboardWrite, openExternal, telemetryActive } = vi.hoisted(() => ({
  settingsStore: { value: null as any },
  clipboardWrite: vi.fn(),
  openExternal: vi.fn().mockResolvedValue(undefined),
  telemetryActive: { value: false },
}));

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/nomadic-test', getVersion: () => '1.0.6', getLocale: () => 'en-IN', isPackaged: false },
  clipboard: { writeText: clipboardWrite },
  shell: { openExternal },
}));
vi.mock('../services/app-context.js', () => ({ log: vi.fn(), sendToRenderer: vi.fn(), getRecentLogLines: () => [] }));
vi.mock('../services/app-settings.js', async (orig) => {
  const real = await orig<typeof import('../services/app-settings')>();
  return {
    ...real,
    getAppSettings: () => settingsStore.value ?? { ...real.DEFAULT_SETTINGS },
    updateAppSettings: (patch: object) => { settingsStore.value = { ...(settingsStore.value ?? real.DEFAULT_SETTINGS), ...patch }; return settingsStore.value; },
  };
});
vi.mock('../services/diagnostics.js', () => ({
  collectDiagnostics: () => ({ appVersion: '1.0.6' }),
  formatDiagnostics: () => 'Nomadic diagnostics\n' + 'x'.repeat(4000),
}));
vi.mock('../services/telemetry.js', async (orig) => ({
  ...(await orig<typeof import('../services/telemetry')>()),
  isCrashReportingActive: () => telemetryActive.value,
}));

import { compareVersions, isValidVersion } from '../services/versions';
import { DEFAULT_SETTINGS, parseSettings } from '../services/app-settings';
import { checkUpdatePolicy, evaluatePolicy, parsePolicy } from '../services/update-policy';
import { createUpdaterController, releaseNotesToText, type UpdaterLike } from '../services/updater';
import { scrubEvent } from '../services/telemetry';
import { computeWhatsNew, releaseUrlFor } from '../services/whats-new';
import { buildMailto, sendFeedback } from '../services/feedback';

beforeEach(() => {
  settingsStore.value = null;
  clipboardWrite.mockReset();
  openExternal.mockClear();
  telemetryActive.value = false;
});

describe('versions', () => {
  it('orders releases and pre-releases by semver precedence', () => {
    expect(compareVersions('1.0.6', '1.0.7')).toBe(-1);
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('v2.0.0', '2.0.0')).toBe(0);
    expect(compareVersions('1.2.0-beta.1', '1.2.0')).toBe(-1);
    expect(compareVersions('1.2.0-beta.2', '1.2.0-beta.10')).toBe(-1);
    expect(compareVersions('1.2.0-alpha', '1.2.0-beta')).toBe(-1);
    expect(compareVersions('1.2.0-beta', '1.2.0-beta.1')).toBe(-1);
    expect(isValidVersion('1.0')).toBe(false);
    expect(() => compareVersions('x', '1.0.0')).toThrow();
  });
});

describe('settings', () => {
  it('defaults safely and keeps only known values', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ updateChannel: 'nightly', crashReports: 'yes' })).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ updateChannel: 'beta', crashReports: true, lastSeenVersion: '1.0.6' })).toMatchObject({
      updateChannel: 'beta', crashReports: true, lastSeenVersion: '1.0.6',
    });
    expect(DEFAULT_SETTINGS.crashReports).toBe(false);
  });
});

describe('update policy (forced-update floor)', () => {
  it('parses only a valid policy', () => {
    expect(parsePolicy({ minimumVersion: '1.0.7', message: ' Security fix ' })).toEqual({ minimumVersion: '1.0.7', message: 'Security fix' });
    expect(parsePolicy({ minimumVersion: 'latest' })).toBe(null);
    expect(parsePolicy('nope')).toBe(null);
  });

  it('requires an update only below the floor', () => {
    expect(evaluatePolicy('1.0.6', { minimumVersion: '1.0.7', message: 'Fix' })).toEqual({ required: true, currentVersion: '1.0.6', minimumVersion: '1.0.7', message: 'Fix' });
    expect(evaluatePolicy('1.0.7', { minimumVersion: '1.0.7', message: 'Fix' }).required).toBe(false);
    expect(evaluatePolicy('1.0.7-beta.1', { minimumVersion: '1.0.7', message: null }).required).toBe(true);
    expect(evaluatePolicy('1.0.6', null).required).toBe(false);
  });

  it('remembers the last policy and applies it offline; a broken policy never blocks', async () => {
    const ok = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ minimumVersion: '1.0.7', message: null }) });
    expect((await checkUpdatePolicy('1.0.6', ok as unknown as typeof fetch)).required).toBe(true);

    const offline = vi.fn().mockRejectedValue(new Error('offline'));
    expect((await checkUpdatePolicy('1.0.6', offline as unknown as typeof fetch)).required).toBe(true);

    settingsStore.value = null;
    const broken = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ minimumVersion: 'garbage' }) });
    expect((await checkUpdatePolicy('1.0.6', broken as unknown as typeof fetch)).required).toBe(false);
  });
});

class FakeUpdater extends EventEmitter implements UpdaterLike {
  autoDownload = true;
  autoInstallOnAppQuit = false;
  allowPrerelease = false;
  allowDowngrade = true;
  channel: string | null = null;
  checkForUpdates = vi.fn(async () => { this.emit('checking-for-update'); this.emit('update-available', { version: '1.0.7', releaseNotes: '<p>Fixes <b>login</b></p><ul><li>Faster</li></ul>' }); });
  downloadUpdate = vi.fn(async () => { this.emit('download-progress', { percent: 42.4 }); this.emit('update-downloaded', { version: '1.0.7', releaseNotes: '<p>Fixes login</p>' }); });
  quitAndInstall = vi.fn();
}

describe('updater controller', () => {
  const make = (isPackaged = true, unsupportedReason?: string) => {
    const updater = new FakeUpdater();
    const emitted: unknown[] = [];
    const onDownloaded = vi.fn();
    const ctl = createUpdaterController({ updater, isPackaged, unsupportedReason, currentVersion: '1.0.6', emit: (s) => emitted.push(s), onDownloaded });
    return { updater, ctl, emitted, onDownloaded };
  };

  it('never downloads on its own and allows no downgrades', () => {
    const { updater } = make();
    expect(updater.autoDownload).toBe(false);
    expect(updater.allowDowngrade).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(true);
  });

  it('maps channels to electron-updater settings', () => {
    const { updater, ctl } = make();
    ctl.setChannel('beta');
    expect(updater.channel).toBe('beta');
    expect(updater.allowPrerelease).toBe(true);
    ctl.setChannel('stable');
    expect(updater.channel).toBe('latest');
    expect(updater.allowPrerelease).toBe(false);
  });

  it('goes check -> available -> downloading -> downloaded and only then installs', async () => {
    const { updater, ctl, onDownloaded } = make();
    expect(ctl.install()).toEqual({ success: false, error: 'No downloaded update to install.' });

    await ctl.check();
    expect(ctl.getStatus()).toMatchObject({ state: 'available', version: '1.0.7', releaseNotes: 'Fixes login\n• Faster' });

    await ctl.download();
    expect(ctl.getStatus()).toMatchObject({ state: 'downloaded', version: '1.0.7' });
    expect(onDownloaded).toHaveBeenCalledWith('1.0.7', 'Fixes login');

    expect(ctl.install()).toEqual({ success: true });
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it('reports errors as state', async () => {
    const { updater, ctl } = make();
    updater.checkForUpdates.mockRejectedValueOnce(new Error('net::ERR_INTERNET_DISCONNECTED'));
    await ctl.check();
    expect(ctl.getStatus()).toMatchObject({ state: 'error', message: 'net::ERR_INTERNET_DISCONNECTED' });
  });

  it('does nothing outside an installed build', async () => {
    const { updater, ctl } = make(false);
    await ctl.check();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    expect(ctl.getStatus().state).toBe('unsupported');
  });

  it('reports the reason and never checks when the build cannot update itself (Mac)', async () => {
    const { updater, ctl } = make(true, 'Install a new version from its DMG.');
    await ctl.check();
    await ctl.download();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    expect(ctl.getStatus()).toMatchObject({ state: 'unsupported', message: 'Install a new version from its DMG.' });
  });

  it('turns release notes HTML into text', () => {
    expect(releaseNotesToText('<h2>1.0.7</h2><p>A &amp; B</p>')).toBe('1.0.7\nA & B');
    expect(releaseNotesToText([{ version: '1.0.7', note: '<p>x</p>' }])).toBe('1.0.7\nx');
    expect(releaseNotesToText(null)).toBe('');
  });
});

describe('crash report scrubbing', () => {
  const event = {
    message: 'Failed for asha@example.com in C:\\Users\\Asha\\AppData',
    user: { email: 'asha@example.com', ip_address: '1.2.3.4' },
    request: { url: 'https://x', data: 'secret' },
    server_name: 'ASHAS-LAPTOP',
    extra: { profile: { name: 'Asha' } },
    breadcrumbs: [{ category: 'ui.input', message: 'typed' }, { category: 'navigation', message: 'to /home/asha/x', data: { from: 'a' } }],
    exception: { values: [{ type: 'Error', value: 'token abcdefghijklmnopqrstuvwxyz0123456789abcd', stacktrace: { frames: [{ abs_path: '/home/asha/app/main.js', vars: { password: 'x' } }] } }] },
  } as any;

  it('drops everything without consent', () => {
    expect(scrubEvent(event, false)).toBe(null);
  });

  it('removes the person and their data, keeps the error', () => {
    const out = scrubEvent(event, true)!;
    const json = JSON.stringify(out);
    expect(out.user).toBeUndefined();
    expect(out.request).toBeUndefined();
    expect(out.server_name).toBeUndefined();
    expect(out.extra).toEqual({});
    expect(json).not.toContain('asha@example.com');
    expect(json).not.toContain('Asha\\');
    expect(json).not.toContain('/home/asha');
    expect(json).not.toContain('password');
    expect(json).not.toContain('abcdefghijklmnopqrstuvwxyz0123456789abcd');
    expect(out.breadcrumbs?.map((b) => b.category)).toEqual(['navigation']);
    expect(out.exception?.values?.[0].type).toBe('Error');
  });
});

describe("what's new", () => {
  it('shows once after an update, never on a fresh install', () => {
    expect(computeWhatsNew('1.0.7', null, null).show).toBe(false);
    expect(computeWhatsNew('1.0.7', '1.0.7', null).show).toBe(false);
    expect(computeWhatsNew('1.0.7', '1.0.6', { version: '1.0.7', notes: 'Fixes' })).toEqual({
      show: true, version: '1.0.7', previousVersion: '1.0.6', notes: 'Fixes', releaseUrl: releaseUrlFor('1.0.7'),
    });
  });

  it('never shows notes captured for a different version', () => {
    expect(computeWhatsNew('1.0.8', '1.0.6', { version: '1.0.7', notes: 'Old' }).notes).toBe(null);
  });
});

describe('feedback', () => {
  const input = { kind: 'bug' as const, message: 'The feed does not load after sign in.', includeDiagnostics: true };

  it('builds a mailto that stays short and says where the full diagnostics are', () => {
    const url = buildMailto(input, 'D'.repeat(5000), '1.0.6');
    expect(url.startsWith('mailto:support@nomadic.app?subject=')).toBe(true);
    const body = decodeURIComponent(url.split('&body=')[1]);
    expect(body.startsWith('The feed does not load')).toBe(true);
    expect(body.length).toBeLessThan(2000);
    expect(body).toContain('full text is on your clipboard');
    expect(decodeURIComponent(url.split('subject=')[1].split('&')[0])).toBe('Bug report: Nomadic 1.0.6');
  });

  it('without crash reporting, opens the email app and copies diagnostics', async () => {
    const res = await sendFeedback(input);
    expect(res.via).toBe('email');
    expect(openExternal).toHaveBeenCalledTimes(1);
    expect(String(openExternal.mock.calls[0][0])).toMatch(/^mailto:/);
    expect(clipboardWrite).toHaveBeenCalledTimes(1);
  });

  it('does not touch the clipboard when diagnostics are unticked', async () => {
    await sendFeedback({ ...input, includeDiagnostics: false });
    expect(clipboardWrite).not.toHaveBeenCalled();
    expect(decodeURIComponent(String(openExternal.mock.calls[0][0]))).not.toContain('Nomadic diagnostics');
  });
});

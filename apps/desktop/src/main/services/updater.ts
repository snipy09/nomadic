import type { UpdaterStatus } from '../../shared/ipc.js';
import type { UpdateChannel } from './app-settings.js';

// electron-updater wiring (SAAS_PLAN B4). Nothing downloads or installs without
// the user asking; the update installs on quit once downloaded. Channels:
// `stable` reads latest.yml from full releases, `beta` reads beta.yml and accepts
// pre-releases (versions like 1.2.0-beta.1). Signature checks are electron-updater's
// (Windows: the installer must be signed by build.win.publisherName). macOS builds are
// unsigned for now and Squirrel.Mac only installs signed updates, so the Mac app reports
// updates as unsupported and new versions are installed from a new DMG.

/** The part of electron-updater's AppUpdater this module uses (lets tests pass a fake). */
export interface UpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  allowDowngrade: boolean;
  channel: string | null;
  on(event: string, listener: (...args: any[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

export interface UpdaterDeps {
  updater: UpdaterLike;
  /** app.isPackaged: electron-updater only works in an installed build. */
  isPackaged: boolean;
  /** Set when this build cannot update itself (unsigned macOS builds); shown as the reason. */
  unsupportedReason?: string;
  currentVersion: string;
  emit: (status: UpdaterStatus) => void;
  /** Called with the release notes when an update finished downloading. */
  onDownloaded?: (version: string, notes: string) => void;
}

/** GitHub release notes arrive as HTML (or a list for multi-version jumps); show plain text. */
export function releaseNotesToText(notes: unknown): string {
  const html = Array.isArray(notes)
    ? notes.map((n) => (n && typeof n === 'object' ? `${(n as { version?: string }).version ?? ''}\n${(n as { note?: string }).note ?? ''}` : '')).join('\n\n')
    : typeof notes === 'string'
      ? notes
      : '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h[1-6]|div)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 20_000);
}

export function createUpdaterController(deps: UpdaterDeps) {
  const { updater } = deps;
  const supported = deps.isPackaged && !deps.unsupportedReason;
  let status: UpdaterStatus = supported
    ? { state: 'idle', currentVersion: deps.currentVersion }
    : { state: 'unsupported', currentVersion: deps.currentVersion, message: deps.unsupportedReason ?? 'Updates work only in the installed app.' };
  let channel: UpdateChannel = 'stable';

  const set = (next: Omit<UpdaterStatus, 'currentVersion'>) => {
    status = { ...next, currentVersion: deps.currentVersion };
    deps.emit(status);
  };

  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = true;
  updater.allowDowngrade = false;

  updater.on('checking-for-update', () => set({ state: 'checking' }));
  updater.on('update-available', (info: { version?: string; releaseNotes?: unknown }) =>
    set({ state: 'available', version: info?.version, releaseNotes: releaseNotesToText(info?.releaseNotes) }));
  updater.on('update-not-available', () => set({ state: 'up_to_date' }));
  updater.on('download-progress', (p: { percent?: number }) =>
    set({ state: 'downloading', version: status.version, percent: Math.max(0, Math.min(100, Math.round(p?.percent ?? 0))) }));
  updater.on('update-downloaded', (info: { version?: string; releaseNotes?: unknown }) => {
    const notes = releaseNotesToText(info?.releaseNotes);
    if (info?.version) deps.onDownloaded?.(info.version, notes);
    set({ state: 'downloaded', version: info?.version, releaseNotes: notes });
  });
  updater.on('error', (err: unknown) =>
    set({ state: 'error', version: status.version, message: err instanceof Error ? err.message : 'The update failed.' }));

  return {
    getStatus: (): UpdaterStatus => status,
    getChannel: (): UpdateChannel => channel,
    setChannel(next: UpdateChannel): void {
      channel = next;
      updater.channel = next === 'beta' ? 'beta' : 'latest';
      updater.allowPrerelease = next === 'beta';
    },
    async check(): Promise<UpdaterStatus> {
      if (!supported) return status;
      try {
        await updater.checkForUpdates();
      } catch (err: unknown) {
        set({ state: 'error', message: err instanceof Error ? err.message : 'Could not check for updates.' });
      }
      return status;
    },
    async download(): Promise<UpdaterStatus> {
      if (!supported || status.state !== 'available') return status;
      try {
        set({ state: 'downloading', version: status.version, percent: 0 });
        await updater.downloadUpdate();
      } catch (err: unknown) {
        set({ state: 'error', version: status.version, message: err instanceof Error ? err.message : 'The download failed.' });
      }
      return status;
    },
    install(): { success: boolean; error?: string } {
      if (status.state !== 'downloaded') return { success: false, error: 'No downloaded update to install.' };
      updater.quitAndInstall(false, true);
      return { success: true };
    },
  };
}

export type UpdaterController = ReturnType<typeof createUpdaterController>;

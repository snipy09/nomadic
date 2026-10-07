import { app } from 'electron';
import type { UpdateChannel, UpdaterInfo } from '../../shared/ipc.js';
import { getAppSettings, updateAppSettings } from './app-settings.js';
import { log, sendToRenderer } from './app-context.js';
import { createUpdaterController, type UpdaterController } from './updater.js';
import { checkUpdatePolicy } from './update-policy.js';

declare const __APP_VERSION__: string | undefined;

export function currentAppVersion(): string {
  return (typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__) || app.getVersion();
}

let controller: UpdaterController | null = null;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
const MAC_UPDATES_REASON = 'On Mac, install a new version from its DMG.';

/** Creates the updater after the window exists and runs one check (never a download). */
export async function initUpdates(): Promise<void> {
  const { autoUpdater } = await import('electron-updater');
  controller = createUpdaterController({
    updater: autoUpdater,
    isPackaged: app.isPackaged,
    unsupportedReason: process.platform === 'darwin' ? MAC_UPDATES_REASON : undefined,
    currentVersion: currentAppVersion(),
    emit: (status) => sendToRenderer('updater-status', status),
    onDownloaded: (version, notes) => updateAppSettings({ pendingReleaseNotes: { version, notes } }),
  });
  controller.setChannel(getAppSettings().updateChannel);
  if (process.platform === 'darwin') {
    log('[Updates] Skipped: the Mac app is updated by installing a new DMG.');
  } else if (app.isPackaged) {
    void controller.check();
    setInterval(() => void controller?.check(), CHECK_EVERY_MS).unref?.();
  } else {
    log('[Updates] Skipped: updates run only in the installed app.');
  }
}

function info(): UpdaterInfo {
  const channel = getAppSettings().updateChannel;
  if (!controller) {
    return { state: 'unsupported', currentVersion: currentAppVersion(), message: 'Updates are starting.', channel };
  }
  return { ...controller.getStatus(), channel };
}

export const updates = {
  status: info,
  async check(): Promise<UpdaterInfo> {
    await controller?.check();
    return info();
  },
  async download(): Promise<UpdaterInfo> {
    await controller?.download();
    return info();
  },
  install(): { success: boolean; error?: string } {
    return controller ? controller.install() : { success: false, error: 'Updates are not ready yet.' };
  },
  async setChannel(channel: UpdateChannel): Promise<UpdaterInfo> {
    updateAppSettings({ updateChannel: channel });
    controller?.setChannel(channel);
    await controller?.check();
    return info();
  },
  policy: () => checkUpdatePolicy(currentAppVersion()),
};

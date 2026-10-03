import { handle } from './handle.js';
import { downloadUpdateArgs, installUpdateArgs, openExternalUrlArgs } from './schemas.js';
import { checkForUpdates, downloadUpdate, installUpdate, openExternalUrl } from '../services/system.js';

/** External links and in-app updates. */
export function registerSystemIpc(): void {
  handle('open-external-url', openExternalUrlArgs, (url) => openExternalUrl(url));
  handle('check-for-updates', () => checkForUpdates());
  handle('download-update', downloadUpdateArgs, (downloadUrl) => downloadUpdate(downloadUrl));
  handle('install-update', installUpdateArgs, (installerPath) => installUpdate(installerPath));
}

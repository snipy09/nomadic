import { handle } from '@nomadic/app-core/main/ipc/handle';
import {
  applicationFollowUpArgs,
  applicationNotesArgs,
  applicationStatusArgs,
  documentTextArgs,
  draftAnswersArgs,
  googleSignInArgs,
  idArgs,
  openExternalUrlArgs,
  saveApplicationArgs,
  telemetrySetArgs,
} from '@nomadic/app-core/main/ipc/schemas';
import { registerAdminIpc } from '@nomadic/app-core/main/ipc/admin';
import { registerAuthIpc } from '@nomadic/app-core/main/ipc/auth';
import { registerBillingIpc } from '@nomadic/app-core/main/ipc/billing';
import { registerDataSafetyIpc } from '@nomadic/app-core/main/ipc/data-safety';
import { registerFeedIpc } from '@nomadic/app-core/main/ipc/feed';
import { registerLearnerIpc } from '@nomadic/app-core/main/ipc/learner';
import { registerProfileIpc } from '@nomadic/app-core/main/ipc/profile';
import { setMainWindow } from '@nomadic/app-core/main/services/app-context';
import {
  deleteApplication,
  getApplications,
  saveApplication,
  updateApplicationFollowUp,
  updateApplicationNotes,
  updateApplicationStatus,
} from '@nomadic/app-core/main/services/applications';
import { getDb } from '@nomadic/app-core/main/db';
import { loadDeviceId } from './device';
import { getLocalDbHealth, initLocalDatabase, persistDbNow } from './db';
import { DESKTOP_ONLY_ERROR, hostWindow, setAppVersion, setExternalOpener } from './electron';

/**
 * Starts the "main process" inside the WebView: the local database, the device id, and the desktop's own
 * IPC handlers for everything the phone app offers. Then the desktop preload builds `window.api`.
 * Not registered (desktop only, answered with DESKTOP_ONLY_ERROR): apply / auto apply, outreach, practice,
 * project repo checks and AI project help, resume files, the assistant, scrapers, updates.
 */

export interface BootOptions {
  version: string;
  openExternal: (url: string) => Promise<void>;
}

const TELEMETRY_KEY = 'mobile_crash_reports';

export async function bootHost(options: BootOptions): Promise<void> {
  setAppVersion(options.version);
  setExternalOpener(options.openExternal);
  await loadDeviceId();
  await initLocalDatabase();
  setMainWindow(hostWindow as never);

  registerAuthIpc();
  registerProfileIpc();
  registerFeedIpc();
  registerBillingIpc();
  registerLearnerIpc();
  registerAdminIpc();
  registerDataSafetyIpc();

  // Tracker (the desktop registers these with apply).
  handle('get-applications', () => getApplications());
  handle('save-application', saveApplicationArgs, (app) => saveApplication(app));
  handle('update-application-status', applicationStatusArgs, (data) => updateApplicationStatus(data));
  handle('update-application-notes', applicationNotesArgs, (data) => updateApplicationNotes(data));
  handle('update-application-follow-up', applicationFollowUpArgs, (data) => updateApplicationFollowUp(data));
  handle('delete-application', idArgs, (id) => deleteApplication(id));

  // Phone versions of desktop-specific channels.
  handle('auth-google', googleSignInArgs, () => ({
    success: false,
    error: 'Google sign-in is not in the Android app yet. Sign in with your email and password (set one from the desktop app with "Forgot password").',
  }));
  handle('open-external-url', openExternalUrlArgs, async (url) => {
    if (!/^https?:\/\//i.test(url)) return { success: false, error: 'Only web links can be opened.' };
    await options.openExternal(url);
    return { success: true };
  });
  handle('check-dependencies', () => ({ sqliteReady: getLocalDbHealth() !== null, playwrightInstalled: false, internetOk: navigator.onLine, allReady: false }));
  handle('read-document-text', documentTextArgs, () => ({ success: false, error: 'Reading resumes and PDFs works in the desktop app.' }));
  handle('draft-profile-answers', draftAnswersArgs, () => ({ success: false, code: 'unavailable' as const, error: 'AI drafts of your answers are made in the desktop app.' }));
  handle('pick-resume-file', () => ({ canceled: true }));
  handle('export-account-data', () => ({ success: false, error: 'Export your data from the desktop app (Settings → Data & privacy). It saves a file on your computer.' }));
  handle('copy-diagnostics', () => ({ success: false, error: DESKTOP_ONLY_ERROR }));
  handle('get-data-health', () => {
    const h = getLocalDbHealth();
    let size: number | null = null;
    try {
      size = getDb().export().byteLength;
    } catch {
      size = null;
    }
    return { success: true, health: h, backups: 0, latestBackupAt: null, sizeBytes: size };
  });
  handle('get-update-policy', () => ({ required: false, currentVersion: options.version, minimumVersion: null, message: null }));
  handle('whats-new-get', () => null);
  handle('whats-new-dismiss', () => ({ success: true }));
  // Crash reports are not built into the Android app: the choice is kept, nothing is sent.
  handle('telemetry-get', () => ({ crashReports: readTelemetry(), available: false, active: false }));
  handle('telemetry-set', telemetrySetArgs, (enabled) => {
    writeTelemetry(enabled);
    return { crashReports: enabled, available: false, active: false };
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void persistDbNow().catch(() => undefined);
  });

  // The desktop preload builds the same `window.api` the desktop renderer uses.
  await import('@nomadic/app-core/main/preload');
}

function readTelemetry(): boolean {
  try {
    const res = getDb().exec('SELECT value FROM local_meta WHERE key = ?', [TELEMETRY_KEY]);
    return String(res[0]?.values[0]?.[0] ?? '') === '1';
  } catch {
    return false;
  }
}

function writeTelemetry(on: boolean): void {
  try {
    getDb().run('INSERT INTO local_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [TELEMETRY_KEY, on ? '1' : '0']);
  } catch {
    /* best effort */
  }
}

import { app, BrowserWindow, safeStorage, session as electronSession } from 'electron';
import path from 'path';
import fs from 'fs';
import WebSocket from 'ws';

if (typeof globalThis.WebSocket === 'undefined') {
  try {
    (globalThis as any).WebSocket = WebSocket;
  } catch {}
}
import { getLocalDbHealth, initLocalDatabase } from './db.js';
import { AutoApplyEngine, findChromeExecutable } from '@job-automator/automation';
import { createProxyFormAnswerClient } from './services/ai-proxy.js';
import { registerAllIpc, setIpcSenderGuard } from './ipc/index.js';
import { getMainWindow, log } from './services/app-context.js';
import { clearHeartbeat } from './services/session.js';
import { closeOAuthServer, handleProtocolUrl } from './services/oauth.js';
import { configureSecretStorage, migrateLegacySecrets } from './services/secrets.js';
import {
  createIpcSenderGuard,
  hardenWebContents,
  installContentSecurityPolicy,
  installPermissionPolicy,
  type SecurityOptions,
} from './security.js';
import { createWindow } from './window.js';
import { initAppSettings } from './services/app-settings.js';
import { initCrashReporting } from './services/telemetry-runtime.js';
import { currentAppVersion, initUpdates } from './services/updates-runtime.js';
import { initWhatsNew } from './services/whats-new.js';

const securityOptions: SecurityOptions = { devServerUrl: process.env.VITE_DEV_SERVER_URL };

app.setName('Nomadic Career OS');
const nomadicUserData = path.join(app.getPath('appData'), 'Nomadic');
if (!fs.existsSync(nomadicUserData)) {
  try {
    fs.mkdirSync(nomadicUserData, { recursive: true });
  } catch {}
}
app.setPath('userData', nomadicUserData);

process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]', reason);
});

// ── Safe Chromium Flags for 100% Windows Hardware Compatibility ────────
app.disableHardwareAcceleration();
// The Chromium sandbox stays ON. NOMADIC_DISABLE_SANDBOX=true is an escape
// hatch for machines where the OS sandbox cannot start (e.g. some VMs).
if (process.env.NOMADIC_DISABLE_SANDBOX === 'true') {
  app.commandLine.appendSwitch('no-sandbox');
} else {
  app.enableSandbox();
  // If sandboxed child processes cannot even load (STATUS_DLL_NOT_FOUND, seen
  // when the app is started from a restricted parent process), the window would
  // stay blank. Relaunch once without the sandbox instead of failing silently.
  const STATUS_DLL_NOT_FOUND = -1073741515;
  let relaunching = false;
  app.on('child-process-gone', (_event, details) => {
    if (relaunching || details.exitCode !== STATUS_DLL_NOT_FOUND) return;
    relaunching = true;
    console.error(`[Startup] ${details.type} process could not start under the sandbox; relaunching without it.`);
    process.env.NOMADIC_DISABLE_SANDBOX = 'true';
    app.relaunch();
    app.exit(0);
  });
}
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-gpu-rasterization');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

// ── Single Instance Lock & Deep Linking ─────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      const url = commandLine.find(arg => arg.startsWith('nomadic://'));
      if (url) handleProtocolUrl(url);
    } else {
      createWindow();
    }
  });
}

// Resilient deep linking protocol registration
try {
  app.setAsDefaultProtocolClient('nomadic');
} catch {}

app.on('open-url', (event, url) => {
  event.preventDefault();
  handleProtocolUrl(url);
});

// ── IPC ─────────────────────────────────────────────────────────────────
setIpcSenderGuard(createIpcSenderGuard(securityOptions));
registerAllIpc();

// Lock down popups / navigation / <webview> for every webContents ever created.
app.on('web-contents-created', (_event, contents) => {
  hardenWebContents(contents, securityOptions);
});

// ── App lifecycle ───────────────────────────────────────────────────────
// Settings first: crash-report consent must be known before Sentry may start.
initAppSettings(app.getPath('userData'));
void initCrashReporting();

app.whenReady().then(async () => {
  installContentSecurityPolicy(electronSession.defaultSession, securityOptions);
  installPermissionPolicy(electronSession.defaultSession);

  try {
    await initLocalDatabase(app.getPath('userData'));
    const h = getLocalDbHealth();
    if (h && (h.startup === 'recovered_from_backup' || h.startup === 'reset_after_corruption' || h.migration === 'failed' || h.migration === 'newer_than_app')) {
      log(`[Database] Needs attention: startup=${h.startup}, migration=${h.migration}${h.migrationError ? ` (${h.migrationError})` : ''}. See Settings → Data & privacy.`);
    } else {
      log(`[Database] Local SQLite ready (schema v${h?.schemaVersion ?? '?'}, integrity ok) ✓`);
    }
  } catch (err: any) {
    console.error('[Database] Init note:', err?.message);
  }

  // Move Groq / SMTP / Gemini keys out of plaintext SQLite into the OS keychain.
  configureSecretStorage(safeStorage);
  try {
    const migrated = migrateLegacySecrets();
    if (migrated > 0) log(`[Secrets] Moved ${migrated} stored key(s) into OS-encrypted storage ✓`);
  } catch (err: any) {
    console.error('[Secrets] Migration note:', err?.message);
  }

  // Open-ended form answers go through the Nomadic AI proxy (one batched call per form);
  // no user API key is read or needed.
  AutoApplyEngine.llm = createProxyFormAnswerClient();

  createWindow();
  initWhatsNew(currentAppVersion());
  void initUpdates().catch((err: unknown) => log(`[Updates] Init note: ${err instanceof Error ? err.message : String(err)}`));

  // Background verification: check if local Chrome / Edge is present
  setTimeout(() => {
    try {
      const browser = findChromeExecutable();
      if (browser) {
        log(`[Auto-Setup] Chrome engine active: ${browser} ✓`);
      }
    } catch {}
  }, 1500);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

function releaseBackgroundResources(): void {
  clearHeartbeat();
  closeOAuthServer();
}

app.on('window-all-closed', () => {
  releaseBackgroundResources();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  releaseBackgroundResources();
});

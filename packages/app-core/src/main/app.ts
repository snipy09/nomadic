import { app, BrowserWindow, safeStorage, session as electronSession } from 'electron';
import path from 'path';
import fs from 'fs';
import WebSocket from 'ws';
import { getLocalDbHealth, initLocalDatabase } from './db.js';
import { AutoApplyEngine, findUserBrowser } from '@job-automator/automation';
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

/**
 * The Electron app shared by the Windows (apps/desktop) and Mac (apps/mac) builds: user data folder, single
 * instance, deep links, IPC, security policies, local database, secrets, updates and the main window.
 * Everything that differs per operating system comes in through `DesktopPlatform`, so a change for one OS lives in
 * that app's folder and cannot change the other.
 */

export type DesktopPlatformId = 'windows' | 'mac';

export interface DesktopPlatform {
  id: DesktopPlatformId;
  /**
   * Chromium switches and sandbox setup, before the app is ready. `userDataDir` is Nomadic's own folder
   * (%APPDATA%\Nomadic, ~/Library/Application Support/Nomadic).
   */
  configureChromium(userDataDir: string): void;
  /** Keep running with no window open (the macOS convention); Windows quits. */
  keepRunningWithoutWindows: boolean;
  /** Runs once the app is ready, before the first window (menus, dock, ...). */
  onReady?(): void;
}

export function startDesktopApp(platform: DesktopPlatform): void {
  if (typeof globalThis.WebSocket === 'undefined') {
    try {
      (globalThis as any).WebSocket = WebSocket;
    } catch {}
  }

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

  platform.configureChromium(nomadicUserData);

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
        const url = commandLine.find((arg) => arg.startsWith('nomadic://'));
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
    platform.onReady?.();

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

    // Applications open in the user's own installed browser (Chrome, Edge or Brave)
    setTimeout(() => {
      try {
        const browser = findUserBrowser();
        log(browser ? `[Browser] Applications open in ${browser.name} ✓` : '[Browser] No Chrome or Edge found; install one to apply.');
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
    if (!platform.keepRunningWithoutWindows) app.quit();
  });

  app.on('before-quit', () => {
    releaseBackgroundResources();
  });
}

import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { getMainWindow, setMainWindow } from './services/app-context.js';
import { blockDevtoolsShortcuts } from './security.js';

/** DevTools are available in dev, or in packaged builds only when explicitly enabled. */
export function devToolsAllowed(): boolean {
  return !app.isPackaged || process.env.NOMADIC_ENABLE_DEVTOOLS === 'true';
}

function firstExisting(candidates: string[]): string | undefined {
  return candidates.find(p => {
    try { return fs.existsSync(p); } catch { return false; }
  });
}

export function createWindow(): void {
  const preloadPath = firstExisting([
    path.join(__dirname, 'preload.cjs'),
    path.join(app.getAppPath(), 'out/main/preload.cjs'),
  ]) || path.join(__dirname, 'preload.cjs');

  const appIcon = firstExisting([
    path.join(__dirname, '../../assets/icon.ico'),
    path.join(app.getAppPath(), 'assets/icon.ico'),
    path.join(__dirname, '../renderer/assets/logo-icon.png'),
    path.join(app.getAppPath(), 'out/renderer/assets/logo-icon.png'),
  ]);

  const mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    title: 'Nomadic — Universal Career OS',
    icon: appIcon,
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    show: true,
    center: true,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      // Preload only uses contextBridge + ipcRenderer, so it runs sandboxed.
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false,
      devTools: devToolsAllowed(),
    },
  });
  setMainWindow(mainWindow);

  // Security: Block DevTools inspection shortcuts in packaged production builds
  if (!devToolsAllowed()) {
    blockDevtoolsShortcuts(mainWindow);
  }

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Failsafe: guarantee window visibility after 400ms across all Windows environments
  setTimeout(() => {
    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
  }, 400);

  // Crash recovery listeners
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Renderer Crash]', details);
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Renderer] Failed to load URL: ${validatedURL}, error: ${errorDescription} (${errorCode})`);
  });

  // Popup / navigation lockdown is applied to every webContents in index.ts
  // (app 'web-contents-created').

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const htmlPath = firstExisting([
      path.join(__dirname, '../renderer/index.html'),
      path.join(app.getAppPath(), 'out/renderer/index.html'),
      path.join(process.resourcesPath || '', 'app.asar/out/renderer/index.html'),
    ]) || path.join(__dirname, '../renderer/index.html');

    mainWindow.loadFile(htmlPath).catch((err) => {
      console.error('[Window] loadFile error:', err);
    });
  }

  // ── Keyboard Shortcuts: F12 (DevTools, dev only) & Ctrl+Shift+R (Reload) ──
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      // F12 or Ctrl+Shift+I -> Toggle DevTools (only where DevTools are allowed)
      if (devToolsAllowed() && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) {
        mainWindow.webContents.toggleDevTools();
        event.preventDefault();
      }
      // Ctrl+Shift+R or Ctrl+R or F5 -> Hard reload renderer
      if (
        (input.control && input.shift && input.key.toLowerCase() === 'r') ||
        (input.control && input.key.toLowerCase() === 'r') ||
        input.key === 'F5'
      ) {
        mainWindow.webContents.reloadIgnoringCache();
        event.preventDefault();
      }
    }
  });

  mainWindow.on('closed', () => {
    if (getMainWindow() === mainWindow) setMainWindow(null);
  });
}

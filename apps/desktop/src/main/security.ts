import { shell, type Session, type WebContents, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { isSafeUrl } from './services/system.js';

/**
 * Electron hardening: Content-Security-Policy, navigation / popup lockdown,
 * permission policy, devtools shortcut blocking and IPC sender validation.
 */

export interface SecurityOptions {
  /** Vite dev server origin (e.g. http://localhost:5173) when running in dev. */
  devServerUrl?: string;
}

function devOrigin(devServerUrl?: string): string | null {
  if (!devServerUrl) return null;
  try {
    return new URL(devServerUrl).origin;
  } catch {
    return null;
  }
}

/** True for URLs that belong to the app's own renderer (packaged file:// or the dev server). */
export function isAppUrl(url: string, devServerUrl?: string): boolean {
  if (!url) return false;
  if (url.startsWith('file://')) return true;
  const origin = devOrigin(devServerUrl);
  if (!origin) return false;
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

/**
 * The renderer's CSP. Production allows only bundled scripts; network access
 * is limited to what the app talks to (Supabase REST/realtime, Groq, Gemini,
 * GitHub releases). Images may come from any https host (logos, thumbnails),
 * frames only from YouTube embeds. Dev additionally allows the Vite server,
 * its HMR websocket and the inline React-refresh preamble.
 */
export function buildContentSecurityPolicy(devServerUrl?: string): string {
  const dev = devOrigin(devServerUrl);
  const devWs = dev ? dev.replace(/^http/, 'ws') : '';
  const scriptSrc = dev ? `'self' 'unsafe-inline' 'unsafe-eval' ${dev}` : `'self'`;
  const connectSrc = [
    `'self'`,
    'https://*.supabase.co',
    'wss://*.supabase.co',
    'https://api.groq.com',
    'https://generativelanguage.googleapis.com',
    'https://api.github.com',
    ...(dev ? [dev, devWs] : []),
  ].join(' ');

  return [
    `default-src 'self'${dev ? ` ${dev}` : ''}`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com${dev ? ` ${dev}` : ''}`,
    `font-src 'self' data: https://fonts.gstatic.com`,
    `img-src 'self' data: blob: https:`,
    `media-src 'self' data: blob: https:`,
    `connect-src ${connectSrc}`,
    `frame-src https://www.youtube.com https://www.youtube-nocookie.com`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ].join('; ');
}

/** Attaches the CSP header to the app's own top-level documents. */
export function installContentSecurityPolicy(ses: Session, opts: SecurityOptions): void {
  const policy = buildContentSecurityPolicy(opts.devServerUrl);
  ses.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType === 'mainFrame' && isAppUrl(details.url, opts.devServerUrl)) {
      const headers = { ...(details.responseHeaders ?? {}) };
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === 'content-security-policy') delete headers[key];
      }
      headers['Content-Security-Policy'] = [policy];
      callback({ responseHeaders: headers });
      return;
    }
    callback({});
  });
}

const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write', 'clipboard-read', 'fullscreen']);

/** Denies every permission request except clipboard and fullscreen. */
export function installPermissionPolicy(ses: Session): void {
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });
}

/**
 * Popups and navigation away from the app are blocked; safe external links
 * (http/https/mailto) open in the system browser instead. `<webview>` is
 * never allowed.
 */
export function hardenWebContents(contents: WebContents, opts: SecurityOptions): void {
  contents.setWindowOpenHandler(({ url }) => {
    if (isSafeUrl(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const guardNavigation = (event: { preventDefault: () => void }, url: string) => {
    if (url === contents.getURL() || isAppUrl(url, opts.devServerUrl)) return;
    event.preventDefault();
    if (isSafeUrl(url)) {
      shell.openExternal(url);
    }
  };
  contents.on('will-navigate', guardNavigation);
  contents.on('will-redirect', guardNavigation);

  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
}

/** Swallows DevTools / view-source shortcuts (packaged builds). */
export function blockDevtoolsShortcuts(win: BrowserWindow): void {
  win.webContents.on('before-input-event', (event, input) => {
    const isF12 = input.key === 'F12';
    const isDevToolsCombo = (input.control || input.meta) && input.shift && ['I', 'i', 'J', 'j', 'C', 'c'].includes(input.key);
    const isViewSourceCombo = (input.control || input.meta) && ['U', 'u'].includes(input.key);
    if (isF12 || isDevToolsCombo || isViewSourceCombo) {
      event.preventDefault();
    }
  });
  win.webContents.on('devtools-opened', () => {
    win.webContents.closeDevTools();
  });
}

/** IPC sender check: only frames showing the app's own renderer may invoke. */
export function createIpcSenderGuard(opts: SecurityOptions): (event: IpcMainInvokeEvent) => boolean {
  return (event) => {
    const frameUrl = event.senderFrame?.url;
    if (!frameUrl) return false;
    return isAppUrl(frameUrl, opts.devServerUrl);
  };
}

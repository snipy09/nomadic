import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

// Applications are filled in the browser the candidate already has installed (Chrome, Edge or
// Brave), never in a downloaded test build. Chrome 136+ refuses automation of the user's
// default profile, so Nomadic uses a persistent profile of its own inside that browser: the
// candidate signs in to portals there once and the sign-ins carry over to every application.

export type UserBrowserKind = 'chrome' | 'edge' | 'brave';

export interface UserBrowser {
  kind: UserBrowserKind;
  name: string;
  executablePath: string;
}

export const NO_USER_BROWSER_MESSAGE =
  'Nomadic fills applications in your own browser. Install Google Chrome or Microsoft Edge, then try again.';

const NAMES: Record<UserBrowserKind, string> = {
  chrome: 'Google Chrome',
  edge: 'Microsoft Edge',
  brave: 'Brave',
};

const ORDER: UserBrowserKind[] = ['chrome', 'edge', 'brave'];

export function browserCandidates(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): Record<UserBrowserKind, string[]> {
  if (platform === 'win32') {
    const roots = [env.PROGRAMFILES || 'C:\\Program Files', env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', env.LOCALAPPDATA]
      .filter((r): r is string => Boolean(r));
    const under = (...parts: string[]) => roots.map((root) => path.win32.join(root, ...parts));
    return {
      chrome: under('Google', 'Chrome', 'Application', 'chrome.exe'),
      edge: under('Microsoft', 'Edge', 'Application', 'msedge.exe'),
      brave: under('BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    };
  }
  if (platform === 'darwin') {
    return {
      chrome: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
      edge: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
      brave: ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'],
    };
  }
  return {
    chrome: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome'],
    edge: ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable'],
    brave: ['/usr/bin/brave-browser', '/usr/bin/brave'],
  };
}

/** Maps the Windows https handler ProgId to a supported browser. */
export function defaultBrowserKind(progId: string | null | undefined): UserBrowserKind | null {
  const id = (progId || '').toLowerCase();
  if (id.startsWith('chromehtml')) return 'chrome';
  if (id.startsWith('msedgehtm')) return 'edge';
  if (id.startsWith('bravehtml')) return 'brave';
  return null;
}

let cachedProgId: string | null | undefined;

/** The ProgId of the default https handler on Windows, or null when unknown. */
export function readDefaultBrowserProgId(): string | null {
  if (cachedProgId !== undefined) return cachedProgId;
  cachedProgId = null;
  if (process.platform !== 'win32') return cachedProgId;
  const base = 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https';
  for (const key of [`${base}\\UserChoiceLatest`, `${base}\\UserChoice`]) {
    try {
      const out = execFileSync('reg', ['query', key, '/v', 'ProgId'], { encoding: 'utf8', windowsHide: true, timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
      const match = /ProgId\s+REG_SZ\s+(\S+)/i.exec(out);
      if (match) {
        cachedProgId = match[1];
        break;
      }
    } catch {
      // Key missing on this Windows build; try the next one.
    }
  }
  return cachedProgId;
}

/**
 * The default browser wins when it is Chrome or Brave. Edge is the Windows factory default, so
 * it is a weak signal: when Edge is the default but Chrome is installed, Chrome is used.
 */
export function pickUserBrowser(
  installed: Partial<Record<UserBrowserKind, string>>,
  defaultKind: UserBrowserKind | null,
): UserBrowser | null {
  let kind: UserBrowserKind | undefined;
  if (defaultKind && defaultKind !== 'edge' && installed[defaultKind]) kind = defaultKind;
  else kind = ORDER.find((k) => installed[k]);
  return kind ? { kind, name: NAMES[kind], executablePath: installed[kind]! } : null;
}

export interface FindUserBrowserOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  exists?: (file: string) => boolean;
  progId?: string | null;
}

export function findUserBrowser(opts: FindUserBrowserOptions = {}): UserBrowser | null {
  const platform = opts.platform ?? process.platform;
  const exists = opts.exists ?? ((file: string) => {
    try {
      return fs.statSync(file).isFile();
    } catch {
      return false;
    }
  });
  const candidates = browserCandidates(platform, opts.env ?? process.env);
  const installed: Partial<Record<UserBrowserKind, string>> = {};
  for (const kind of ORDER) {
    const found = candidates[kind].find(exists);
    if (found) installed[kind] = found;
  }
  const progId = opts.progId !== undefined ? opts.progId : platform === 'win32' ? readDefaultBrowserProgId() : null;
  return pickUserBrowser(installed, defaultBrowserKind(progId));
}

/**
 * The Nomadic profile inside the user's browser. Chrome keeps the original folder so sign-ins
 * made by earlier versions survive; other browsers get their own folder (profiles are not
 * shared between browsers).
 */
export function applyProfileDir(nomadicDataDir: string, kind: UserBrowserKind): string {
  return path.join(nomadicDataDir, kind === 'chrome' ? 'browser_session' : `browser_session_${kind}`);
}

/**
 * Playwright defaults that turn the window into a test browser (no extensions, no sync, no Safe
 * Browsing, no saved-password encryption, automation banner). Dropped so the window behaves like
 * the user's normal browser.
 */
export const TEST_BROWSER_ARGS = [
  '--enable-automation',
  '--disable-extensions',
  '--disable-sync',
  '--disable-component-extensions-with-background-pages',
  '--disable-default-apps',
  '--disable-component-update',
  '--disable-background-networking',
  '--disable-client-side-phishing-detection',
  '--disable-popup-blocking',
  '--disable-breakpad',
  '--force-color-profile=srgb',
  '--unsafely-disable-devtools-self-xss-warnings',
  '--password-store=basic',
  '--use-mock-keychain',
];

export function userBrowserLaunchOptions(browser: UserBrowser) {
  return {
    executablePath: browser.executablePath,
    headless: false,
    viewport: null,
    chromiumSandbox: true,
    args: ['--disable-blink-features=AutomationControlled', '--window-size=1280,850'],
    ignoreDefaultArgs: TEST_BROWSER_ARGS,
  };
}

/** True when a launch failed because another window already holds the profile. */
export function isProfileInUseError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /ProcessSingleton|existing browser session|profile (?:appears to be )?in use|user data directory is already in use|SingletonLock/i.test(msg);
}

import { describe, expect, it } from 'vitest';
import {
  TEST_BROWSER_ARGS,
  applyProfileDir,
  browserCandidates,
  defaultBrowserKind,
  findUserBrowser,
  isProfileInUseError,
  pickUserBrowser,
  userBrowserLaunchOptions,
} from '../user-browser.js';

const ENV = { PROGRAMFILES: 'C:\\Program Files', 'PROGRAMFILES(X86)': 'C:\\Program Files (x86)', LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local' };
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CHROME_USER = 'C:\\Users\\a\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BRAVE = 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';

const installed = (...files: string[]) => (file: string) => files.includes(file);

describe('user browser', () => {
  it('maps the Windows https ProgId to a browser', () => {
    expect(defaultBrowserKind('ChromeHTML')).toBe('chrome');
    expect(defaultBrowserKind('ChromeHTML.ABCDEF')).toBe('chrome');
    expect(defaultBrowserKind('MSEdgeHTM')).toBe('edge');
    expect(defaultBrowserKind('BraveHTML')).toBe('brave');
    expect(defaultBrowserKind('FirefoxURL-308046B0AF4A39CB')).toBeNull();
    expect(defaultBrowserKind(null)).toBeNull();
  });

  it('looks in Program Files, Program Files (x86) and the per-user folder', () => {
    const c = browserCandidates('win32', ENV);
    expect(c.chrome).toEqual([
      CHROME,
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      CHROME_USER,
    ]);
    expect(c.edge).toContain(EDGE);
  });

  it('never offers a test build of Chromium', () => {
    const all = Object.values(browserCandidates('win32', ENV)).flat().join('\n');
    expect(all).not.toMatch(/ms-playwright|chrome-for-testing|chromium/i);
  });

  it('uses the default browser when it is Chrome or Brave', () => {
    expect(findUserBrowser({ platform: 'win32', env: ENV, exists: installed(CHROME, EDGE, BRAVE), progId: 'BraveHTML' }))
      .toEqual({ kind: 'brave', name: 'Brave', executablePath: BRAVE });
    expect(findUserBrowser({ platform: 'win32', env: ENV, exists: installed(CHROME_USER, EDGE), progId: 'ChromeHTML' }))
      .toEqual({ kind: 'chrome', name: 'Google Chrome', executablePath: CHROME_USER });
  });

  it('prefers installed Chrome over Edge left as the Windows factory default', () => {
    expect(findUserBrowser({ platform: 'win32', env: ENV, exists: installed(CHROME, EDGE), progId: 'MSEdgeHTM' })?.kind).toBe('chrome');
    expect(findUserBrowser({ platform: 'win32', env: ENV, exists: installed(EDGE, BRAVE), progId: 'MSEdgeHTM' })?.kind).toBe('edge');
  });

  it('falls back to Chrome, then Edge, then Brave when the default is something else', () => {
    expect(findUserBrowser({ platform: 'win32', env: ENV, exists: installed(EDGE, BRAVE), progId: 'FirefoxURL' })?.kind).toBe('edge');
    expect(findUserBrowser({ platform: 'win32', env: ENV, exists: installed(BRAVE), progId: null })?.kind).toBe('brave');
    expect(pickUserBrowser({}, 'chrome')).toBeNull();
  });

  it('keeps the existing Chrome profile folder and separates other browsers', () => {
    const root = 'C:\\Users\\a\\AppData\\Roaming\\Nomadic';
    expect(applyProfileDir(root, 'chrome').endsWith('browser_session')).toBe(true);
    expect(applyProfileDir(root, 'edge').endsWith('browser_session_edge')).toBe(true);
  });

  it('launches like a normal browser: sandbox on, test flags removed', () => {
    const opts = userBrowserLaunchOptions({ kind: 'chrome', name: 'Google Chrome', executablePath: CHROME });
    expect(opts).toMatchObject({ executablePath: CHROME, headless: false, viewport: null, chromiumSandbox: true });
    expect(opts.args).not.toContain('--no-sandbox');
    for (const flag of ['--enable-automation', '--disable-extensions', '--disable-sync', '--password-store=basic']) {
      expect(TEST_BROWSER_ARGS).toContain(flag);
    }
  });

  it('recognises a profile held by another browser window', () => {
    expect(isProfileInUseError(new Error('Opening in existing browser session.'))).toBe(true);
    expect(isProfileInUseError(new Error('Failed to create a ProcessSingleton for your profile directory'))).toBe(true);
    expect(isProfileInUseError(new Error('net::ERR_NAME_NOT_RESOLVED'))).toBe(false);
  });
});

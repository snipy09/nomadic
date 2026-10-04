import { chromium, type Browser, type BrowserContext } from 'playwright';
import { NO_USER_BROWSER_MESSAGE, findUserBrowser, type UserBrowser } from './user-browser.js';

export interface BrowserLaunchOptions {
  headless?: boolean;
  slowMo?: number;
  userDataDir?: string;
  args?: string[];
}

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  executablePath: string;
}

/**
 * The installed Chrome, Edge or Brave executable (see user-browser.ts). Never a downloaded
 * test build of Chromium.
 */
export function findChromeExecutable(): string | undefined {
  return findUserBrowser()?.executablePath;
}

/**
 * The browser applications are filled in. Nothing is downloaded: when no supported browser is
 * installed this throws a message telling the user what to install.
 */
export async function ensureUserBrowser(onProgress?: (message: string) => void): Promise<UserBrowser> {
  const browser = findUserBrowser();
  if (!browser) throw new Error(NO_USER_BROWSER_MESSAGE);
  onProgress?.(`Applications open in ${browser.name} (${browser.executablePath}).`);
  return browser;
}

/**
 * Launches an external stealth browser window with full anti-bot evasion.
 */
export async function launchExternalStealthBrowser(
  options: BrowserLaunchOptions = {}
): Promise<BrowserSession> {
  const executablePath = findChromeExecutable();
  const headless = options.headless ?? false;
  const slowMo = options.slowMo ?? 40;

  const defaultArgs = [
    '--start-maximized',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-features=Translate',
    '--window-size=1400,900',
    ...(options.args || []),
  ];

  const launchConfig: any = {
    headless,
    slowMo,
    args: defaultArgs,
  };

  if (executablePath) {
    launchConfig.executablePath = executablePath;
  }

  let browser: Browser;
  try {
    if (executablePath) {
      browser = await chromium.launch(launchConfig);
    } else {
      // Try channel chrome, then msedge, then default
      try {
        browser = await chromium.launch({ ...launchConfig, channel: 'chrome' });
      } catch {
        try {
          browser = await chromium.launch({ ...launchConfig, channel: 'msedge' });
        } catch {
          browser = await chromium.launch(launchConfig);
        }
      }
    }
  } catch (err: any) {
    console.warn('[Chrome Manager] Launch fallback attempt:', err?.message);
    browser = await chromium.launch({ headless, slowMo, args: defaultArgs });
  }

  // Create isolated persistent-like context
  const context = await browser.newContext({
    viewport: null,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    permissions: ['clipboard-read', 'clipboard-write', 'notifications'],
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });

  // Inject anti-detection stealth scripts
  if (typeof context.addInitScript === 'function') {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      (window as any).chrome = { runtime: {}, loadTimes: () => {}, csi: () => {}, app: {} };
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    });
  }

  return {
    browser,
    context,
    executablePath: executablePath || 'system-channel',
  };
}

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutoApplyEngine, type MasterProfile } from '../index.js';

const { mockChromium, mockContext, mockPage, closeHandlers } = vi.hoisted(() => {
  const closeHandlers: Array<() => void> = [];

  const mockPage = {
    goto: vi.fn().mockResolvedValue(null),
    url: vi.fn().mockReturnValue('about:blank'),
    bringToFront: vi.fn().mockResolvedValue(undefined),
    $: vi.fn().mockResolvedValue(null),
    $$: vi.fn().mockResolvedValue([]),
    frames: vi.fn().mockReturnValue([]),
    waitForSelector: vi.fn().mockResolvedValue(null),
    waitForTimeout: vi.fn().mockResolvedValue(null),
    evaluate: vi.fn().mockResolvedValue(false),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const mockContext = {
    newPage: vi.fn().mockResolvedValue(mockPage),
    pages: vi.fn().mockReturnValue([]),
    on: vi.fn((event: string, cb: () => void) => {
      if (event === 'close') closeHandlers.push(cb);
    }),
    close: vi.fn().mockResolvedValue(undefined),
    addInitScript: vi.fn().mockResolvedValue(undefined),
  };

  const mockChromium = {
    launchPersistentContext: vi.fn().mockResolvedValue(mockContext),
  };

  return { mockChromium, mockContext, mockPage, closeHandlers };
});

vi.mock('playwright', () => ({
  chromium: mockChromium,
}));

// The machine running the tests may have no browser installed; pretend Chrome is there.
vi.mock('../user-browser.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../user-browser.js')>()),
  findUserBrowser: () => ({ kind: 'chrome', name: 'Google Chrome', executablePath: 'C:\\Chrome\\chrome.exe' }),
}));

const mockProfile: MasterProfile = {
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@example.com',
  phone: '123-456-7890',
  linkedin: 'https://linkedin.com/in/johndoe',
  github: 'https://github.com/johndoe',
  sponsorship: 'No',
  salary: '$120,000',
  noticePeriod: '2 weeks',
  summaryText: 'Experienced Software Engineer with a background in TypeScript and React.',
};

describe('AutoApplyEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContext.pages.mockReturnValue([]);
  });

  describe('prefillParallelTabs', () => {
    it('returns early when jobUrls array is empty', async () => {
      await AutoApplyEngine.prefillParallelTabs([], mockProfile);
      expect(mockChromium.launchPersistentContext).not.toHaveBeenCalled();
    });

    it('opens the user\'s own browser with a persistent Nomadic profile, sandbox on', async () => {
      await AutoApplyEngine.prefillParallelTabs(['https://example.com/job/1'], mockProfile, 1);
      expect(mockChromium.launchPersistentContext).toHaveBeenCalledTimes(1);
      const [userDataDir, options] = mockChromium.launchPersistentContext.mock.calls[0];
      expect(userDataDir).toMatch(/Nomadic[\\/]browser_session$/);
      expect(options).toEqual(expect.objectContaining({ headless: false, chromiumSandbox: true, executablePath: 'C:\\Chrome\\chrome.exe' }));
      expect(options.args).not.toContain('--no-sandbox');
      expect(mockContext.newPage).toHaveBeenCalled();
    });

    it('reuses the open window for the next run instead of launching again', async () => {
      await AutoApplyEngine.prefillParallelTabs(['https://example.com/job/2'], mockProfile, 1);
      expect(mockChromium.launchPersistentContext).not.toHaveBeenCalled();
      expect(mockContext.newPage).toHaveBeenCalled();
    });
  });

  describe('openInBrowser', () => {
    it('opens a sign-in page in the same window and reports which browser', async () => {
      const res = await AutoApplyEngine.openInBrowser('https://internshala.com/login/user');
      expect(res).toEqual({ browser: 'Google Chrome' });
      expect(mockPage.goto).toHaveBeenCalledWith('https://internshala.com/login/user', expect.objectContaining({ waitUntil: 'domcontentloaded' }));
      expect(mockPage.bringToFront).toHaveBeenCalled();
    });

    it('relaunches after the user closes the window', async () => {
      expect(closeHandlers.length).toBeGreaterThan(0);
      closeHandlers.splice(0).forEach((cb) => cb());
      mockContext.pages.mockReturnValue([mockPage]);
      await AutoApplyEngine.openInBrowser('https://example.com/a');
      expect(mockChromium.launchPersistentContext).toHaveBeenCalledTimes(1);
      // The fresh window's empty tab is reused rather than opening a second one.
      expect(mockContext.newPage).not.toHaveBeenCalled();
    });
  });

  describe('submitApplication', () => {
    it('runs the full submission flow in the shared window', async () => {
      const result = await AutoApplyEngine.submitApplication('https://example.com/job/1', mockProfile);
      expect(result).toBeDefined();
      expect(result.url).toBe('https://example.com/job/1');
      expect(result.captchaDetected).toBe(false);
    });
  });
});

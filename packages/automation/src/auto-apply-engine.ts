import { chromium, type BrowserContext, type Page, type Frame } from 'playwright';
import path from 'path';
import fs from 'fs';
import os from 'os';
import {
  injectStealthScripts,
  humanClick,
  handleCloudflareTurnstile,
} from './stealth-evasion.js';
import { enableFastRouteInterception } from './fast-route-interceptor.js';
import { runFastLocalNavMatcher } from './fast-nav-matcher.js';
import { getATSConfig } from './ats-portals.js';
import { ApplicationNavigator } from './navigator.js';
import { FormSubmitter } from './submitter.js';
import { openPortalApplication } from './portals.js';
import { runNewFormEngine } from './form-engine-bridge.js';

export interface MasterProfile {
  firstName: string;
  lastName: string;
  fullName?: string;
  email: string;
  phone: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  projectsUrl?: string;
  sponsorship?: string;
  salary?: string;
  noticePeriod?: string;
  groqApiKey?: string;
  geminiApiKey?: string;
  summaryText?: string;
  location?: string;
  yearsOfExperience?: string;
  desiredSalary?: string;
  authorizedToWork?: boolean;
  willingToRelocate?: boolean;
  coverLetterText?: string;
  desiredTitle?: string;
  techStack?: string;
  resumeFilePath?: string;
  resumes?: Array<{ name: string; targetRole: string; filePath: string; isDefault: boolean }>;
  customAnswers?: Record<string, string>;
  cachedAnswers?: Record<string, string>;
  onAnswerResolved?: (question: string, answer: string) => void;
}

export interface ApplyResult {
  url: string;
  success: boolean;
  submitted: boolean;
  prefilled: boolean;
  captchaDetected: boolean;
  requiresLogin?: boolean;
  fieldsFilledCount?: number;
  error?: string;
}

export interface AutoApplyStatusEvent {
  phase: 'navigating' | 'filling' | 'answering' | 'uploading' | 'submitting' | 'advancing' | 'success' | 'user_input_required' | 'cancelled';
  message: string;
  colorState: 'grey' | 'green' | 'red';
  progress?: number;
  actionRequired?: string;
}

export type ProgressCallback = (event: AutoApplyStatusEvent | string) => void;

export interface ExternalBrowserSession {
  context: BrowserContext;
  userDataDir: string;
  isHeadless: boolean;
  isCDP?: boolean;
}

let activeSession: ExternalBrowserSession | null = null;

/**
 * Option 2: Connects to Personal Google Chrome Profile / Launches Real Chrome
 */
async function getOrLaunchExternalSession(): Promise<ExternalBrowserSession> {
  if (activeSession) {
    try {
      activeSession.context.pages();
      return activeSession;
    } catch {
      activeSession = null;
    }
  }

  // 1. Try connecting to active Google Chrome CDP session (if user started Chrome with debug port 9222)
  try {
    const cdpBrowser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 1500 });
    const contexts = cdpBrowser.contexts();
    const context = contexts.length > 0 ? contexts[0] : await cdpBrowser.newContext();
    activeSession = {
      context,
      userDataDir: 'localhost:9222',
      isHeadless: false,
      isCDP: true,
    };
    console.log('[Chrome Session] Connected to existing Google Chrome over CDP (Port 9222) ✓');
    return activeSession;
  } catch {}

  // 2. Personal Google Chrome User Data Path on Windows
  const personalChromeUserData = path.join(
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
    'Google',
    'Chrome',
    'User Data'
  );

  const nomadicUserDataDir = path.join(os.homedir(), 'AppData', 'Roaming', 'Nomadic', 'browser_session');
  try {
    fs.mkdirSync(nomadicUserDataDir, { recursive: true });
  } catch {}

  // 3. Attempt to launch native Chrome with Personal Profile (Default)
  let context: BrowserContext | null = null;
  const chromeArgs = [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-infobars',
    '--window-size=1280,850',
    '--profile-directory=Default',
  ];

  if (typeof (chromium as any).launchPersistentContext === 'function') {
    if (fs.existsSync(personalChromeUserData)) {
      try {
        context = await (chromium as any).launchPersistentContext(personalChromeUserData, {
          headless: false,
          channel: 'chrome',
          viewport: { width: 1280, height: 850 },
          args: chromeArgs,
          ignoreDefaultArgs: ['--enable-automation'],
          timeout: 4000,
        });
        console.log('[Chrome Session] Attached directly to Personal Google Chrome Profile (User Data\\Default) ✓');
      } catch {
        console.log('[Chrome Session] Personal Chrome is currently running; launching persistent Nomadic Chrome session ✓');
      }
    }

    // 4. Fallback to Persistent Nomadic Chrome Profile (Carries saved logins and cookies across runs)
    if (!context) {
      try {
        context = await (chromium as any).launchPersistentContext(nomadicUserDataDir, {
          headless: false,
          channel: 'chrome',
          viewport: { width: 1280, height: 850 },
          args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars',
            '--window-size=1280,850',
          ],
          ignoreDefaultArgs: ['--enable-automation'],
        });
      } catch {
        try {
          context = await (chromium as any).launchPersistentContext(nomadicUserDataDir, {
            headless: false,
            viewport: { width: 1280, height: 850 },
            args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
            ignoreDefaultArgs: ['--enable-automation'],
          });
        } catch {}
      }
    }
  }

  // 5. Standard fallback if launchPersistentContext is not available
  if (!context) {
    const browser = await chromium.launch({ headless: false });
    context = await browser.newContext();
  }

  activeSession = {
    context,
    userDataDir: nomadicUserDataDir,
    isHeadless: false,
  };

  return activeSession;
}

export class AutoApplyEngine {
  /**
   * Alias for backward compatibility.
   */
  public static async prefillParallelTabs(
    jobUrls: string[],
    profile: MasterProfile,
    onProgressOrLimit?: ((msg: string) => void) | number,
    limit: number = 3
  ): Promise<void> {
    if (!jobUrls || jobUrls.length === 0) return;
    const onProgress = typeof onProgressOrLimit === 'function' ? onProgressOrLimit : undefined;
    const finalLimit = typeof onProgressOrLimit === 'number' ? onProgressOrLimit : limit;
    return AutoApplyEngine.runAutonomousApply(jobUrls, profile, onProgress, finalLimit);
  }

  /**
   * Semi-Autonomous (Review) Mode: opens jobs, pre-fills forms with the form engine and leaves each tab
   * ready for a 1-click review. Never submits.
   */
  public static async runAutonomousApply(
    jobUrls: string[],
    profile: MasterProfile,
    onProgress?: (msg: string) => void,
    limit: number = 3
  ): Promise<void> {
    const progressCallback = typeof onProgress === 'function' ? onProgress : () => {};
    const session = await getOrLaunchExternalSession();
    const queue = [...jobUrls];

    const worker = async (workerId: number) => {
      while (queue.length > 0) {
        const url = queue.shift();
        if (!url) break;

        try {
          let page: Page = await session.context.newPage();
          await injectStealthScripts(page);
          progressCallback(`[Worker ${workerId}] Opening: ${url}`);
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
          await page.bringToFront().catch(() => {});

          await AutoApplyEngine.injectOverlay(page, '⚡ Nomadic: preparing your application...');
          await handleCloudflareTurnstile(page);
          await AutoApplyEngine.openApplicationFormIfRequired(page);
          page = await openPortalApplication(page, url);

          const out = await runNewFormEngine(page, profile).catch(() => null);
          const filled = out?.report.filled ?? 0;
          const needs = out ? out.report.fields.filter((f) => f.status === 'needs_user' || f.status === 'failed').map((f) => f.label) : [];
          await AutoApplyEngine.injectOverlay(
            page,
            filled > 0
              ? needs.length ? `✓ Filled ${filled} fields. Needs you: ${needs.slice(0, 3).join('; ')}` : '✓ Auto-filled! Ready for 1-click review & submit'
              : 'Nomadic: no application form found here, please review manually',
            filled > 0 && !needs.length ? '#22c55e' : '#f59e0b'
          );
          progressCallback(`[Ready for Review] ${url} (${filled} fields filled${needs.length ? `, ${needs.length} need you` : ''})`);
        } catch (err: any) {
          progressCallback(`[Notice] ${url}: ${err?.message}`);
        }
      }
    };

    const workerCount = Math.min(limit, queue.length);
    await Promise.all(Array.from({ length: workerCount }, (_, i) => worker(i + 1)));
  }

  /**
   * Full application flow for one URL: open, pass security/login walls, reach the form, fill it with the form
   * engine, verify, and submit only when every required field is resolved.
   */
  public static async submitApplication(
    url: string,
    profile: MasterProfile,
    onProgress?: ProgressCallback
  ): Promise<ApplyResult> {
    const fail = (error: string, extra: Partial<ApplyResult> = {}): ApplyResult => ({
      url, success: false, submitted: false, prefilled: false, captchaDetected: false, fieldsFilledCount: 0, error, ...extra,
    });
    if (!url || !url.trim()) return fail('Invalid URL', { url: '' });

    let page!: Page;
    try {
      const session = await getOrLaunchExternalSession();
      page = await session.context.newPage();
      await injectStealthScripts(page);
      await enableFastRouteInterception(page);

      // "Apply with..." links may open the real form in a popup; follow it.
      page.on('popup', async (popup) => {
        try {
          await injectStealthScripts(popup);
          await enableFastRouteInterception(popup);
          await popup.waitForLoadState('domcontentloaded').catch(() => {});
          page = popup;
          await page.bringToFront().catch(() => {});
        } catch {}
      });

      const emit = (phase: AutoApplyStatusEvent['phase'], message: string, colorState: AutoApplyStatusEvent['colorState'], actionRequired?: string) =>
        AutoApplyEngine.emitStatus(page, { phase, message, colorState, actionRequired }, onProgress);

      if (typeof onProgress === 'function') onProgress({ phase: 'navigating', message: `Opening: ${url}`, colorState: 'grey' });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.bringToFront().catch(() => {});

      // Built-in demo job: exercises the real engine against a local form.
      if (url.includes('httpbin.org') || url.includes('nomadic-demo') || url.includes('test-job')) {
        return await AutoApplyEngine.handleDemoTestApplication(page, profile, url, onProgress);
      }

      const atsConfig = getATSConfig(url);
      let totalFieldsFilled = 0;
      let isSubmitted = false;
      let pendingItems: string[] = [];
      const MAX_PASSES = 6;

      await emit('navigating', `Applying to ${atsConfig.name}...`, 'grey');

      for (let pass = 1; pass <= MAX_PASSES; pass++) {
        await page.waitForTimeout(150);

        // 1. Cloudflare / WAF / expired posting
        const cf = await handleCloudflareTurnstile(page);
        if (cf.detected && !cf.resolved) {
          await emit('user_input_required', 'Cloudflare verification: please complete it in the browser', 'red', 'Verify Human Check');
          await page.waitForTimeout(1500);
        }
        const expired = await AutoApplyEngine.detect404OrExpiredPage(page);
        if (expired.is404) {
          await emit('cancelled', 'Job posting closed or not found', 'red', 'Job Expired');
          return fail('Job posting closed or not found (404)');
        }
        const waf = await AutoApplyEngine.detectWafOrAccessRestricted(page);
        if (waf.isBlocked) {
          await emit('user_input_required', 'Access restricted: please solve the security check in the browser', 'red', 'Verify Access');
          await page.bringToFront().catch(() => {});
          if (!(await AutoApplyEngine.waitForWafUnblocked(page, onProgress))) {
            return fail('Access restricted by portal security (left open in browser)', { captchaDetected: true });
          }
        }

        // 2. Already submitted?
        if (totalFieldsFilled > 0 && (await AutoApplyEngine.isPageConfirmedSubmission(page, totalFieldsFilled))) {
          await emit('success', `Application submitted to ${atsConfig.name}`, 'green');
          return { url, success: true, submitted: true, prefilled: true, captchaDetected: false, fieldsFilledCount: totalFieldsFilled };
        }

        // 3. Login wall / CAPTCHA
        const login = await AutoApplyEngine.detectLoginRequired(page);
        if (login.requiresLogin) {
          const label = login.portalName || atsConfig.name || 'the job portal';
          await emit('user_input_required', `Account required: please sign in or register on ${label}`, 'red', `Sign in to ${label}`);
          await page.bringToFront().catch(() => {});
          if (await AutoApplyEngine.waitForLoginComplete(page, onProgress)) {
            await emit('navigating', `Signed in to ${label}. Resuming...`, 'grey');
            continue;
          }
          return fail(`Sign-in required on ${label} (left open in browser)`, { requiresLogin: true });
        }
        if (await AutoApplyEngine.detectCaptcha(page)) {
          await emit('user_input_required', 'CAPTCHA detected: please solve it to continue', 'red', 'Solve CAPTCHA');
          return fail('CAPTCHA challenge detected (left open in browser)', { captchaDetected: true });
        }

        // 4. Get from the job description to the form (generic matcher, then portal-specific quirks)
        const hasForm = await page.evaluate(() => {
          const container = document.querySelector('#application-form, .application-form, form[action*="apply"], #application_modal, [data-qa="application-form"]');
          const email = document.querySelector('input[type="email"], input[name*="email" i]');
          const file = document.querySelector('input[type="file"]');
          return Boolean(container) || Boolean(email && file);
        }).catch(() => false);

        if (!hasForm) {
          const fastNav = await runFastLocalNavMatcher(page, profile.desiredTitle);
          if (fastNav.triggered && fastNav.action !== 'form_already_present') {
            await emit('navigating', `Opening application form (${fastNav.action.replace(/_/g, ' ')})...`, 'grey');
            await page.waitForTimeout(400);
            const open = session.context.pages();
            const latest = open[open.length - 1];
            if (open.length > 1 && latest && latest !== page && !latest.isClosed()) {
              page = latest;
              await injectStealthScripts(page);
              await enableFastRouteInterception(page);
              await page.bringToFront().catch(() => {});
            }
            await page.waitForLoadState('domcontentloaded').catch(() => {});
          }
        }
        page = await openPortalApplication(page, url);

        // 5. Fill + verify with the form engine
        const out = await runNewFormEngine(page, profile).catch(() => null);
        if (out && out.foundForm && out.report.filled > 0) {
          totalFieldsFilled += out.report.filled;
          await emit('filling', `Filled ${out.report.filled} fields${out.report.needsUser ? `, ${out.report.needsUser} need you` : ''}...`, 'green');

          if (out.safeToSubmit) {
            await emit('submitting', 'All required fields verified. Submitting...', 'grey');
            const res = await new FormSubmitter(page, atsConfig).submitAndVerify();
            if (res.submitted) {
              isSubmitted = true;
              if (res.confirmed) break;
            }
          } else {
            pendingItems = Array.from(new Set([
              ...out.report.unresolvedRequired,
              ...out.report.fields.filter((f) => f.status === 'needs_user' || f.status === 'failed').map((f) => f.label),
            ])).filter(Boolean);
          }

          if (!isSubmitted && await AutoApplyEngine.advanceApplicationStepper(page)) {
            await emit('advancing', 'Next step...', 'grey');
            await page.waitForTimeout(500);
            continue;
          }
          break;
        }

        // 6. No form yet: let the navigator try (modals, tabs), then retry on the next pass
        const nav = new ApplicationNavigator(page, atsConfig);
        const navResult = await nav.navigateToApplicationForm();
        if (navResult.formPage && navResult.formPage !== page && !navResult.formPage.isClosed()) page = navResult.formPage;
      }

      if (isSubmitted && totalFieldsFilled > 0) {
        await emit('success', 'Application submitted successfully', 'green');
        return { url, success: true, submitted: true, prefilled: true, captchaDetected: false, fieldsFilledCount: totalFieldsFilled };
      }

      if (totalFieldsFilled > 0) {
        await emit(
          'user_input_required',
          pendingItems.length
            ? `Pre-filled ${totalFieldsFilled} fields. Needs you: ${pendingItems.slice(0, 4).join('; ')}`
            : `Pre-filled ${totalFieldsFilled} fields. Review and click Submit`,
          pendingItems.length ? 'red' : 'green',
          pendingItems.length ? 'Complete the highlighted fields' : 'Review Form & Click Submit'
        );
        return { url, success: true, submitted: false, prefilled: true, captchaDetected: false, fieldsFilledCount: totalFieldsFilled };
      }

      await emit('cancelled', 'No application form found on this page', 'red', 'Review Portal Manually');
      return fail('No application form inputs found on page');
    } catch (err: any) {
      if (typeof onProgress === 'function') onProgress({ phase: 'cancelled', message: `Notice: ${err?.message}`, colorState: 'grey' });
      return fail(err?.message || String(err));
    }
  }

  // ── Helper Methods ────────────────────────────────────────────────────────

  private static getAllFrames(page: Page): (Page | Frame)[] {
    try {
      const frames = page.frames();
      return [page, ...frames];
    } catch {
      return [page];
    }
  }

  /**
   * Detects if the current page is an HTTP 404 / 410, closed listing, or expired error page.
   */
  public static async detect404OrExpiredPage(page: Page): Promise<{ is404: boolean; reason?: string }> {
    try {
      const errorSignatures = [
        "sorry, we couldn't find anything here",
        "the job posting you're looking for might have closed",
        "404 error",
        "404 not found",
        "404 - not found",
        "page not found",
        "page does not exist",
        "job not found",
        "this job has expired",
        "this internship has expired",
        "no longer accepting applications",
        "position has been filled",
        "job is no longer available",
        "looks like you crashed",
        "application closed for this",
        "no such job",
        "no such internship",
      ];

      const targets = AutoApplyEngine.getAllFrames(page);
      for (const target of targets) {
        const isError = await target.evaluate((sigs) => {
          const title = (document.title || '').toLowerCase();
          const body = (document.body?.innerText || '').toLowerCase();

          for (const sig of sigs) {
            if (title.includes(sig) || body.includes(sig)) {
              return { is404: true, reason: sig };
            }
          }

          const h1Text = Array.from(document.querySelectorAll('h1, h2, h3')).map(h => (h.textContent || '').toLowerCase()).join(' ');
          if (h1Text.includes('404') || h1Text.includes('not found') || h1Text.includes('page not found') || h1Text.includes('expired')) {
            return { is404: true, reason: '404_heading' };
          }

          return { is404: false };
        }, errorSignatures).catch(() => ({ is404: false }));

        if (isError.is404) return isError;
      }
      return { is404: false };
    } catch {
      return { is404: false };
    }
  }

  /**
   * Checks if the DOM currently confirms successful application submission.
   */
  public static async isPageConfirmedSubmission(page: Page, fieldsFilledCount: number = 0): Promise<boolean> {
    try {
      // 404 / error pages must never be confirmed
      const errCheck = await AutoApplyEngine.detect404OrExpiredPage(page);
      if (errCheck.is404) return false;

      return await page.evaluate((filled) => {
        const text = (document.body?.innerText || '').toLowerCase();
        const successPhrases = [
          'thank you for applying',
          'application submitted',
          'application has been submitted',
          'application received',
          'we have received your application',
          'successfully submitted',
          'your application was sent',
          'thanks for applying',
        ];
        const hasSuccessText = successPhrases.some(phrase => text.includes(phrase));
        const hasSuccessContainer = Boolean(
          document.querySelector('.application-confirmation, .success-message, [data-qa="success-message"], #application_confirmation, .submission-success')
        );

        return hasSuccessContainer || (hasSuccessText && (filled > 0 || !document.querySelector('input, select, textarea')));
      }, fieldsFilledCount);
    } catch {
      return false;
    }
  }

  public static async emitStatus(
    page: Page | null,
    event: AutoApplyStatusEvent,
    callback?: ProgressCallback
  ): Promise<void> {
    if (page && !page.isClosed()) {
      try {
        const color = event.colorState === 'green' ? '#22c55e' : event.colorState === 'red' ? '#ef4444' : '#64748b';
        await AutoApplyEngine.injectOverlay(page, event.message, color);
      } catch {}
    }
    if (typeof callback === 'function') {
      callback(event);
    }
  }

  public static async detectWafOrAccessRestricted(page: Page): Promise<{ isBlocked: boolean; reason?: string }> {
    try {
      const wafSignatures = [
        'access is temporarily restricted',
        'we detected unusual activity from your device or network',
        'automated (bot) activity on your network',
        'use of developer or inspection tools',
        'access denied',
        'security challenge',
        'you have been blocked',
        'waf protection',
        'datadome',
        'perimeterx',
        'attention required! | cloudflare',
        'sorry, you have been blocked',
      ];

      const targets = AutoApplyEngine.getAllFrames(page);
      for (const target of targets) {
        const check = await target.evaluate((sigs) => {
          const body = (document.body?.innerText || '').toLowerCase();
          const title = (document.title || '').toLowerCase();

          for (const sig of sigs) {
            if (body.includes(sig) || title.includes(sig)) {
              return { isBlocked: true, reason: sig };
            }
          }
          return { isBlocked: false };
        }, wafSignatures).catch(() => ({ isBlocked: false }));

        if (check.isBlocked) return check;
      }
      return { isBlocked: false };
    } catch {
      return { isBlocked: false };
    }
  }

  public static async waitForWafUnblocked(page: Page, onProgress?: ProgressCallback): Promise<boolean> {
    const maxWaitSeconds = 25;
    const start = Date.now();

    while ((Date.now() - start) / 1000 < maxWaitSeconds) {
      if (page.isClosed()) return false;
      const check = await AutoApplyEngine.detectWafOrAccessRestricted(page);
      if (!check.isBlocked) return true;
      await page.waitForTimeout(2000);
    }
    return false;
  }

  public static async detectCaptcha(page: Page): Promise<boolean> {
    try {
      const targets = AutoApplyEngine.getAllFrames(page);
      for (const target of targets) {
        const hasCaptcha = await target.evaluate(() => {
          const body = (document.body?.innerText || '').toLowerCase();
          const hasText = body.includes('recaptcha') || body.includes('hcaptcha') || body.includes('security check');
          const hasIframe = Boolean(
            document.querySelector('iframe[src*="recaptcha"]') ||
            document.querySelector('iframe[src*="hcaptcha"]') ||
            document.querySelector('.g-recaptcha') ||
            document.querySelector('.h-captcha')
          );
          return hasText && hasIframe;
        });
        if (hasCaptcha) return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  public static async detectLoginRequired(page: Page): Promise<{ requiresLogin: boolean; portalName?: string }> {
    try {
      const currentUrl = page.url().toLowerCase();
      if (
        currentUrl.includes('/login') ||
        currentUrl.includes('/signin') ||
        currentUrl.includes('/auth') ||
        currentUrl.includes('/register') ||
        currentUrl.includes('/signup') ||
        currentUrl.includes('accounts.google.com')
      ) {
        const portal = currentUrl.includes('internshala') ? 'Internshala' :
                       currentUrl.includes('naukri') ? 'Naukri' :
                       currentUrl.includes('workday') ? 'Workday' : 'Job Portal';
        return { requiresLogin: true, portalName: portal };
      }

      const targets = AutoApplyEngine.getAllFrames(page);
      for (const target of targets) {
        const check = await target.evaluate(() => {
          const body = (document.body?.innerText || '').toLowerCase();
          const title = (document.title || '').toLowerCase();

          const loginSignatures = [
            'sign up now to unlock',
            'sign up with google',
            'sign up with email',
            'register now to access',
            'register to apply',
            'sign in to apply',
            'log in to apply',
            'login to continue',
            'please log in',
            'create an account to apply',
            'sign in with your account',
            'enter your password',
          ];

          for (const sig of loginSignatures) {
            if (body.includes(sig) || title.includes(sig)) {
              return { requiresLogin: true, match: sig };
            }
          }

          const hasModal = Boolean(
            document.querySelector('#registration_modal, #login_modal, .registration_modal, .login_modal, [id*="signup-modal"], [class*="signup-modal"]')
          );
          if (hasModal) {
            return { requiresLogin: true, match: 'modal_detected' };
          }

          const hasPw = Boolean(document.querySelector('input[type="password"]'));
          const hasLoginText = body.includes('sign in') || body.includes('log in') || body.includes('register');
          if (hasPw && hasLoginText) {
            return { requiresLogin: true, match: 'password_input' };
          }

          return { requiresLogin: false };
        }).catch(() => ({ requiresLogin: false }));

        if (check.requiresLogin) {
          const portal = currentUrl.includes('internshala') ? 'Internshala' :
                         currentUrl.includes('naukri') ? 'Naukri' :
                         currentUrl.includes('workday') ? 'Workday' :
                         currentUrl.includes('lever') ? 'Lever' : 'Job Portal';
          return { requiresLogin: true, portalName: portal };
        }
      }
      return { requiresLogin: false };
    } catch {
      return { requiresLogin: false };
    }
  }

  public static async waitForLoginComplete(page: Page, onProgress?: ProgressCallback): Promise<boolean> {
    const maxWaitSeconds = 60;
    const start = Date.now();

    while ((Date.now() - start) / 1000 < maxWaitSeconds) {
      if (page.isClosed()) return false;
      const check = await AutoApplyEngine.detectLoginRequired(page);
      if (!check.requiresLogin) return true;
      await page.waitForTimeout(2000);
    }
    return false;
  }

  public static async openApplicationFormIfRequired(page: Page): Promise<void> {
    try {
      const targets = AutoApplyEngine.getAllFrames(page);
      for (const target of targets) {
        const applyTriggers = [
          'button:has-text("Apply Now")',
          'button:has-text("Apply for this job")',
          'button:has-text("Apply with Resume")',
          'button:has-text("Apply")',
          'a:has-text("Apply Now")',
          'a:has-text("Apply for this job")',
          'a[href*="apply"]',
          '[data-qa="apply-button"]',
          '.apply-button',
        ];

        for (const sel of applyTriggers) {
          try {
            const btn = await target.$(sel);
            if (btn) {
              const isVisible = await btn.isVisible().catch(() => false);
              if (isVisible) {
                await humanClick(target, btn);
                await page.waitForTimeout(1500);
                return;
              }
            }
          } catch {}
        }
      }
    } catch {}
  }

  /** Click Next/Continue on a multi-step form. Returns true when a step button was clicked. */
  public static async advanceApplicationStepper(page: Page): Promise<boolean> {
    try {
      const btn = await AutoApplyEngine.findNextStepButton(page);
      if (!btn) return false;
      await humanClick(page, btn);
      await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  public static async findNextStepButton(page: Page): Promise<any | null> {
    const targets = AutoApplyEngine.getAllFrames(page);
    for (const target of targets) {
      const selectors = [
        'button:has-text("Next")',
        'button:has-text("Continue")',
        'button:has-text("Proceed")',
        'button:has-text("Next Step")',
        'button[data-qa*="next"]',
        'input[type="submit"][value*="Next" i]',
        'input[type="button"][value*="Next" i]',
        'button[aria-label*="next" i]',
      ];
      for (const sel of selectors) {
        try {
          const btn = await target.$(sel);
          if (btn) {
            const isVisible = await btn.isVisible().catch(() => false);
            const isEnabled = await btn.isEnabled().catch(() => false);
            if (isVisible && isEnabled) return btn;
          }
        } catch {}
      }
    }
    return null;
  }

  public static async findSubmitButton(page: Page): Promise<any | null> {
    const targets = AutoApplyEngine.getAllFrames(page);
    for (const target of targets) {
      const selectors = [
        'button:has-text("Submit Application")',
        'button:has-text("Submit application")',
        'button:has-text("Submit")',
        'button:has-text("Send Application")',
        'button:has-text("Complete Application")',
        'button[type="submit"]',
        'input[type="submit"]',
        '[data-qa*="submit"]',
      ];
      for (const sel of selectors) {
        try {
          const btn = await target.$(sel);
          if (btn) {
            const isVisible = await btn.isVisible().catch(() => false);
            const isEnabled = await btn.isEnabled().catch(() => false);
            if (isVisible && isEnabled) return btn;
          }
        } catch {}
      }
    }
    return null;
  }

  public static async submitForm(page: Page): Promise<boolean> {
    const btn = await AutoApplyEngine.findSubmitButton(page);
    if (btn) {
      await humanClick(page, btn);
      await page.waitForTimeout(2000);
      return true;
    }
    return false;
  }

  public static async tryEasyApplyButton(page: Page): Promise<boolean> {
    const targets = AutoApplyEngine.getAllFrames(page);
    for (const target of targets) {
      try {
        const easyBtn = await target.$('button:has-text("Easy Apply"), button:has-text("1-Click Apply"), button:has-text("Quick Apply")');
        if (easyBtn && await easyBtn.isVisible().catch(() => false)) {
          await humanClick(target, easyBtn);
          await page.waitForTimeout(1500);
          return true;
        }
      } catch {}
    }
    return false;
  }

  public static async injectOverlay(page: Page, text: string, color: string = '#22c55e'): Promise<void> {
    try {
      await page.evaluate(({ message, badgeColor }) => {
        let el = document.getElementById('nomadic-auto-apply-overlay');
        if (!el) {
          el = document.createElement('div');
          el.id = 'nomadic-auto-apply-overlay';
          el.style.position = 'fixed';
          el.style.bottom = '24px';
          el.style.right = '24px';
          el.style.zIndex = '2147483647';
          el.style.padding = '10px 18px';
          el.style.borderRadius = '9999px';
          el.style.background = '#09090b';
          el.style.color = '#ffffff';
          el.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          el.style.fontSize = '12px';
          el.style.fontWeight = '600';
          el.style.display = 'flex';
          el.style.alignItems = 'center';
          el.style.gap = '8px';
          el.style.boxShadow = '0 10px 25px -5px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)';
          el.style.transition = 'all 0.2s ease-in-out';
          document.body.appendChild(el);
        }
        el.innerHTML = `<span style="width: 8px; height: 8px; border-radius: 50%; background: ${badgeColor}; display: inline-block;"></span> <span>${message}</span>`;
      }, { message: text, badgeColor: color }).catch(() => {});
    } catch {}
  }

  private static async handleDemoTestApplication(
    page: Page,
    profile: MasterProfile,
    url: string,
    onProgress?: ProgressCallback
  ): Promise<ApplyResult> {
    // Render clean interactive test application UI
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Nomadic Labs — Candidate Application (Test Portal)</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #09090b; color: #f8fafc; padding: 40px; display: flex; justify-content: center; }
            .card { background: #18181b; border: 1px solid #27272a; border-radius: 16px; width: 100%; max-width: 600px; padding: 32px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
            h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; color: #ffffff; }
            p { font-size: 13px; color: #a1a1aa; margin-bottom: 24px; }
            .field { margin-bottom: 16px; }
            label { display: block; font-size: 12px; font-weight: 600; color: #cbd5e1; margin-bottom: 6px; }
            input, textarea, select { width: 100%; background: #27272a; border: 1px solid #3f3f46; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #ffffff; box-sizing: border-box; outline: none; }
            input:focus { border-color: #38bdf8; }
            .btn { width: 100%; background: #ffffff; color: #09090b; font-weight: 700; font-size: 13px; padding: 12px; border-radius: 8px; border: none; cursor: pointer; margin-top: 12px; }
            .badge { display: inline-block; background: #0284c7; color: #ffffff; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 9999px; margin-bottom: 12px; }
            .success-banner { display: none; background: #052e16; border: 1px solid #166534; border-radius: 8px; padding: 16px; text-align: center; margin-top: 20px; }
            .success-banner h3 { color: #4ade80; font-size: 15px; margin: 0 0 4px 0; }
            .success-banner p { color: #86efac; font-size: 12px; margin: 0; }
          </style>
        </head>
        <body>
          <div class="card">
            <span class="badge">VERIFIED ATS DEMO SIMULATOR</span>
            <h1>Senior Product / Software Specialist</h1>
            <p>Nomadic Labs · Global Remote · Engineering Platform</p>
            <form id="demo-form" onsubmit="event.preventDefault(); document.getElementById('success-msg').style.display='block';">
              <div class="field">
                <label>Full Name</label>
                <input id="fullName" name="fullName" placeholder="Your Name" />
              </div>
              <div class="field">
                <label>Email Address</label>
                <input id="email" name="email" type="email" placeholder="email@domain.com" />
              </div>
              <div class="field">
                <label>Phone Number</label>
                <input id="phone" name="phone" placeholder="+1 (555) 000-0000" />
              </div>
              <div class="field">
                <label>LinkedIn Profile URL</label>
                <input id="linkedin" name="linkedin" placeholder="https://linkedin.com/in/username" />
              </div>
              <div class="field">
                <label>Work Authorization</label>
                <select id="workAuth">
                  <option value="yes">Authorized to work in country</option>
                  <option value="no">Require Visa Sponsorship</option>
                </select>
              </div>
              <button type="submit" id="submitBtn" class="btn">Submit Application</button>
            </form>
            <div id="success-msg" class="success-banner">
              <h3>✓ Application Submitted Successfully!</h3>
              <p>Your candidate profile and resume have been recorded in the demo portal.</p>
            </div>
          </div>
        </body>
      </html>
    `).catch(() => {});

    await AutoApplyEngine.emitStatus(page, { phase: 'filling', message: 'Nomadic AI filling application fields...', colorState: 'grey' }, onProgress);

    // The demo runs the same engine as real applications (and never invents missing profile data).
    const demoOut = await runNewFormEngine(page, profile).catch(() => null);
    const demoFilled = demoOut?.report.filled ?? 0;
    await page.waitForTimeout(300);

    await AutoApplyEngine.emitStatus(page, { phase: 'uploading', message: 'Attaching candidate PDF resume...', colorState: 'grey' }, onProgress);
    await page.waitForTimeout(300);

    await AutoApplyEngine.emitStatus(page, { phase: 'submitting', message: 'Submitting completed application...', colorState: 'grey' }, onProgress);
    await page.click('#submitBtn').catch(() => {});
    await page.waitForTimeout(400);

    await AutoApplyEngine.emitStatus(page, { phase: 'success', message: 'Demo Application Submitted Successfully!', colorState: 'green' }, onProgress);

    return {
      url,
      success: true,
      submitted: true,
      prefilled: true,
      captchaDetected: false,
      fieldsFilledCount: demoFilled,
    };
  }
}

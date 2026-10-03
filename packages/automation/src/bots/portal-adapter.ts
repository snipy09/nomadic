/**
 * Thin ATS adapters on top of FormEngine. An adapter only knows how to get
 * from a job page to the application form (click Apply, open a modal, pick
 * "Apply manually") and whether the flow is multi-step. Filling, verifying and
 * submitting are done by the shared engine.
 *
 * Set NOMADIC_FORM_ENGINE=old to route the bots and AutoApplyEngine through the
 * legacy solvers instead.
 */
import type { Page } from 'playwright';
import {
  FormEngine,
  type AnswerContext,
  type FillReport,
  type FormEngineListener,
  type FormEngineOptions,
  type SubmitOutcome,
} from '../../../form-engine/src/index.js';
import type { MasterProfile } from '../../../form-engine/src/profile.js';

export type FormEngineMode = 'new' | 'old';

/** Feature flag: NOMADIC_FORM_ENGINE=old keeps the legacy solver chain. */
export function formEngineMode(): FormEngineMode {
  return String(process.env.NOMADIC_FORM_ENGINE || '').toLowerCase() === 'old' ? 'old' : 'new';
}

export interface SpecializedBotResult {
  success: boolean;
  fieldsFilled: number;
  submitted: boolean;
  confirmed: boolean;
  error?: string;
  /** New engine only: full fill report (fields, needs_user reasons, walls). */
  report?: FillReport;
  submitOutcome?: SubmitOutcome;
}

export type PortalId = 'ashby' | 'greenhouse' | 'lever' | 'internshala' | 'workday' | 'generic';

export interface PortalAdapter {
  id: PortalId;
  matches(url: string): boolean;
  /** Bring the application form on screen. Must never submit. */
  prepare(page: Page): Promise<void>;
  /** Fill step by step through "Next / Save and Continue". */
  multiStep?: boolean;
}

export interface BotApplyOptions {
  /** Click submit when the engine reports the form complete (default false: leave for review). */
  submit?: boolean;
  engine?: FormEngine;
  engineOptions?: FormEngineOptions;
  ctx?: AnswerContext;
  onEvent?: FormEngineListener;
}

async function clickFirstVisible(page: Page, selectors: string[], waitMs = 500): Promise<boolean> {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    try {
      if (await loc.isVisible({ timeout: 150 })) {
        await loc.click({ timeout: 2000 }).catch(() => loc.evaluate((el) => (el as HTMLElement).click()));
        await page.waitForTimeout(waitMs);
        return true;
      }
    } catch { /* try next */ }
  }
  return false;
}

async function anyVisible(page: Page, selectors: string[]): Promise<boolean> {
  for (const sel of selectors) {
    if (await page.locator(sel).first().isVisible({ timeout: 100 }).catch(() => false)) return true;
  }
  return false;
}

const GENERIC_FORM = ['form input[type="email"]', 'form input[type="file"]', 'input[name*="email" i]', 'iframe#grnhse_iframe'];

export const ashbyAdapter: PortalAdapter = {
  id: 'ashby',
  matches: (u) => /jobs\.ashbyhq\.com/i.test(u),
  async prepare(page) {
    if (await anyVisible(page, ['#_systemfield_name', '#_systemfield_email', 'form.ashby-application-form input'])) return;
    await clickFirstVisible(page, ['a[role="tab"]:has-text("Application")', 'a:has-text("Apply for this job")', 'button:has-text("Apply for this job")', 'a:has-text("Apply for this role")', 'button:has-text("Apply")']);
  },
};

export const greenhouseAdapter: PortalAdapter = {
  id: 'greenhouse',
  matches: (u) => /greenhouse\.io|gh_jid=/i.test(u),
  async prepare(page) {
    if (await anyVisible(page, ['#application_form', '#application-form', 'iframe#grnhse_iframe', '#first_name'])) return;
    await clickFirstVisible(page, ['#apply_button', 'a[href*="#app"]', 'button:has-text("Apply for this job")', 'a:has-text("Apply for this job")', 'button:has-text("Apply")']);
  },
};

export const leverAdapter: PortalAdapter = {
  id: 'lever',
  matches: (u) => /jobs\.lever\.co/i.test(u),
  async prepare(page) {
    if (await anyVisible(page, ['#application-form', 'form[data-qa="application-form"]'])) return;
    await clickFirstVisible(page, ['a.postings-btn[href$="/apply"]', 'a[href$="/apply"]', 'a:has-text("Apply for this job")'], 800);
    await page.waitForLoadState('domcontentloaded').catch(() => {});
  },
};

export const internshalaAdapter: PortalAdapter = {
  id: 'internshala',
  matches: (u) => /internshala\.com/i.test(u),
  async prepare(page) {
    const modalOpen = () => anyVisible(page, ['#easy_apply_modal form', '#application_modal form', '.modal.show form', '#application-form', '#cover_letter']);
    if (!(await modalOpen())) {
      await clickFirstVisible(page, ['#easy_apply_button', '#apply_now_button', 'button:has-text("Apply now")', 'a:has-text("Apply now")', '.buttons_container .btn-primary'], 600);
    }
    // Some postings show a resume step first.
    await clickFirstVisible(page, ['#proceed_to_application', 'button:has-text("Proceed to application")', 'a:has-text("Proceed to application")'], 600);
  },
};

export const workdayAdapter: PortalAdapter = {
  id: 'workday',
  matches: (u) => /myworkdayjobs\.com|workday\.com/i.test(u),
  multiStep: true,
  async prepare(page) {
    if (await anyVisible(page, ['[data-automation-id="applyFlowPage"]', '[data-automation-id="signInContent"]'])) return;
    await clickFirstVisible(page, ['a[data-automation-id="adventureButton"]', 'button:has-text("Apply")', 'a:has-text("Apply")'], 800);
    await clickFirstVisible(page, ['a[data-automation-id="applyManually"]', 'button:has-text("Apply Manually")', 'a:has-text("Apply Manually")'], 800);
  },
};

export const genericAdapter: PortalAdapter = {
  id: 'generic',
  matches: () => true,
  async prepare(page) {
    if (await anyVisible(page, GENERIC_FORM)) return;
    await clickFirstVisible(page, ['button:has-text("Apply now")', 'a:has-text("Apply now")', 'button:has-text("Apply for this job")', 'a:has-text("Apply for this job")', '[data-qa="apply-button"]', '.apply-button']);
  },
};

export const PORTAL_ADAPTERS: PortalAdapter[] = [ashbyAdapter, greenhouseAdapter, leverAdapter, internshalaAdapter, workdayAdapter];

export function adapterFor(url: string): PortalAdapter {
  return PORTAL_ADAPTERS.find((a) => a.matches(url)) || genericAdapter;
}

export function adapterById(id: PortalId | string): PortalAdapter {
  return [...PORTAL_ADAPTERS, genericAdapter].find((a) => a.id === id) || genericAdapter;
}

/** navigate (adapter.prepare) -> FormEngine.fill / fillSteps -> optional explicit submit. */
export async function runPortalAdapter(page: Page, profile: MasterProfile, adapter: PortalAdapter, opts: BotApplyOptions = {}): Promise<{ report: FillReport; submit?: SubmitOutcome; engine: FormEngine }> {
  const engine = opts.engine || new FormEngine(opts.engineOptions);
  const listener = opts.onEvent;
  if (listener) engine.on('event', listener);
  try {
    await adapter.prepare(page);
    const report = adapter.multiStep ? await engine.fillSteps(page, profile, { ctx: opts.ctx }) : await engine.fill(page, profile, opts.ctx);
    let submit: SubmitOutcome | undefined;
    if (opts.submit) submit = await engine.submit(page, report);
    return { report, submit, engine };
  } finally {
    if (listener) engine.off('event', listener);
  }
}

export async function applyWithAdapter(page: Page, profile: MasterProfile, adapter: PortalAdapter, opts: BotApplyOptions = {}): Promise<SpecializedBotResult> {
  try {
    const { report, submit } = await runPortalAdapter(page, profile, adapter, opts);
    return {
      success: report.filled > 0,
      fieldsFilled: report.filled,
      submitted: !!submit?.submitted,
      confirmed: !!submit?.confirmed,
      report,
      submitOutcome: submit,
      error: report.walls.length ? `needs user: ${report.walls.join(', ')}` : undefined,
    };
  } catch (err) {
    return { success: false, fieldsFilled: 0, submitted: false, confirmed: false, error: (err as Error).message };
  }
}

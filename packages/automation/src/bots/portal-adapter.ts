/**
 * Thin ATS adapters on top of FormEngine. An adapter only knows how to get
 * from a job page to the application form (click Apply, open a modal, pick
 * "Apply manually") and whether the flow is multi-step. Filling, verifying and
 * submitting are done by the shared engine.
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
import { ANY_CONTROL, adapterSpecById, type AdapterSpec, type PortalId } from '../../../form-engine/src/adapters.js';

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

export type { PortalId };

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

/** Wait until the page settles on a form (after a click that navigates or opens a modal). */
async function waitForForm(page: Page, timeoutMs = 12000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
    if (await anyVisible(page, ANY_CONTROL).catch(() => false)) return;
    await page.waitForTimeout(400).catch(() => {});
  }
}

/** A Playwright adapter running the shared steps in packages/form-engine/src/adapters.ts. */
function fromSpec(spec: AdapterSpec): PortalAdapter {
  return {
    id: spec.id,
    matches: (u) => (spec.urlPattern ? spec.urlPattern.test(u) : true),
    multiStep: spec.multiStep,
    async prepare(page) {
      const onForm = (spec.formUrl?.test(page.url()) ?? false) || (await anyVisible(page, spec.formVisible));
      if (onForm && !spec.after && !spec.waitForForm) return;
      if (!onForm) {
        for (const step of spec.open) await clickFirstVisible(page, step.selectors, step.waitMs);
        if (spec.settleAfterOpen) await page.waitForLoadState('domcontentloaded').catch(() => {});
      }
      for (const step of spec.after || []) await clickFirstVisible(page, step.selectors, step.waitMs);
      if (spec.waitForForm) await waitForForm(page);
    },
  };
}

export const ashbyAdapter = fromSpec(adapterSpecById('ashby'));
export const greenhouseAdapter = fromSpec(adapterSpecById('greenhouse'));
export const leverAdapter = fromSpec(adapterSpecById('lever'));
export const internshalaAdapter = fromSpec(adapterSpecById('internshala'));
export const workdayAdapter = fromSpec(adapterSpecById('workday'));
export const genericAdapter = fromSpec(adapterSpecById('generic'));

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

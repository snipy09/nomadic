/**
 * Apply with review on Android: the job page is open in the app's apply WebView
 * (ApplyBrowser plugin), every frame runs the agent, and this module drives it:
 *
 *   wait for the page -> open the form (ATS steps, adapters.ts) -> fill (shared core)
 *   -> hand the report to the review screen -> submitReviewed() only after the candidate
 *      ticked "I reviewed this" (writes their edits, re-checks walls and required fields).
 *
 * Nothing here ever submits on its own. Runs in the app's JS (browser), never in the page.
 */
import type { AnswerContext, FillReport, FormEngineEvent, FormEngineListener } from '../contracts.js';
import type { MasterProfile } from '../profile.js';
import { ProfileAnswerer, type AnswerCache, type ResumeResolver } from '../answerer.js';
import { RuleClassifier } from '../classifier.js';
import { DEFAULT_POLICY, type FormPolicy } from '../policy.js';
import type { AnswerLlm } from '../llm.js';
import { ANY_CONTROL, adapterSpecById, adapterSpecFor, type AdapterSpec, type PortalId } from '../adapters.js';
import { applyReviewedValues, fillForm, fillFormSteps, recomputeReport, submitForm, type CoreDeps, type SubmitOutcome } from '../core.js';
import { sleep } from '../dom.js';
import type { AgentFile } from '../agent/protocol.js';
import type { AgentChannel } from './channel.js';
import { RemoteDriver } from './driver.js';

export interface RemoteApplyOptions {
  profile: MasterProfile;
  ctx?: AnswerContext;
  /** Force an ATS adapter instead of detecting it from the URL. */
  portal?: PortalId;
  policy?: FormPolicy;
  /** Model for open-ended questions (the app passes its ai-proxy FormAnswerClient); null disables it. */
  llm?: AnswerLlm | null;
  cache?: AnswerCache;
  /** Resume reference for upload fields (e.g. the stored resume's id); loadFile turns it into bytes. */
  resolveResume?: ResumeResolver;
  loadFile?: (ref: string) => Promise<AgentFile | null>;
  onEvent?: FormEngineListener;
  /** Stops the run before anything else is written. */
  signal?: AbortSignal;
  /** How long to wait for the first page (default 30 s). */
  loadTimeoutMs?: number;
}

export type RemoteApplyStatus =
  | 'ready'            // every required field resolved: review, then submit
  | 'needs_user'       // filled what it could; the review screen lists what is missing
  | 'login' | 'captcha' | 'email_verification'  // the candidate clears this in the WebView, then fills again
  | 'no_form' | 'cancelled' | 'error';

export interface RemoteReviewHandle {
  url: string;
  report: FillReport;
  driver: RemoteDriver;
  deps: CoreDeps;
}

export interface RemoteApplyResult {
  status: RemoteApplyStatus;
  url: string;
  report?: FillReport;
  needsUser: Array<{ label: string; reason: string; required: boolean }>;
  error?: string;
  /** Present when a form was filled: pass it to submitReviewed after the review. */
  handle?: RemoteReviewHandle;
}

function deps(opts: RemoteApplyOptions): CoreDeps {
  const answerer = new ProfileAnswerer({ policy: opts.policy || DEFAULT_POLICY, llm: opts.llm ?? null, cache: opts.cache, resolveResume: opts.resolveResume });
  return {
    classifier: new RuleClassifier(),
    answerer,
    maxRetries: 2,
    send: (ev: FormEngineEvent) => { try { opts.onEvent?.(ev); } catch { /* listener errors never stop a fill */ } },
  };
}

/** Bring the application form on screen (the ATS steps in adapters.ts, top frame only like desktop). Never submits. */
export async function openForm(channel: AgentChannel, spec: AdapterSpec, signal?: AbortSignal): Promise<void> {
  const top = () => channel.top()?.id;
  const anyVisible = async (selectors: string[]) => {
    const id = top();
    return id ? channel.call(id, 'anyVisible', { selectors }).catch(() => false) : false;
  };
  const step = async (selectors: string[], waitMs: number) => {
    const id = top();
    if (!id || signal?.aborted) return;
    const clicked = await channel.call(id, 'clickFirstVisible', { selectors }).catch(() => false);
    if (!clicked) return;
    await sleep(waitMs);
    await channel.waitForTop('interactive', 15_000);
  };
  const onForm = (spec.formUrl?.test(channel.url()) ?? false) || (await anyVisible(spec.formVisible));
  if (onForm && !spec.after && !spec.waitForForm) return;
  if (!onForm) {
    for (const s of spec.open) await step(s.selectors, s.waitMs);
    if (spec.settleAfterOpen) await channel.waitForTop('interactive', 15_000);
  }
  for (const s of spec.after || []) await step(s.selectors, s.waitMs);
  if (spec.waitForForm) {
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline && !signal?.aborted) {
      await channel.waitForTop('interactive', 3_000);
      if (await anyVisible(ANY_CONTROL)) return;
      await sleep(400);
    }
  }
}

/** Fill the application open in the WebView and hold it for review. */
export async function fillApplication(channel: AgentChannel, opts: RemoteApplyOptions): Promise<RemoteApplyResult> {
  const result = (status: RemoteApplyStatus, extra: Partial<RemoteApplyResult> = {}): RemoteApplyResult => ({ status, url: channel.url(), needsUser: [], ...extra });
  if (opts.signal?.aborted) return result('cancelled');
  if (!(await channel.waitForTop('interactive', opts.loadTimeoutMs ?? 30_000))) return result('error', { error: 'The page did not load. Check the connection and try again.' });

  try {
    const spec = opts.portal ? adapterSpecById(opts.portal) : adapterSpecFor(channel.url());
    await openForm(channel, spec, opts.signal);
    if (opts.signal?.aborted) return result('cancelled');

    const d = deps(opts);
    const driver = new RemoteDriver(channel, { loadFile: opts.loadFile });
    const fill = () => (spec.multiStep ? fillFormSteps(driver, d, opts.profile, { ctx: opts.ctx }) : fillForm(driver, d, opts.profile, opts.ctx));
    let report = await fill();
    // A form still loading reads as zero fields: settle and read once more.
    if (report.fields.length === 0 && !report.walls.length && !opts.signal?.aborted) {
      await channel.waitForTop('complete', 5_000);
      await sleep(1500);
      report = await fill();
    }
    if (opts.signal?.aborted) return result('cancelled', { report });

    const needsUser = report.fields
      .filter((o) => o.status === 'needs_user' || o.status === 'failed')
      .map((o) => ({ label: o.field.label, reason: o.reason || 'needs input', required: o.field.required }));
    const handle: RemoteReviewHandle = { url: channel.url(), report, driver, deps: d };
    for (const w of ['login', 'captcha', 'email_verification'] as const) {
      if (report.walls.includes(w)) return result(w, { report, needsUser, handle });
    }
    if (report.fields.length === 0) return result('no_form', { report });
    return result(report.readyToSubmit ? 'ready' : 'needs_user', { report, needsUser, handle });
  } catch (err) {
    return result('error', { error: (err as Error)?.message || String(err) });
  }
}

export interface ReviewedSubmitResult {
  submitted: boolean;
  confirmed: boolean;
  report: FillReport;
  outcome?: SubmitOutcome;
  error?: string;
}

/**
 * Submit after the candidate's review. `reviewed` must be true (the "I reviewed this" tick);
 * the candidate's edits (`overrides`, keyed by outcomeKey) are written first, then walls and
 * required fields are checked again on the live page. Refuses rather than guesses.
 */
export async function submitReviewed(handle: RemoteReviewHandle, overrides: Record<string, string>, opts: { reviewed: boolean; signal?: AbortSignal }): Promise<ReviewedSubmitResult> {
  const { report, driver, deps: d } = handle;
  const fail = (error: string): ReviewedSubmitResult => ({ submitted: false, confirmed: false, report, error });
  if (opts.reviewed !== true) return fail('Review the form and tick "I reviewed this" before submitting.');
  if (opts.signal?.aborted) return fail('Stopped. Nothing was submitted.');
  try {
    const { errors } = await applyReviewedValues(driver, report, overrides, d.send);
    report.walls = await driver.detectWalls().catch(() => report.walls);
    recomputeReport(report);
    if (report.walls.length) return fail(`Blocked by ${report.walls.join(', ')}; clear it in the page and try again.`);
    if (!report.readyToSubmit) {
      const missing = report.unresolvedRequired.map((o) => o.field.label).slice(0, 3).join('; ');
      return fail(`Required fields still need you: ${missing || 'unknown'}${errors.length ? ` (${errors.join(' | ')})` : ''}`);
    }
    if (opts.signal?.aborted) return fail('Stopped. Nothing was submitted.');
    const outcome = await submitForm(driver, d, report);
    if (!outcome.submitted) return { ...fail(outcome.reasons.join(' | ') || 'The portal did not accept the submission.'), outcome };
    return { submitted: true, confirmed: outcome.confirmed, report, outcome, error: outcome.confirmed ? undefined : outcome.reasons.join(' | ') || 'No confirmation was detected. Check the page.' };
  } catch (err) {
    return fail((err as Error)?.message || String(err));
  }
}

/**
 * New apply flow used by AutoApplyEngine.submitApplication:
 *   navigate -> adapter.prepare -> FormEngine.fill(Steps) -> review -> submit
 * Submission happens only when every required field is resolved and no wall
 * (login, CAPTCHA, email verification) is present.
 */
import type { Page } from 'playwright';
import { FormEngine, detectWalls, questionFingerprint, type FieldOutcome, type FillReport, type FormEngineEvent } from '../../form-engine/src/index.js';
import type { MasterProfile } from '../../form-engine/src/profile.js';
import { adapterById, adapterFor, genericAdapter, runPortalAdapter } from './bots/portal-adapter.js';
import { injectStealthScripts, handleCloudflareTurnstile } from './stealth-evasion.js';
import { enableFastRouteInterception } from './fast-route-interceptor.js';
import { runFastLocalNavMatcher } from './fast-nav-matcher.js';
import type { ApplyResult, AutoApplyEngine as AutoApplyEngineType, AutoApplyFormEvent, AutoApplyStatusEvent, ProgressCallback, ReviewHandle, SubmitApplicationOptions } from './auto-apply-engine.js';
import type { BrowserContext } from 'playwright';

/** Translate an engine event into the status-pill event the desktop already renders. */
export function toStatusEvent(ev: FormEngineEvent): AutoApplyStatusEvent {
  switch (ev.type) {
    case 'field_filled':
      return { phase: ev.kind === 'file' ? 'uploading' : 'filling', message: `Filled "${ev.label}"`, colorState: 'green', formEvent: ev };
    case 'needs_user':
      return { phase: 'user_input_required', message: ev.label ? `Needs you: ${ev.label} (${ev.reason})` : ev.reason, colorState: 'red', actionRequired: ev.reason, formEvent: ev };
    case 'error':
      return { phase: 'filling', message: ev.label ? `Could not fill "${ev.label}": ${ev.message}` : ev.message, colorState: 'red', formEvent: ev };
    default: {
      const phase = ev.phase === 'submitting' ? 'submitting' : ev.phase === 'submitted' ? 'success' : ev.phase === 'answering' ? 'answering' : 'filling';
      return { phase, message: ev.message, colorState: ev.phase === 'submitted' ? 'green' : 'grey', formEvent: ev };
    }
  }
}

export async function runFormEngineApply(
  Engine: typeof AutoApplyEngineType,
  context: BrowserContext,
  url: string,
  profile: MasterProfile,
  onProgress: ProgressCallback | undefined,
  options: SubmitApplicationOptions
): Promise<ApplyResult> {
  const fail = (error: string, extra: Partial<ApplyResult> = {}): ApplyResult => ({ url, success: false, submitted: false, prefilled: false, captchaDetected: false, fieldsFilledCount: 0, error, ...extra });
  if (!url || !url.trim()) return { ...fail('Invalid URL'), url: '' };
  try {
    let page: Page = await context.newPage();
    await injectStealthScripts(page);
    await enableFastRouteInterception(page);
    page.on('popup', async (popup) => {
      try {
        await injectStealthScripts(popup);
        await popup.waitForLoadState('domcontentloaded').catch(() => {});
        page = popup;
      } catch { /* popup closed */ }
    });
    const status = (ev: AutoApplyStatusEvent) => Engine.emitStatus(page, ev, onProgress);

    onProgress?.({ phase: 'navigating', message: `Opening: ${url}`, colorState: 'grey' });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.bringToFront().catch(() => {});

    // The demo shortcut always clicks submit, so it is never used when the caller holds the form for review.
    if (options.autoSubmit !== false && (url.includes('httpbin.org') || url.includes('nomadic-demo') || url.includes('test-job'))) {
      return await Engine.handleDemoTestApplication(page, profile, url, onProgress);
    }
    if ((await Engine.detect404OrExpiredPage(page)).is404) {
      await status({ phase: 'cancelled', message: 'Job Posting Closed or Not Found (404)', colorState: 'red', actionRequired: 'Job Expired' });
      return fail('Job posting closed or not found (404)');
    }
    if ((await Engine.detectWafOrAccessRestricted(page)).isBlocked) {
      await status({ phase: 'user_input_required', message: 'Access Restricted / Security Challenge — Please solve in browser', colorState: 'red', actionRequired: 'Verify Access' });
      if (!(await Engine.waitForWafUnblocked(page, onProgress))) return fail('Access restricted by portal security (left open in browser)', { captchaDetected: true });
    }
    const cf = await handleCloudflareTurnstile(page);
    if ((cf.detected && !cf.resolved) || (await Engine.detectCaptcha(page))) {
      await status({ phase: 'user_input_required', message: 'CAPTCHA Challenge Detected — Solve to proceed', colorState: 'red', actionRequired: 'Solve CAPTCHA' });
      return fail('CAPTCHA challenge detected (left open in browser)', { captchaDetected: true });
    }

    // From job description to the form.
    let adapter = options.portal ? adapterById(options.portal) : adapterFor(page.url());
    if (adapter === genericAdapter && !options.portal) {
      const nav = await runFastLocalNavMatcher(page, profile.desiredTitle).catch(() => null);
      if (nav?.triggered) {
        await page.waitForTimeout(400);
        const pages = context.pages();
        const latest = pages[pages.length - 1];
        if (latest && latest !== page && !latest.isClosed()) page = latest;
        await page.waitForLoadState('domcontentloaded').catch(() => {});
        adapter = adapterFor(page.url());
      }
    }

    const login = await Engine.detectLoginRequired(page);
    if (login.requiresLogin) {
      const portal = login.portalName || 'Job Portal';
      await status({ phase: 'user_input_required', message: `Account Required — Please sign in / register on ${portal}`, colorState: 'red', actionRequired: `Sign in to ${portal}` });
      await page.bringToFront().catch(() => {});
      if (!(await Engine.waitForLoginComplete(page, onProgress))) return fail(`Sign-in required on ${portal} (left open in browser)`, { requiresLogin: true });
    }

    await status({ phase: 'filling', message: `Filling application (${adapter.id})...`, colorState: 'grey' });
    const engine = new FormEngine({
      llm: Engine.llm,
      onEvent: (ev) => {
        Engine.formEvents.emit('event', { url, event: ev } satisfies AutoApplyFormEvent);
        if (ev.type !== 'status' || ev.phase === 'done') onProgress?.(toStatusEvent(ev));
      },
    });
    const { report } = await runPortalAdapter(page, profile, adapter, { engine, ctx: { jobTitle: options.jobTitle || profile.desiredTitle, company: options.company } });
    const needsUser = report.fields
      .filter((o) => o.status === 'needs_user' || o.status === 'failed')
      .map((o) => ({ label: o.field.label, reason: o.reason || 'needs input', required: o.field.required }));
    const base = { url, captchaDetected: false, fieldsFilledCount: report.filled, report, needsUser };

    if (report.walls.includes('login')) {
      await status({ phase: 'user_input_required', message: 'Sign-in required — complete it in the browser', colorState: 'red', actionRequired: 'Sign in', report });
      return { ...base, success: false, submitted: false, prefilled: report.filled > 0, requiresLogin: true, error: 'Sign-in required (left open in browser)' };
    }
    if (report.walls.includes('captcha')) {
      await status({ phase: 'user_input_required', message: 'CAPTCHA Challenge Detected — Solve to proceed', colorState: 'red', actionRequired: 'Solve CAPTCHA', report });
      return { ...base, success: false, submitted: false, prefilled: report.filled > 0, captchaDetected: true, error: 'CAPTCHA challenge detected (left open in browser)' };
    }
    if (report.fields.length === 0) {
      await status({ phase: 'cancelled', message: 'No Application Form Found on Portal', colorState: 'red', actionRequired: 'Review Portal Manually', report });
      return fail('No application form inputs found on page', { report });
    }

    if (options.autoSubmit !== false && report.readyToSubmit) {
      const outcome = await engine.submit(page, report);
      const confirmed = outcome.confirmed || (await Engine.isPageConfirmedSubmission(page, report.filled));
      if (outcome.submitted) {
        await status(confirmed
          ? { phase: 'success', message: 'Confirmed Application Submitted Successfully!', colorState: 'green', report }
          : { phase: 'user_input_required', message: 'Submitted, but no confirmation was detected — please check the page', colorState: 'red', actionRequired: 'Check submission', report });
        return { ...base, success: true, submitted: true, prefilled: true, error: confirmed ? undefined : outcome.reasons.join(' | ') || 'no confirmation detected' };
      }
    }

    if (options.autoSubmit === false) options.onReadyForReview?.({ url, page, engine, report });

    const pending = report.unresolvedRequired.length;
    await status({
      phase: 'user_input_required',
      message: pending ? `Pre-filled ${report.filled} fields — ${pending} required field(s) need you` : `Pre-filled ${report.filled} fields — Ready for 1-Click Review & Submit`,
      colorState: pending ? 'red' : 'green',
      actionRequired: pending ? report.unresolvedRequired.map((o) => o.field.label).slice(0, 3).join('; ') : 'Review Form & Click Submit',
      report,
    });
    return { ...base, success: report.filled > 0, submitted: false, prefilled: report.filled > 0 };
  } catch (err: any) {
    onProgress?.({ phase: 'cancelled', message: `Notice: ${err?.message}`, colorState: 'grey' });
    return fail(err?.message || String(err));
  }
}

/** Stable key of a filled question: the answer fingerprint, or one computed from label, kind and options. */
export function outcomeKey(o: FieldOutcome): string {
  return o.answer && 'fingerprint' in o.answer && o.answer.fingerprint ? o.answer.fingerprint : questionFingerprint(o.field);
}

function recomputeReport(report: FillReport): void {
  report.filled = report.fields.filter((o) => o.status === 'filled').length;
  report.needsUser = report.fields.filter((o) => o.status === 'needs_user').length;
  report.failed = report.fields.filter((o) => o.status === 'failed').length;
  report.skipped = report.fields.filter((o) => o.status === 'skipped').length;
  report.unresolvedRequired = report.fields.filter((o) => o.field.required && (o.status === 'needs_user' || o.status === 'failed'));
  report.readyToSubmit = !report.walls.length && !report.unresolvedRequired.length && report.fields.length > 0;
}

/**
 * Write the values the candidate set during review into the held form (keyed by `outcomeKey`).
 * Unchanged values are left alone; file fields are never rewritten. Mutates and returns `report`.
 */
export async function writeReviewedValues(
  page: Page,
  engine: Pick<FormEngine, 'writers' | 'emit'>,
  report: FillReport,
  overrides: Record<string, string>
): Promise<{ report: FillReport; written: number; errors: string[] }> {
  let written = 0;
  const errors: string[] = [];
  for (const o of report.fields) {
    const value = overrides[outcomeKey(o)];
    if (value === undefined || o.field.kind === 'file') continue;
    const current = o.answer?.status === 'answered' ? o.answer.value : undefined;
    if (o.status === 'filled' && current === value) continue;
    const writer = engine.writers.get(o.field.kind);
    if (!writer) {
      o.status = 'failed';
      o.reason = `no writer for ${o.field.kind}`;
      errors.push(`${o.field.label}: ${o.reason}`);
      continue;
    }
    const answer = {
      fieldId: o.field.id,
      status: 'answered' as const,
      value,
      values: o.field.multiple ? value.split('|').filter(Boolean) : undefined,
      source: 'custom' as const,
      fingerprint: outcomeKey(o),
    };
    let write;
    try {
      write = await writer.write(page, o.field, answer);
    } catch (err) {
      write = { fieldId: o.field.id, ok: false, error: (err as Error).message };
    }
    o.answer = answer;
    o.write = write;
    o.attempts += 1;
    if (write.ok) {
      o.status = 'filled';
      o.reason = undefined;
      written++;
      engine.emit('event', { type: 'field_filled', fieldId: o.field.id, label: o.field.label, kind: o.field.kind, value, source: 'custom', attempt: o.attempts } satisfies FormEngineEvent);
    } else {
      o.status = o.field.required ? 'failed' : 'needs_user';
      o.reason = write.error || 'write failed';
      errors.push(`${o.field.label}: ${o.reason}`);
    }
  }
  recomputeReport(report);
  return { report, written, errors };
}

/**
 * Submit a form that was filled with `autoSubmit: false` and reviewed by the candidate:
 * write the reviewed values into the same tab, re-check walls, then submit through the engine
 * (which still refuses while required fields are unresolved).
 */
export async function submitReviewedApplication(
  Engine: typeof AutoApplyEngineType,
  handle: ReviewHandle,
  overrides: Record<string, string>,
  onProgress?: ProgressCallback
): Promise<ApplyResult> {
  const { url, page, engine, report } = handle;
  const fail = (error: string): ApplyResult => ({ url, success: false, submitted: false, prefilled: true, captchaDetected: false, fieldsFilledCount: report.filled, error, report });
  try {
    if (page.isClosed()) return fail('The application tab was closed before submitting. Retry to fill it again.');
    const { errors } = await writeReviewedValues(page, engine, report, overrides);
    report.walls = await detectWalls(page).catch(() => report.walls);
    recomputeReport(report);
    if (report.walls.length) return fail(`Blocked by ${report.walls.join(', ')}; resolve it in the browser and retry.`);
    if (!report.readyToSubmit) {
      const missing = report.unresolvedRequired.map((o) => o.field.label).slice(0, 3).join('; ');
      return fail(`Required fields still need you: ${missing || 'unknown'}${errors.length ? ` (${errors.join(' | ')})` : ''}`);
    }
    const outcome = await engine.submit(page, report);
    if (!outcome.submitted) return fail(outcome.reasons.join(' | ') || 'The portal did not accept the submission.');
    const confirmed = outcome.confirmed || (await Engine.isPageConfirmedSubmission(page, report.filled));
    await Engine.emitStatus(page, confirmed
      ? { phase: 'success', message: 'Application submitted', colorState: 'green' }
      : { phase: 'user_input_required', message: 'Submitted, but no confirmation was detected. Check the page.', colorState: 'red', actionRequired: 'Check submission' }, onProgress);
    return { url, success: true, submitted: true, prefilled: true, captchaDetected: false, fieldsFilledCount: report.filled, report, error: confirmed ? undefined : outcome.reasons.join(' | ') || 'no confirmation detected' };
  } catch (err: any) {
    return fail(err?.message || String(err));
  }
}

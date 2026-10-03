/**
 * FormEngine: reader -> classifier -> answerer -> writers -> verifier.
 *
 * `fill()` never submits. `submit()` is a separate, explicit step that refuses to
 * run while required fields are unresolved, walls are present, or the page shows
 * validation errors.
 */
import { EventEmitter } from 'events';
import type { Page } from 'playwright';
import type {
  Answer, AnswerContext, Answerer, Classification, FieldClassifier, FieldKind, FieldOutcome, FieldWriter,
  FillReport, FormEngineEvent, FormEngineListener, FormField, FormReader, Verifier,
} from './contracts.js';
import type { MasterProfile } from './profile.js';
import { DomFormReader } from './reader.js';
import { RuleClassifier } from './classifier.js';
import { ProfileAnswerer, type AnswerCache } from './answerer.js';
import { defaultWriters } from './writers/index.js';
import { DomVerifier, pageErrors } from './verifier.js';
import { detectWalls } from './walls.js';
import { DEFAULT_POLICY, type FormPolicy } from './policy.js';
import type { LlmClient } from './llm.js';
import { prepareFrame, sleep } from './dom.js';

export interface FormEngineOptions {
  reader?: FormReader;
  classifier?: FieldClassifier;
  answerer?: Answerer;
  writers?: Map<FieldKind, FieldWriter>;
  verifier?: Verifier;
  policy?: FormPolicy;
  /** LLM for open-ended questions; undefined = Groq when profile.groqApiKey is set; null = disabled. */
  llm?: LlmClient | null;
  cache?: AnswerCache;
  onEvent?: FormEngineListener;
  /** Retries for fields that fail verification (default 2). */
  maxRetries?: number;
  resumeDir?: string;
}

export interface SubmitOutcome {
  submitted: boolean;
  blocked: boolean;
  confirmed: boolean;
  reasons: string[];
}

const TEXTLIKE: FieldKind[] = ['text', 'textarea', 'date', 'select', 'combobox', 'richtext'];

export class FormEngine extends EventEmitter {
  readonly reader: FormReader;
  readonly classifier: FieldClassifier;
  readonly answerer: Answerer;
  readonly writers: Map<FieldKind, FieldWriter>;
  readonly verifier: Verifier;
  private readonly maxRetries: number;

  constructor(private readonly opts: FormEngineOptions = {}) {
    super();
    this.reader = opts.reader || new DomFormReader();
    this.classifier = opts.classifier || new RuleClassifier();
    this.answerer = opts.answerer || new ProfileAnswerer({ policy: opts.policy || DEFAULT_POLICY, llm: opts.llm, cache: opts.cache, resumeDir: opts.resumeDir });
    this.writers = opts.writers || defaultWriters();
    this.verifier = opts.verifier || new DomVerifier();
    this.maxRetries = opts.maxRetries ?? 2;
    if (opts.onEvent) this.on('event', opts.onEvent);
  }

  private send(ev: FormEngineEvent): void {
    this.emit('event', ev);
    // 'error' on an EventEmitter throws without a listener; only emit the typed channel when someone listens.
    if (ev.type !== 'error' || this.listenerCount('error') > 0) this.emit(ev.type, ev);
  }

  /** Fill every visible field it can answer. Never clicks submit. */
  async fill(page: Page, profile: MasterProfile, ctx: AnswerContext = {}): Promise<FillReport> {
    const t0 = Date.now();
    const startedAt = new Date(t0).toISOString();
    const walls = await detectWalls(page);
    for (const w of walls) this.send({ type: 'needs_user', reason: wallReason(w), wall: w });

    this.send({ type: 'status', phase: 'reading', message: 'Reading form fields' });
    let fields = (await this.reader.read(page)).filter((f) => f.visible && !f.disabled);
    if (walls.includes('login')) fields = fields.filter((f) => f.inputType !== 'password');

    this.send({ type: 'status', phase: 'classifying', message: `Classifying ${fields.length} fields` });
    const classes = this.classifier.classify(fields);
    const classById = new Map(classes.map((c) => [c.fieldId, c]));

    this.send({ type: 'status', phase: 'answering', message: 'Resolving answers' });
    const { answers, llmCalls } = await this.answerer.answer(fields, classes, profile, ctx);
    const answerById = new Map(answers.map((a) => [a.fieldId, a]));

    this.send({ type: 'status', phase: 'writing', message: 'Filling fields' });
    const outcomes: FieldOutcome[] = [];
    for (const field of fields) {
      const classification = classById.get(field.id);
      const answer = answerById.get(field.id);
      outcomes.push(await this.writeOne(page, field, classification, answer, 1));
    }

    // Verify, retry failed fields only.
    this.send({ type: 'status', phase: 'verifying', message: 'Verifying values' });
    let verify = await this.verifier.verify(page, outcomes);
    for (let round = 1; round <= this.maxRetries; round++) {
      const retryIds = new Set(verify.issues.filter((i) => i.kind !== 'required_empty').map((i) => i.fieldId));
      const retryable = outcomes.filter((o) => (retryIds.has(o.field.id) || o.status === 'failed') && o.answer?.status === 'answered');
      if (!retryable.length) break;
      for (const o of retryable) {
        const next = await this.writeOne(page, o.field, o.classification, o.answer, o.attempts + 1);
        Object.assign(o, next);
      }
      verify = await this.verifier.verify(page, outcomes);
    }
    for (const issue of verify.issues) {
      const o = outcomes.find((x) => x.field.id === issue.fieldId);
      if (!o) continue;
      if (issue.kind !== 'required_empty' && o.status === 'filled') {
        o.status = 'failed';
        o.reason = issue.message;
        this.send({ type: 'error', fieldId: o.field.id, label: o.field.label, message: `Verification failed: ${issue.message}` });
      }
    }

    const unresolvedRequired = outcomes.filter((o) => o.field.required && (o.status === 'needs_user' || o.status === 'failed'));
    for (const o of unresolvedRequired) {
      if (o.status === 'failed') this.send({ type: 'needs_user', fieldId: o.field.id, label: o.field.label, reason: o.reason || 'Could not fill this required field', required: true });
    }
    const report: FillReport = {
      url: page.url(),
      startedAt,
      durationMs: Date.now() - t0,
      fields: outcomes,
      filled: outcomes.filter((o) => o.status === 'filled').length,
      needsUser: outcomes.filter((o) => o.status === 'needs_user').length,
      failed: outcomes.filter((o) => o.status === 'failed').length,
      skipped: outcomes.filter((o) => o.status === 'skipped').length,
      unresolvedRequired,
      pageErrors: verify.pageErrors,
      llmCalls,
      walls,
      readyToSubmit: false,
    };
    report.readyToSubmit = !walls.length && !unresolvedRequired.length && fields.length > 0;
    this.send({ type: 'status', phase: 'done', message: `Filled ${report.filled}/${fields.length}; ${unresolvedRequired.length} required need you` });
    return report;
  }

  private async writeOne(page: Page, field: FormField, classification: Classification | undefined, answer: Answer | undefined, attempt: number): Promise<FieldOutcome> {
    const base = { field, classification, answer, attempts: attempt };
    if (!answer) return { ...base, status: 'skipped', reason: 'no answer' };
    if (answer.status === 'skip') return { ...base, status: 'skipped', reason: answer.reason };
    if (answer.status === 'needs_user') {
      if (field.currentValue && field.currentValue !== 'false' && TEXTLIKE.includes(field.kind)) return { ...base, status: 'skipped', reason: 'already filled on the page' };
      if (attempt === 1) this.send({ type: 'needs_user', fieldId: field.id, label: field.label, reason: answer.reason, required: field.required });
      return { ...base, status: 'needs_user', reason: answer.reason };
    }
    if (attempt === 1 && field.currentValue && TEXTLIKE.includes(field.kind) && answer.source !== 'policy') {
      return { ...base, status: 'skipped', reason: 'already filled on the page' };
    }
    const writer = this.writers.get(field.kind);
    if (!writer) return { ...base, status: 'failed', reason: `no writer for ${field.kind}` };
    let write;
    try {
      write = await writer.write(page, field, answer);
    } catch (err) {
      write = { fieldId: field.id, ok: false, error: (err as Error).message };
    }
    if (write.ok) {
      this.send({ type: 'field_filled', fieldId: field.id, label: field.label, kind: field.kind, value: field.kind === 'file' ? answer.value.split(/[\\/]/).pop() || 'file' : answer.value, source: answer.source, attempt });
      return { ...base, write, status: 'filled' };
    }
    if (attempt === 1) this.send({ type: 'error', fieldId: field.id, label: field.label, message: write.error || 'write failed' });
    // A choice we cannot match is a question for the user, not an engine failure.
    if (/no option matches|not a calendar date|file not found/.test(write.error || '')) {
      return { ...base, write, status: 'needs_user', reason: write.error };
    }
    return { ...base, write, status: 'failed', reason: write.error };
  }

  /**
   * Fill a multi-step flow: fill the current step, click "Next / Continue", repeat.
   * Stops at walls, at the final step (no next button), or after `maxSteps`.
   */
  async fillSteps(page: Page, profile: MasterProfile, opts: { ctx?: AnswerContext; maxSteps?: number } = {}): Promise<FillReport> {
    const reports: FillReport[] = [];
    const max = opts.maxSteps ?? 8;
    for (let step = 0; step < max; step++) {
      const r = await this.fill(page, profile, opts.ctx);
      reports.push(r);
      if (r.walls.length) break;
      const advanced = await clickNext(page);
      if (!advanced) break;
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await sleep(250);
    }
    return mergeReports(reports);
  }

  /** Explicit submission. Blocked while required fields are unresolved. */
  async submit(page: Page, report: FillReport, opts: { force?: boolean } = {}): Promise<SubmitOutcome> {
    const reasons: string[] = [];
    if (report.walls.length) reasons.push(`walls: ${report.walls.join(', ')}`);
    if (report.unresolvedRequired.length) reasons.push(`${report.unresolvedRequired.length} required field(s) unresolved: ${report.unresolvedRequired.map((o) => o.field.label).slice(0, 5).join('; ')}`);
    // Re-check the live page for empty required fields the report may not know about.
    const live = await this.verifier.verify(page, report.fields);
    const liveRequired = live.issues.filter((i) => i.kind === 'required_empty');
    if (liveRequired.length && !report.unresolvedRequired.length) reasons.push(`${liveRequired.length} required field(s) empty on the page`);
    if (reasons.length && !opts.force) {
      this.send({ type: 'needs_user', reason: `Submit blocked: ${reasons.join(' | ')}` });
      return { submitted: false, blocked: true, confirmed: false, reasons };
    }
    this.send({ type: 'status', phase: 'submitting', message: 'Submitting application' });
    const clicked = await clickSubmit(page);
    if (!clicked) return { submitted: false, blocked: false, confirmed: false, reasons: ['submit button not found'] };
    await sleep(1200);
    const confirmed = await isConfirmation(page);
    const errors = await pageErrors(page);
    if (confirmed) this.send({ type: 'status', phase: 'submitted', message: 'Application submitted' });
    else if (errors.length) this.send({ type: 'error', message: `Portal rejected the submission: ${errors.slice(0, 3).join(' | ')}` });
    return { submitted: true, blocked: false, confirmed, reasons: errors };
  }
}

function wallReason(w: string): string {
  return w === 'login' ? 'Sign-in or account creation required' : w === 'captcha' ? 'CAPTCHA must be solved' : 'Email verification required';
}

export function mergeReports(reports: FillReport[]): FillReport {
  if (reports.length === 1) return reports[0];
  const fields = reports.flatMap((r) => r.fields);
  const last = reports[reports.length - 1];
  const unresolvedRequired = reports.flatMap((r) => r.unresolvedRequired);
  const walls = [...new Set(reports.flatMap((r) => r.walls))];
  return {
    url: last.url,
    startedAt: reports[0].startedAt,
    durationMs: reports.reduce((n, r) => n + r.durationMs, 0),
    fields,
    filled: fields.filter((o) => o.status === 'filled').length,
    needsUser: fields.filter((o) => o.status === 'needs_user').length,
    failed: fields.filter((o) => o.status === 'failed').length,
    skipped: fields.filter((o) => o.status === 'skipped').length,
    unresolvedRequired,
    pageErrors: last.pageErrors,
    llmCalls: reports.reduce((n, r) => n + r.llmCalls, 0),
    walls,
    readyToSubmit: !walls.length && !unresolvedRequired.length && last.fields.length >= 0,
  };
}

const NEXT_RX = /^(next|continue|save (and|&) continue|proceed|next step)$/i;
const SUBMIT_RX = /^(submit|submit application|submit your application|send application|apply|apply now|complete application)$/i;

async function clickButtonMatching(page: Page, rx: RegExp, preferSubmitType: boolean): Promise<boolean> {
  for (const frame of page.frames()) {
    await prepareFrame(frame);
    const handle = await frame.evaluateHandle(({ src, preferSubmit }) => {
      const re = new RegExp(src, 'i');
      const vis = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0 && !(el as HTMLButtonElement).disabled; };
      const cands = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"]')).filter(vis);
      const text = (el: Element) => ((el as HTMLInputElement).value && el.tagName === 'INPUT' ? (el as HTMLInputElement).value : el.textContent || '').replace(/\s+/g, ' ').trim();
      // Score candidates: a matching button inside a form that holds inputs beats an
      // "Apply now" call-to-action elsewhere on the page.
      const score = (c: Element): number => {
        const t = text(c);
        if (/next|continue|back|cancel|save draft/i.test(t) && preferSubmit) return -1;
        let s = 0;
        if (re.test(t)) s += /submit|send|complete/i.test(t) || !preferSubmit ? 4 : 2;
        const form = c.closest('form');
        if (form && form.querySelector('input:not([type="hidden"]), textarea, select')) s += 2;
        if ((c as HTMLButtonElement).type === 'submit' && preferSubmit) s += 1;
        return s;
      };
      const ranked = cands.map((c) => ({ c, s: score(c) })).filter((x) => x.s >= (preferSubmit ? 3 : 4)).sort((a, b) => b.s - a.s);
      return ranked[0]?.c || null;
    }, { src: rx.source, preferSubmit: preferSubmitType }).catch(() => null);
    const el = handle?.asElement();
    if (el) {
      await el.click({ timeout: 2000 }).catch(() => el.evaluate((n: Element) => (n as HTMLElement).click()));
      return true;
    }
  }
  return false;
}

export function clickNext(page: Page): Promise<boolean> {
  return clickButtonMatching(page, NEXT_RX, false);
}

export function clickSubmit(page: Page): Promise<boolean> {
  return clickButtonMatching(page, SUBMIT_RX, true);
}

export async function isConfirmation(page: Page): Promise<boolean> {
  for (const frame of page.frames()) {
    const ok = await frame.evaluate(() => {
      const t = (document.body?.innerText || '').toLowerCase();
      return /thank you for (applying|your application)|application (has been )?(submitted|received)|we have received your application|successfully submitted|applied successfully/.test(t);
    }).catch(() => false);
    if (ok) return true;
  }
  return false;
}

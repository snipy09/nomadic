/**
 * The engine's orchestration, independent of how the page is reached:
 *
 *   walls -> read -> classify -> answer -> write -> verify (+ retries) -> report
 *   submit: refuses while walls, unresolved required fields or empty required fields remain.
 *
 * A FormDriver does the page work. Desktop uses a Playwright driver (engine.ts); the Android
 * app uses a driver that talks to the in-page agent inside its WebView (remote/driver.ts).
 * Both run exactly this code, so the review gate and submit rules are the same everywhere.
 */
import type {
  Answer, AnswerContext, Answerer, Classification, FieldClassifier, FieldKind, FieldOutcome,
  FillReport, FormEngineEvent, FormField, VerifyIssue, WriteResult,
} from './contracts.js';
import type { MasterProfile } from './profile.js';
import type { Wall } from './walls.js';
import { sleep } from './dom.js';
import { questionFingerprint } from './answerer.js';

export type Answered = Extract<Answer, { status: 'answered' }>;

export interface FormDriver {
  url(): string;
  detectWalls(): Promise<Wall[]>;
  /** Every field on the page (all frames). */
  read(): Promise<FormField[]>;
  canWrite(kind: FieldKind): boolean;
  /** Write one answer and read it back. */
  write(field: FormField, answer: Answered): Promise<WriteResult>;
  verify(outcomes: FieldOutcome[]): Promise<{ issues: VerifyIssue[]; pageErrors: string[] }>;
  clickNext(): Promise<boolean>;
  clickSubmit(): Promise<boolean>;
  isConfirmation(): Promise<boolean>;
  pageErrors(): Promise<string[]>;
  /** After a "Next" click: wait until the next step is on screen. */
  settle(): Promise<void>;
}

export interface CoreDeps {
  classifier: FieldClassifier;
  answerer: Answerer;
  maxRetries: number;
  send(ev: FormEngineEvent): void;
}

export interface SubmitOutcome {
  submitted: boolean;
  blocked: boolean;
  confirmed: boolean;
  reasons: string[];
}

/** "Next" and "Submit" button texts (desktop and Android). */
export const NEXT_RX = /^(next|continue|save (and|&) continue|proceed|next step)$/i;
export const SUBMIT_RX = /^(submit|submit application|submit your application|send application|apply|apply now|complete application)$/i;

const TEXTLIKE: FieldKind[] = ['text', 'textarea', 'date', 'select', 'combobox', 'richtext'];

export function wallReason(w: string): string {
  return w === 'login' ? 'Sign-in or account creation required' : w === 'captcha' ? 'CAPTCHA must be solved' : 'Email verification required';
}

/** Fill every visible field it can answer. Never clicks submit. */
export async function fillForm(d: FormDriver, deps: CoreDeps, profile: MasterProfile, ctx: AnswerContext = {}): Promise<FillReport> {
  const { send } = deps;
  const t0 = Date.now();
  const startedAt = new Date(t0).toISOString();
  const walls = await d.detectWalls();
  for (const w of walls) send({ type: 'needs_user', reason: wallReason(w), wall: w });

  send({ type: 'status', phase: 'reading', message: 'Reading form fields' });
  let fields = (await d.read()).filter((f) => f.visible && !f.disabled);
  if (walls.includes('login')) fields = fields.filter((f) => f.inputType !== 'password');

  send({ type: 'status', phase: 'classifying', message: `Classifying ${fields.length} fields` });
  const classes = deps.classifier.classify(fields);
  const classById = new Map(classes.map((c) => [c.fieldId, c]));

  send({ type: 'status', phase: 'answering', message: 'Resolving answers' });
  const { answers, llmCalls } = await deps.answerer.answer(fields, classes, profile, ctx);
  const answerById = new Map(answers.map((a) => [a.fieldId, a]));

  send({ type: 'status', phase: 'writing', message: 'Filling fields' });
  const outcomes: FieldOutcome[] = [];
  for (const field of fields) {
    outcomes.push(await writeOne(d, deps, field, classById.get(field.id), answerById.get(field.id), 1));
  }

  // Verify, retry failed fields only.
  send({ type: 'status', phase: 'verifying', message: 'Verifying values' });
  let verify = await d.verify(outcomes);
  for (let round = 1; round <= deps.maxRetries; round++) {
    const retryIds = new Set(verify.issues.filter((i) => i.kind !== 'required_empty').map((i) => i.fieldId));
    const retryable = outcomes.filter((o) => (retryIds.has(o.field.id) || o.status === 'failed') && o.answer?.status === 'answered');
    if (!retryable.length) break;
    for (const o of retryable) {
      const next = await writeOne(d, deps, o.field, o.classification, o.answer, o.attempts + 1);
      Object.assign(o, next);
    }
    verify = await d.verify(outcomes);
  }
  for (const issue of verify.issues) {
    const o = outcomes.find((x) => x.field.id === issue.fieldId);
    if (!o) continue;
    if (issue.kind !== 'required_empty' && o.status === 'filled') {
      o.status = 'failed';
      o.reason = issue.message;
      send({ type: 'error', fieldId: o.field.id, label: o.field.label, message: `Verification failed: ${issue.message}` });
    }
  }

  const unresolvedRequired = outcomes.filter((o) => o.field.required && (o.status === 'needs_user' || o.status === 'failed'));
  for (const o of unresolvedRequired) {
    if (o.status === 'failed') send({ type: 'needs_user', fieldId: o.field.id, label: o.field.label, reason: o.reason || 'Could not fill this required field', required: true });
  }
  const report: FillReport = {
    url: d.url(),
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
  send({ type: 'status', phase: 'done', message: `Filled ${report.filled}/${fields.length}; ${unresolvedRequired.length} required need you` });
  return report;
}

async function writeOne(d: FormDriver, deps: CoreDeps, field: FormField, classification: Classification | undefined, answer: Answer | undefined, attempt: number): Promise<FieldOutcome> {
  const { send } = deps;
  const base = { field, classification, answer, attempts: attempt };
  if (!answer) return { ...base, status: 'skipped', reason: 'no answer' };
  if (answer.status === 'skip') return { ...base, status: 'skipped', reason: answer.reason };
  if (answer.status === 'needs_user') {
    if (field.currentValue && field.currentValue !== 'false' && TEXTLIKE.includes(field.kind)) return { ...base, status: 'skipped', reason: 'already filled on the page' };
    if (attempt === 1) send({ type: 'needs_user', fieldId: field.id, label: field.label, reason: answer.reason, required: field.required });
    return { ...base, status: 'needs_user', reason: answer.reason };
  }
  if (attempt === 1 && field.currentValue && TEXTLIKE.includes(field.kind) && answer.source !== 'policy') {
    return { ...base, status: 'skipped', reason: 'already filled on the page' };
  }
  if (!d.canWrite(field.kind)) return { ...base, status: 'failed', reason: `no writer for ${field.kind}` };
  let write: WriteResult;
  try {
    write = await d.write(field, answer);
  } catch (err) {
    write = { fieldId: field.id, ok: false, error: (err as Error).message };
  }
  if (write.ok) {
    send({ type: 'field_filled', fieldId: field.id, label: field.label, kind: field.kind, value: field.kind === 'file' ? answer.value.split(/[\\/]/).pop() || 'file' : answer.value, source: answer.source, attempt });
    return { ...base, write, status: 'filled' };
  }
  if (attempt === 1) send({ type: 'error', fieldId: field.id, label: field.label, message: write.error || 'write failed' });
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
export async function fillFormSteps(d: FormDriver, deps: CoreDeps, profile: MasterProfile, opts: { ctx?: AnswerContext; maxSteps?: number } = {}): Promise<FillReport> {
  const reports: FillReport[] = [];
  const max = opts.maxSteps ?? 8;
  for (let step = 0; step < max; step++) {
    const r = await fillForm(d, deps, profile, opts.ctx);
    reports.push(r);
    if (r.walls.length) break;
    const advanced = await d.clickNext();
    if (!advanced) break;
    await d.settle();
  }
  return mergeReports(reports);
}

/** Explicit submission. Blocked while required fields are unresolved. */
export async function submitForm(d: FormDriver, deps: CoreDeps, report: FillReport, opts: { force?: boolean } = {}): Promise<SubmitOutcome> {
  const { send } = deps;
  const reasons: string[] = [];
  if (report.walls.length) reasons.push(`walls: ${report.walls.join(', ')}`);
  if (report.unresolvedRequired.length) reasons.push(`${report.unresolvedRequired.length} required field(s) unresolved: ${report.unresolvedRequired.map((o) => o.field.label).slice(0, 5).join('; ')}`);
  // Re-check the live page for empty required fields the report may not know about.
  const live = await d.verify(report.fields);
  const liveRequired = live.issues.filter((i) => i.kind === 'required_empty');
  if (liveRequired.length && !report.unresolvedRequired.length) reasons.push(`${liveRequired.length} required field(s) empty on the page`);
  if (reasons.length && !opts.force) {
    send({ type: 'needs_user', reason: `Submit blocked: ${reasons.join(' | ')}` });
    return { submitted: false, blocked: true, confirmed: false, reasons };
  }
  send({ type: 'status', phase: 'submitting', message: 'Submitting application' });
  const clicked = await d.clickSubmit();
  if (!clicked) return { submitted: false, blocked: false, confirmed: false, reasons: ['submit button not found'] };
  await sleep(1200);
  const confirmed = await d.isConfirmation();
  const errors = await d.pageErrors();
  if (confirmed) send({ type: 'status', phase: 'submitted', message: 'Application submitted' });
  else if (errors.length) send({ type: 'error', message: `Portal rejected the submission: ${errors.slice(0, 3).join(' | ')}` });
  return { submitted: true, blocked: false, confirmed, reasons: errors };
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

/** Recount a report after fields changed (review edits). */
export function recomputeReport(report: FillReport): void {
  report.filled = report.fields.filter((o) => o.status === 'filled').length;
  report.needsUser = report.fields.filter((o) => o.status === 'needs_user').length;
  report.failed = report.fields.filter((o) => o.status === 'failed').length;
  report.skipped = report.fields.filter((o) => o.status === 'skipped').length;
  report.unresolvedRequired = report.fields.filter((o) => o.field.required && (o.status === 'needs_user' || o.status === 'failed'));
  report.readyToSubmit = !report.walls.length && !report.unresolvedRequired.length && report.fields.length > 0;
}

/** Stable key of a filled question: the answer fingerprint, or one computed from label, kind and options. */
export function outcomeKey(o: FieldOutcome): string {
  return o.answer && 'fingerprint' in o.answer && o.answer.fingerprint ? o.answer.fingerprint : questionFingerprint(o.field);
}

/**
 * Write the values the candidate set during review into the held form (keyed by `outcomeKey`).
 * Unchanged values are left alone; file fields are never rewritten. Mutates and returns `report`.
 */
export async function applyReviewedValues(
  d: Pick<FormDriver, 'canWrite' | 'write'>,
  report: FillReport,
  overrides: Record<string, string>,
  send: (ev: FormEngineEvent) => void,
): Promise<{ report: FillReport; written: number; errors: string[] }> {
  let written = 0;
  const errors: string[] = [];
  for (const o of report.fields) {
    const value = overrides[outcomeKey(o)];
    if (value === undefined || o.field.kind === 'file') continue;
    const current = o.answer?.status === 'answered' ? o.answer.value : undefined;
    if (o.status === 'filled' && current === value) continue;
    if (!d.canWrite(o.field.kind)) {
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
    let write: WriteResult;
    try {
      write = await d.write(o.field, answer);
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
      send({ type: 'field_filled', fieldId: o.field.id, label: o.field.label, kind: o.field.kind, value, source: 'custom', attempt: o.attempts });
    } else {
      o.status = o.field.required ? 'failed' : 'needs_user';
      o.reason = write.error || 'write failed';
      errors.push(`${o.field.label}: ${o.reason}`);
    }
  }
  recomputeReport(report);
  return { report, written, errors };
}

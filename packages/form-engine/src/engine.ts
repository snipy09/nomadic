import type { Page } from 'playwright';
import { answerField, type Answer } from './answerer.js';
import { classifyField } from './classifier.js';
import { readForm } from './reader.js';
import type { FieldOutcome, FillReport, FormField, FormProfile, UnknownAnswerer } from './types.js';
import { writeField } from './writer.js';

export interface FillOptions {
  /** Called for questions the rules can't answer. Must return null when unsure (never invent facts). */
  unknownAnswerer?: UnknownAnswerer;
  onProgress?: (event: { type: 'field_filled' | 'needs_user' | 'error'; label: string; detail?: string }) => void;
  maxPasses?: number;
  maxRetries?: number;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const isEmpty = (f: FormField) =>
  f.kind === 'radio' || f.kind === 'checkbox' ? !f.checked : f.kind === 'file' ? !f.value : !f.value.trim();

/** Re-read the page and report required fields that are still empty or flagged invalid. */
export async function unresolvedRequired(page: Page): Promise<FormField[]> {
  const fields = await readForm(page);
  return fields.filter((f) => f.required && f.kind !== 'combobox' && (isEmpty(f) || f.invalid));
}

/**
 * Fill every field it can on the current page. Never clicks submit.
 * Reader -> classifier -> answerer -> writer, repeated for fields revealed by earlier answers,
 * then a verify-and-retry pass over anything that did not stick.
 */
export async function fillForm(page: Page, profile: FormProfile, opts: FillOptions = {}): Promise<FillReport> {
  const started = Date.now();
  const outcomes = new Map<string, FieldOutcome & { field: FormField; answer?: Answer }>();
  const maxPasses = opts.maxPasses ?? 3;

  for (let pass = 0; pass < maxPasses; pass++) {
    const fields = await readForm(page);
    const fresh = fields.filter((f) => !outcomes.has(f.id));
    if (!fresh.length) break;

    for (const f of fresh) {
      const key = classifyField(f);
      const base = { label: f.label || '(unlabelled)', key, kind: f.kind, field: f };

      const prefilled = (f.kind === 'text' || f.kind === 'textarea' || f.kind === 'select') && f.value.trim() && key !== 'unknown';
      if (prefilled) {
        outcomes.set(f.id, { ...base, status: 'filled', value: f.value, reason: 'already filled' });
        continue;
      }

      let answer = answerField(f, key, profile);
      if (answer.type === 'none' && key === 'unknown' && opts.unknownAnswerer) {
        const guess = await opts.unknownAnswerer(f).catch(() => null);
        if (guess && guess.trim()) {
          answer = f.kind === 'text' || f.kind === 'textarea' || f.kind === 'richtext' ? { type: 'text', text: guess } : { type: 'option', text: guess };
        }
      }

      if (answer.type === 'none') {
        outcomes.set(f.id, { ...base, status: answer.status, reason: answer.reason });
        if (answer.status === 'needs_user') opts.onProgress?.({ type: 'needs_user', label: base.label, detail: answer.reason });
        continue;
      }

      const res = await writeField(page, f, answer);
      outcomes.set(f.id, { ...base, answer, status: res.ok ? 'filled' : 'failed', value: res.value, reason: res.reason });
      if (res.ok) opts.onProgress?.({ type: 'field_filled', label: base.label, detail: res.value });
      else opts.onProgress?.({ type: 'error', label: base.label, detail: res.reason });
    }
  }

  // Verify: retry only the fields whose write failed.
  const retries = opts.maxRetries ?? 2;
  for (let r = 0; r < retries; r++) {
    const failed = [...outcomes.values()].filter((o) => o.status === 'failed' && o.answer);
    if (!failed.length) break;
    const current = new Map((await readForm(page)).map((f) => [f.id, f]));
    for (const o of failed) {
      const live = current.get(o.field.id) || o.field;
      const res = await writeField(page, live, o.answer!);
      if (res.ok) {
        o.status = 'filled';
        o.value = res.value;
        o.reason = undefined;
      } else o.reason = res.reason;
    }
  }

  // Final check: anything required still empty is reported, never silently skipped.
  const unresolved = await unresolvedRequired(page);
  const byLabel = new Set(unresolved.map((f) => norm(f.label)));
  for (const o of outcomes.values()) {
    if (o.status === 'filled' && byLabel.has(norm(o.label)) && o.kind !== 'combobox' && o.reason !== 'already filled') {
      o.status = 'failed';
      o.reason = o.reason || 'Field is still empty/invalid after filling';
    }
  }

  const list = [...outcomes.values()].map(({ field: _f, answer: _a, ...rest }) => rest as FieldOutcome);
  return {
    fields: list,
    filled: list.filter((o) => o.status === 'filled').length,
    needsUser: list.filter((o) => o.status === 'needs_user').length,
    failed: list.filter((o) => o.status === 'failed').length,
    unresolvedRequired: unresolved.map((f) => f.label || f.hints),
    durationMs: Date.now() - started,
  };
}

/** True when it is safe to click submit: nothing required is left unresolved. */
export function canSubmit(report: FillReport): boolean {
  return report.unresolvedRequired.length === 0 && !report.fields.some((f) => f.status === 'needs_user' || f.status === 'failed');
}

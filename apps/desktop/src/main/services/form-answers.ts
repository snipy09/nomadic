import type { Database } from 'sql.js';
import type { FieldOutcome } from '@job-automator/form-engine';

/**
 * Answers the candidate typed during review are remembered locally so the next form asks only what is new.
 * Each answer is stored under the question fingerprint (same question, same options) and under its label,
 * so "Current company*" on Lever and "Current Company" on Greenhouse both find it.
 */

const FINGERPRINT = /^q_[0-9a-f]{16}$/;
/** Longer answers are usually written for one company (cover letters, "why us") and are not reused. */
const MAX_REMEMBERED_LENGTH = 200;
const NEVER_REMEMBER = /password|passcode|\botp\b|one[- ]time|verification code|captcha|security code/i;

/** Storage key for a question: fingerprints stay intact, labels are lower-cased words. */
export function answerKey(question: string): string {
  const q = question.trim();
  if (FINGERPRINT.test(q)) return q;
  return q.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 100);
}

/** Pairs of [question, answer] to remember from one reviewed form. `key` maps an outcome to its override key. */
export function rememberedAnswers(
  overrides: Record<string, string> | undefined,
  outcomes: FieldOutcome[],
  key: (o: FieldOutcome) => string,
): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const o of outcomes) {
    const value = overrides?.[key(o)];
    if (typeof value !== 'string' || !value.trim()) continue;
    const f = o.field;
    if (f.kind === 'file' || f.kind === 'textarea' || f.kind === 'richtext') continue;
    if (f.inputType === 'password' || NEVER_REMEMBER.test(f.label) || NEVER_REMEMBER.test(f.name || '')) continue;
    if (value.length > MAX_REMEMBERED_LENGTH) continue;
    pairs.push([key(o), value]);
    if (answerKey(f.label)) pairs.push([f.label, value]);
  }
  return pairs;
}

/** Local migration 7: earlier builds stored review answers under unreadable keys and kept model-written
 * answers keyed by label (which then leaked into other companies' forms). Start the store clean. */
export function migrateFormAnswersStore(db: Database): void {
  try { db.run('DELETE FROM cached_form_answers'); } catch { /* table missing: nothing to clear */ }
}

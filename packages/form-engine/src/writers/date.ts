import type { Page } from 'playwright';
import type { FieldKind, FieldWriter, FormField, WriteResult } from '../contracts.js';
import { fail, type Answered } from './common.js';
import { writeTextLike } from './text.js';

/** Parse an ISO (YYYY-MM-DD) or common date string; returns [y, m, d] or null. Never guesses relative dates. */
export function parseDate(v: string): [number, number, number] | null {
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return [+m[1], +m[2], +m[3]];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return [+m[3], +m[1], +m[2]];
  const t = Date.parse(s);
  if (!Number.isNaN(t) && /\d{4}/.test(s) && /[a-z]{3}/i.test(s)) {
    const d = new Date(t);
    return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
  }
  return null;
}

/** Format according to an input's placeholder (MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD, MM/YYYY). */
export function formatDate([y, m, d]: [number, number, number], placeholder?: string, inputType?: string): string {
  const p2 = (n: number) => String(n).padStart(2, '0');
  if (inputType === 'date') return `${y}-${p2(m)}-${p2(d)}`;
  if (inputType === 'month') return `${y}-${p2(m)}`;
  const ph = (placeholder || 'MM/DD/YYYY').toUpperCase();
  const sep = (ph.match(/[^A-Z]/) || ['/'])[0];
  const tokens = ph.split(/[^A-Z]+/).filter(Boolean);
  return tokens.map((t) => (t.startsWith('Y') ? String(y) : t.startsWith('M') ? p2(m) : p2(d))).join(sep);
}

export class DateWriter implements FieldWriter {
  readonly kinds: FieldKind[] = ['date'];

  async write(page: Page, field: FormField, answer: Answered): Promise<WriteResult> {
    const parsed = parseDate(answer.value);
    if (!parsed) return fail(field, `"${answer.value}" is not a calendar date`);
    return writeTextLike(page, field, formatDate(parsed, field.placeholder, field.inputType));
  }
}

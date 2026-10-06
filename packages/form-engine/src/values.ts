/**
 * Pure value helpers shared by the Playwright writers/verifier (Node) and the in-page
 * agent (browser): read-back comparison and date parsing/formatting. No DOM, no Node APIs.
 */
import type { FormField } from './contracts.js';
import { norm } from './dom.js';

/** Compare a read-back value with the intended one. */
export function valuesMatch(actual: string, expected: string, inputType?: string): boolean {
  if (norm(actual) === norm(expected)) return true;
  const digits = (s: string) => s.replace(/\D/g, '');
  if ((inputType === 'tel' || /^\+?[\d\s().-]{7,}$/.test(expected)) && digits(actual) === digits(expected) && digits(expected).length >= 7) return true;
  if (inputType === 'number' && parseFloat(actual) === parseFloat(expected)) return true;
  return false;
}

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

/** Does a read-back value equal what was written, per field kind? */
export function sameValue(field: FormField, actual: string, expected: string): boolean {
  if (field.kind === 'file') return actual === '@file';
  if (field.kind === 'checkbox' && !field.multiple) return actual === expected;
  if (field.kind === 'checkbox') {
    const a = new Set(actual.split('|').filter(Boolean).map(norm));
    const e = new Set(expected.split('|').filter(Boolean).map(norm));
    return a.size === e.size && [...e].every((x) => a.has(x));
  }
  if (['select', 'radio', 'combobox'].includes(field.kind)) return actual !== '' && (norm(actual) === norm(expected) || norm(actual).includes(norm(expected)) || norm(expected).includes(norm(actual)));
  if (field.kind === 'richtext') return norm(actual).includes(norm(expected).slice(0, 40));
  return valuesMatch(actual, expected, field.inputType);
}


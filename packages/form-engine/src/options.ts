/**
 * Choosing an option for a choice field (select, radio, combobox, button group).
 */
import { norm } from './dom.js';

export interface OptionQuery {
  /** Desired answer text (e.g. "No", "LinkedIn", "5"). */
  value: string;
  /** Acceptable alternative values. */
  values?: string[];
  /** Ordered regex sources tried after exact matches. */
  match?: string[];
  /** Treat `value` as a number and pick the option range that contains it. */
  numeric?: boolean;
}

function parseRange(label: string): [number, number] | null {
  const s = norm(label).replace(/,/g, '');
  let m = s.match(/^(?:less than|under|fewer than|<)\s*(\d+(?:\.\d+)?)/);
  if (m) return [-Infinity, parseFloat(m[1]) - 1e-9];
  m = s.match(/(\d+(?:\.\d+)?)\s*(?:\+|or more|and above|plus|or greater)/) || s.match(/^(?:more than|over|>)\s*(\d+(?:\.\d+)?)/);
  if (m) return [parseFloat(m[1]) + (/more than|over|>/.test(s) ? 1e-9 : 0), Infinity];
  m = s.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)/);
  if (m) return [parseFloat(m[1]), parseFloat(m[2])];
  m = s.match(/^(\d+(?:\.\d+)?)(?:\s*(years?|yrs?))?$/);
  if (m) return [parseFloat(m[1]), parseFloat(m[1])];
  return null;
}

/** Returns the index of the best option, or -1. */
export function pickOption(options: string[], q: OptionQuery): number {
  const opts = options.map((o) => norm(o));
  const wanted = [q.value, ...(q.values || [])].filter((v) => v != null && v !== '').map((v) => norm(v));

  for (const w of wanted) {
    const i = opts.indexOf(w);
    if (i >= 0) return i;
  }
  for (const src of q.match || []) {
    const rx = new RegExp(src, 'i');
    const i = opts.findIndex((o) => rx.test(o));
    if (i >= 0) return i;
  }
  if (q.numeric) {
    const n = parseFloat(String(q.value).replace(/[^\d.]/g, ''));
    if (!Number.isNaN(n)) {
      const i = options.findIndex((o) => {
        const r = parseRange(o);
        return !!r && n >= r[0] && n <= r[1];
      });
      if (i >= 0) return i;
    }
  }
  // Yes/No style: answer "Yes" matches "Yes, I am ..." but never "No ..."
  for (const w of wanted) {
    if (w === 'yes' || w === 'no') {
      const i = opts.findIndex((o) => new RegExp(`^${w}\\b`).test(o));
      if (i >= 0) return i;
      continue;
    }
    if (w.length < 2) continue;
    const starts = opts.findIndex((o) => o.startsWith(w) || w.startsWith(o));
    if (starts >= 0) return starts;
    const contains = opts
      .map((o, i) => ({ o, i }))
      .filter(({ o }) => o.length >= 2 && (o.includes(w) || w.includes(o)))
      .sort((a, b) => Math.abs(a.o.length - w.length) - Math.abs(b.o.length - w.length));
    if (contains.length) return contains[0].i;
  }
  return -1;
}

/** Convenience: yes/no answer query. */
export function yesNo(yes: boolean): OptionQuery {
  return yes
    ? { value: 'Yes', match: ['^yes\\b', '^(i am|i\'m|i can|i will|i do)\\b(?!.*\\bnot\\b)', '\\b(authori[sz]ed|eligible|willing|able)\\b(?!.*\\bnot\\b)', '^true$'] }
    : { value: 'No', match: ['^no\\b', '\\b(not|don\'t|do not|won\'t|will not)\\b', '^false$'] };
}

/**
 * Reads the final value of every answer-key field from the page (engine-agnostic)
 * and scores it against the expected value.
 */
import type { Frame, Page } from 'playwright';
import type { AnswerKey, Expected, KeyEntry } from './fixtures/kit.ts';

export interface ActualValue {
  missing?: boolean;
  value: string | string[];
  /** Alternative representation (option value attribute). */
  alt?: string;
}

export type Verdict = 'correct' | 'wrong' | 'skipped' | 'missing';

export interface FieldScore {
  label: string;
  category: KeyEntry['category'];
  required: boolean;
  expected: Expected;
  actual: string | string[];
  verdict: Verdict;
  /** True when the engine's reader reported this field (new engine only). */
  found?: boolean;
}

export interface EngineFieldRef {
  frameIndex: number;
  selector: string;
  shadowHostPath?: string[];
  optionSelectors?: string[];
}

function frameFor(page: Page, entry: KeyEntry): Frame | null {
  if (!entry.frame) return page.mainFrame();
  return page.frames().find((f) => f.url().includes(entry.frame!)) || null;
}

/** In-page reader (must be self-contained: it is serialized into the page). */
function readInPage(spec: { selector: string; read: string; shadow?: string[] }): ActualValue {
  (window as any).__benchCommit?.();
  let root: Document | ShadowRoot = document;
  for (const h of spec.shadow || []) {
    const host = root.querySelector(h) as Element | null;
    if (!host || !host.shadowRoot) return { missing: true, value: '' };
    root = host.shadowRoot;
  }
  const els = Array.from(root.querySelectorAll(spec.selector)) as HTMLElement[];
  if (!els.length) return { missing: true, value: '' };
  const el = els[0] as any;
  const clean = (s: string | null | undefined) => String(s || '').replace(/\s+/g, ' ').trim();
  const labelOf = (inp: HTMLInputElement): string => {
    if (inp.id) {
      const l = (root as any).querySelector(`label[for="${CSS.escape(inp.id)}"]`);
      if (l) return clean(l.textContent);
    }
    const wrap = inp.closest('label');
    if (wrap) return clean(wrap.textContent);
    return clean(inp.value);
  };
  switch (spec.read) {
    case 'value': return { value: String(el.value ?? '') };
    case 'select': {
      const s = el as HTMLSelectElement;
      if (!s.value) return { value: '' };
      const o = s.options[s.selectedIndex];
      return { value: clean(o ? o.text : ''), alt: s.value };
    }
    case 'radio': {
      const c = (els as HTMLInputElement[]).find((r) => r.checked);
      return c ? { value: labelOf(c), alt: c.value } : { value: '' };
    }
    case 'checkbox': return { value: String(!!el.checked) };
    case 'checkboxes': return { value: (els as HTMLInputElement[]).filter((c) => c.checked).map(labelOf) };
    case 'file': return { value: el.files && el.files.length ? '@file' : '' };
    case 'pressed': {
      const b = el.querySelector('[aria-pressed="true"]');
      return { value: b ? clean(b.textContent) : '' };
    }
    case 'rselect': {
      const v = el.querySelector('.select__single-value');
      return { value: v ? clean(v.textContent) : '' };
    }
    case 'wdselect': return { value: clean(el.getAttribute('value')) };
    case 'text': return { value: clean(el.innerText) };
    default: return { value: '' };
  }
}

export async function readActual(page: Page, entry: KeyEntry): Promise<ActualValue> {
  const frame = frameFor(page, entry);
  if (!frame) return { missing: true, value: '' };
  return frame.evaluate(readInPage, { selector: entry.selector, read: entry.read, shadow: entry.shadow }).catch(() => ({ missing: true, value: '' }));
}

/** Which answer-key fields correspond to a field reported by the engine's reader. */
export async function matchFound(page: Page, entry: KeyEntry, refs: EngineFieldRef[]): Promise<boolean> {
  const frame = frameFor(page, entry);
  if (!frame) return false;
  const frameIndex = page.frames().indexOf(frame);
  const candidates = refs.filter((r) => r.frameIndex === frameIndex);
  if (!candidates.length) return false;
  return frame.evaluate(({ key, cands }) => {
    const resolve = (sel: string, shadow?: string[]): Element[] => {
      let root: Document | ShadowRoot = document;
      for (const h of shadow || []) {
        const host: Element | null = root.querySelector(h);
        if (!host || !host.shadowRoot) return [];
        root = host.shadowRoot;
      }
      try { return Array.from(root.querySelectorAll(sel)); } catch { return []; }
    };
    const keyEls = resolve(key.selector, key.shadow);
    if (!keyEls.length) return false;
    for (const c of cands) {
      const els = [...resolve(c.selector, c.shadowHostPath), ...(c.optionSelectors || []).flatMap((s) => resolve(s, c.shadowHostPath))];
      for (const e of els) for (const k of keyEls) if (e === k || k.contains(e) || (e.contains(k) && e.tagName !== 'FORM' && e.tagName !== 'BODY')) return true;
    }
    return false;
  }, { key: { selector: entry.selector, shadow: entry.shadow }, cands: candidates }).catch(() => false);
}

// ── Scoring ─────────────────────────────────────────────────────────────

const isEmptyActual = (a: string | string[]) => (Array.isArray(a) ? a.length === 0 : a === '' || a === 'false');

export function normalize(s: string, expected?: string): string {
  let v = String(s).toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.]$/, '');
  const e = String(expected ?? s).trim();
  if (/^(https?:\/\/|www\.)/i.test(e)) v = v.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  else if (/^\+?[\d\s().-]{7,}$/.test(e) || /^\$[\d,.]+$/.test(e)) v = v.replace(/[^\d]/g, '');
  v = v.replace(/[‘’]/g, "'");
  return v;
}

export function scoreField(label: string, entry: KeyEntry, actual: ActualValue): FieldScore {
  const base = { label, category: entry.category, required: !!entry.required, expected: entry.expected, actual: actual.value };
  if (actual.missing) return { ...base, verdict: 'missing' };
  const a = actual.value;
  const exp = entry.expected;
  let verdict: Verdict;
  if (exp === '@empty') verdict = isEmptyActual(a) ? 'correct' : 'wrong';
  else if (exp === '@file' || exp === '@nonempty') verdict = isEmptyActual(a) ? 'skipped' : 'correct';
  else if (typeof exp === 'boolean') {
    const got = a === 'true';
    verdict = got === exp ? 'correct' : exp ? 'skipped' : 'wrong';
  } else if (Array.isArray(exp)) {
    const got = (Array.isArray(a) ? a : [a]).map((x) => normalize(x)).sort();
    const want = exp.map((x) => normalize(x)).sort();
    if (!got.length) verdict = 'skipped';
    else verdict = got.length === want.length && got.every((g, i) => g === want[i]) ? 'correct' : 'wrong';
  } else {
    if (isEmptyActual(a) && a !== 'false') verdict = 'skipped';
    else {
      const want = normalize(exp, exp);
      const ok = normalize(String(a), exp) === want || (actual.alt != null && normalize(actual.alt, exp) === want);
      verdict = ok ? 'correct' : 'wrong';
    }
  }
  return { ...base, verdict };
}

export async function scoreFixture(page: Page, key: AnswerKey, refs?: EngineFieldRef[]): Promise<FieldScore[]> {
  const out: FieldScore[] = [];
  for (const [label, entry] of Object.entries(key.fields)) {
    const actual = await readActual(page, entry);
    const s = scoreField(label, entry, actual);
    if (refs) s.found = await matchFound(page, entry, refs);
    out.push(s);
  }
  return out;
}

/**
 * Shared helpers for field writers: read-back, value comparison, clicking
 * options, and finding listbox options (including body-level portals).
 */
import type { ElementHandle, Page } from 'playwright';
import type { Answer, FormField, WriteResult } from '../contracts.js';
import { frameAt, norm, prepareFrame, resolveField, sleep } from '../dom.js';

export type Answered = Extract<Answer, { status: 'answered' }>;

export const fail = (field: FormField, error: string, actual?: string): WriteResult => ({ fieldId: field.id, ok: false, error, actual });
export const success = (field: FormField, actual: string): WriteResult => ({ fieldId: field.id, ok: true, actual });

/** Compare a read-back value with the intended one. */
export function valuesMatch(actual: string, expected: string, inputType?: string): boolean {
  if (norm(actual) === norm(expected)) return true;
  const digits = (s: string) => s.replace(/\D/g, '');
  if ((inputType === 'tel' || /^\+?[\d\s().-]{7,}$/.test(expected)) && digits(actual) === digits(expected) && digits(expected).length >= 7) return true;
  if (inputType === 'number' && parseFloat(actual) === parseFloat(expected)) return true;
  return false;
}

/** Read the current value of any field kind (runs in the page). */
export async function readFieldValue(page: Page, field: FormField): Promise<string> {
  const h = await resolveField(page, field);
  if (!h) return '';
  try {
    return await h.evaluate((el: Element, f: { kind: string; multiple?: boolean; optionSelectors: string[] }) => {
      const clean = (s: string | null | undefined) => String(s || '').replace(/\s+/g, ' ').trim();
      const root = el.getRootNode() as Document | ShadowRoot;
      const labelOf = (inp: Element): string => {
        const id = inp.getAttribute('id');
        if (id) {
          const l = root.querySelector(`label[for="${CSS.escape(id)}"]`);
          if (l) return clean(l.textContent);
        }
        const w = inp.closest('label');
        if (w) return clean(w.textContent);
        return clean(inp.getAttribute('aria-label') || (inp as HTMLInputElement).value || inp.textContent);
      };
      const isOn = (o: Element) => {
        if (o instanceof HTMLInputElement) return o.checked;
        return o.getAttribute('aria-pressed') === 'true' || o.getAttribute('aria-checked') === 'true' || o.getAttribute('aria-selected') === 'true' || /(^|\s)(active|selected|_active_|_selected_|is-selected|checked)(\s|$)/.test(o.className);
      };
      if (f.kind === 'radio' || f.kind === 'checkbox') {
        const opts = f.optionSelectors.map((s) => root.querySelector(s)).filter((x): x is Element => !!x);
        if (f.kind === 'checkbox' && !f.multiple) return String(!!(opts[0] || el) && isOn(opts[0] || el));
        const on = opts.filter(isOn).map((o) => (o instanceof HTMLInputElement ? labelOf(o) : clean(o.textContent)));
        return f.kind === 'radio' ? on[0] || '' : on.join('|');
      }
      if (el instanceof HTMLSelectElement) {
        const o = el.options[el.selectedIndex];
        return el.value && o ? clean(o.text) : '';
      }
      if (el instanceof HTMLInputElement && el.type === 'file') return el.files && el.files.length ? '@file' : '';
      if (el.tagName === 'BUTTON') return clean(el.getAttribute('value') || '') || clean(el.textContent);
      if ((el as HTMLElement).isContentEditable) return clean((el as HTMLElement).innerText);
      if (f.kind === 'combobox' && el instanceof HTMLInputElement) {
        const shell = el.closest('.select-shell, [class*="select__container"], [class*="-container"], [data-field]');
        const sv = shell?.querySelector('[class*="single-value"], [class*="singleValue"], [class*="multi-value"]');
        if (sv && clean(sv.textContent)) return clean(sv.textContent);
        const hidden = shell?.querySelector('input[type="hidden"]') as HTMLInputElement | null;
        if (hidden && hidden.value) return clean(hidden.value);
      }
      return (el as HTMLInputElement).value ?? '';
    }, { kind: field.kind, multiple: field.multiple, optionSelectors: (field.options || []).map((o) => o.selector || '').filter(Boolean) });
  } catch {
    return '';
  } finally {
    await h.dispose().catch(() => {});
  }
}

/** Click an element as a user would; falls back to a DOM click when Playwright's actionability checks fail. */
export async function clickLikeUser(h: ElementHandle<Element>, opts: { preferLabel?: boolean } = {}): Promise<void> {
  if (opts.preferLabel) {
    const clicked = await h.evaluate((el: Element) => {
      const inp = el as HTMLInputElement;
      const root = el.getRootNode() as Document | ShadowRoot;
      const lbl = (inp.id && root.querySelector(`label[for="${CSS.escape(inp.id)}"]`)) || inp.closest('label');
      if (lbl) { (lbl as HTMLElement).click(); return true; }
      return false;
    }).catch(() => false);
    if (clicked) return;
  }
  try {
    await h.click({ timeout: 1200 });
  } catch {
    await h.evaluate((el: Element) => (el as HTMLElement).click()).catch(() => {});
  }
}

export interface VisibleOption { index: number; text: string }

/** Visible [role=option] elements in the field's frame (portals included). */
export async function listVisibleOptions(page: Page, field: FormField): Promise<VisibleOption[]> {
  const frame = frameAt(page, field.frameIndex);
  if (!frame) return [];
  await prepareFrame(frame);
  return frame.evaluate((hosts: string[]) => {
    const roots: Array<Document | ShadowRoot> = [document];
    let r: Document | ShadowRoot = document;
    for (const h of hosts) {
      const host: Element | null = r.querySelector(h);
      if (!host?.shadowRoot) break;
      r = host.shadowRoot;
      roots.push(r);
    }
    const all: Element[] = [];
    for (const root of roots) all.push(...Array.from(root.querySelectorAll('[role="option"], .select2-result, li[data-automation-id="promptOption"]')));
    const uniq = Array.from(new Set(all));
    return uniq
      .map((el, index) => ({ el, index }))
      .filter(({ el }) => {
        const he = el as HTMLElement;
        const rect = he.getBoundingClientRect();
        const st = getComputedStyle(he);
        return rect.width > 0 && rect.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && el.getAttribute('aria-disabled') !== 'true';
      })
      .map(({ el, index }) => ({ index, text: String(el.textContent || '').replace(/\s+/g, ' ').trim() }));
  }, field.shadowHostPath || []).catch(() => []);
}

export async function clickVisibleOption(page: Page, field: FormField, index: number): Promise<boolean> {
  const frame = frameAt(page, field.frameIndex);
  if (!frame) return false;
  const handle = await frame.evaluateHandle(({ hosts, index }) => {
    const roots: Array<Document | ShadowRoot> = [document];
    let r: Document | ShadowRoot = document;
    for (const h of hosts) {
      const host: Element | null = r.querySelector(h);
      if (!host?.shadowRoot) break;
      r = host.shadowRoot;
      roots.push(r);
    }
    const all: Element[] = [];
    for (const root of roots) all.push(...Array.from(root.querySelectorAll('[role="option"], .select2-result, li[data-automation-id="promptOption"]')));
    return Array.from(new Set(all))[index] || null;
  }, { hosts: field.shadowHostPath || [], index }).catch(() => null);
  const el = handle?.asElement();
  if (!el) return false;
  await clickLikeUser(el as ElementHandle<Element>);
  await el.dispose().catch(() => {});
  return true;
}

export async function waitForOptions(page: Page, field: FormField, timeoutMs = 1500): Promise<VisibleOption[]> {
  const end = Date.now() + timeoutMs;
  let opts: VisibleOption[] = [];
  while (Date.now() < end) {
    opts = await listVisibleOptions(page, field);
    if (opts.length) return opts;
    await sleep(60);
  }
  return opts;
}

/** Set a value through the native prototype setter (React value-tracker safe) and fire input/change/blur. */
export async function setNativeValue(h: ElementHandle<Element>, value: string): Promise<void> {
  await h.evaluate((el: Element, v: string) => {
    const he = el as HTMLInputElement;
    he.focus();
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc?.set) desc.set.call(el, v); else he.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    he.blur();
  }, value);
}

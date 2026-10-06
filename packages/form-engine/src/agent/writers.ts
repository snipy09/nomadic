/**
 * Field writers for the in-page agent. Same strategy, fallbacks and read-back checks as the
 * Playwright writers in ../writers (desktop), with Playwright actions replaced by the
 * user-like DOM input in ./input.ts.
 */
import type { FormField, WriteResult } from '../contracts.js';
import { norm } from '../dom.js';
import { pickOption } from '../options.js';
import { formatDate, parseDate, valuesMatch } from '../values.js';
import { readValueInPage } from './inpage.js';
import { attachFile, clickLikeUser, fillValue, pressKey, scrollIntoViewIfNeeded, setNativeValue, sleep, typeText, userClick } from './input.js';
import type { AgentFile, Answered } from './protocol.js';

const fail = (field: FormField, error: string, actual?: string): WriteResult => ({ fieldId: field.id, ok: false, error, actual });
const success = (field: FormField, actual: string): WriteResult => ({ fieldId: field.id, ok: true, actual });

/** Resolve a selector in this document, walking open shadow roots. */
export function resolveIn(selector: string, hosts: string[] = []): Element | null {
  let root: Document | ShadowRoot = document;
  for (const h of hosts) {
    const host: Element | null = root.querySelector(h);
    if (!host || !host.shadowRoot) return null;
    root = host.shadowRoot;
  }
  try { return root.querySelector(selector); } catch { return null; }
}

export const resolveField = (field: FormField, selector = field.selector) => resolveIn(selector, field.shadowHostPath);

export function readField(field: FormField): string {
  const el = resolveField(field);
  if (!el) return '';
  try {
    return readValueInPage(el, { kind: field.kind, multiple: field.multiple, optionSelectors: (field.options || []).map((o) => o.selector || '').filter(Boolean) });
  } catch {
    return '';
  }
}

// ── listbox options (portals included) ─────────────────────────────────────

interface VisibleOption { el: Element; text: string }

function listVisibleOptions(field: FormField): VisibleOption[] {
  const roots: Array<Document | ShadowRoot> = [document];
  let r: Document | ShadowRoot = document;
  for (const h of field.shadowHostPath || []) {
    const host: Element | null = r.querySelector(h);
    if (!host?.shadowRoot) break;
    r = host.shadowRoot;
    roots.push(r);
  }
  const all: Element[] = [];
  for (const root of roots) all.push(...Array.from(root.querySelectorAll('[role="option"], .select2-result, li[data-automation-id="promptOption"]')));
  return Array.from(new Set(all))
    .filter((el) => {
      const he = el as HTMLElement;
      const rect = he.getBoundingClientRect();
      const st = getComputedStyle(he);
      return rect.width > 0 && rect.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && el.getAttribute('aria-disabled') !== 'true';
    })
    .map((el) => ({ el, text: String(el.textContent || '').replace(/\s+/g, ' ').trim() }));
}

async function waitForOptions(field: FormField, timeoutMs = 1500): Promise<VisibleOption[]> {
  const end = Date.now() + timeoutMs;
  let opts: VisibleOption[] = [];
  while (Date.now() < end) {
    opts = listVisibleOptions(field);
    if (opts.length) return opts;
    await sleep(60);
  }
  return opts;
}

// ── writers ────────────────────────────────────────────────────────────────

async function writeTextLike(field: FormField, value: string): Promise<WriteResult> {
  const el = resolveField(field) as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el) return fail(field, 'element not found');
  scrollIntoViewIfNeeded(el);
  setNativeValue(el, value);
  await sleep(40);
  let actual = readField(field);
  if (valuesMatch(actual, value, field.inputType)) return success(field, actual);
  // Fallback: replace the value like a paste, then blur.
  fillValue(el, value);
  el.blur();
  await sleep(40);
  actual = readField(field);
  return valuesMatch(actual, value, field.inputType) ? success(field, actual) : fail(field, 'value did not stick', actual);
}

async function writeSelect(field: FormField, answer: Answered): Promise<WriteResult> {
  const sel = resolveField(field) as HTMLSelectElement | null;
  if (!sel) return fail(field, 'element not found');
  const usable = Array.from(sel.options).map((o, i) => ({ text: o.text.replace(/\s+/g, ' ').trim(), value: o.value, i })).filter((o) => o.value !== '');
  let idx = pickOption(usable.map((o) => o.text), answer);
  if (idx < 0) idx = pickOption(usable.map((o) => o.value), answer);
  if (idx < 0) return fail(field, `no option matches "${answer.value}"`);
  const target = usable[idx];
  setNativeValue(sel, target.value);
  await sleep(30);
  let actual = readField(field);
  if (norm(actual) !== norm(target.text)) {
    sel.selectedIndex = target.i;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    actual = readField(field);
  }
  return norm(actual) === norm(target.text) ? success(field, actual) : fail(field, 'selection did not stick', actual);
}

async function comboViaButton(field: FormField, el: Element, answer: Answered): Promise<string | null> {
  userClick(el);
  const opts = await waitForOptions(field);
  const idx = pickOption(opts.map((o) => o.text), answer);
  if (idx < 0) {
    pressKey('Escape');
    userClick(el); // close
    return null;
  }
  userClick(opts[idx].el);
  return opts[idx].text;
}

async function comboViaInput(field: FormField, el: HTMLInputElement, answer: Answered): Promise<string | null> {
  const search = answer.searchText ?? answer.value;
  // 1) Static lists (react-select) open on click: pick without typing.
  userClick(el);
  let opts = await waitForOptions(field, 350);
  let idx = opts.length ? pickOption(opts.map((o) => o.text), answer) : -1;
  if (idx >= 0) {
    userClick(opts[idx].el);
    return opts[idx].text;
  }
  // 2) Typeahead: type the search text and pick from the filtered list.
  fillValue(el, '');
  await typeText(el, search, 10);
  opts = await waitForOptions(field, 1200);
  idx = pickOption(opts.map((o) => o.text), answer);
  if (idx < 0) {
    // open the unfiltered list
    fillValue(el, '');
    el.focus({ preventScroll: true });
    pressKey('ArrowDown');
    opts = await waitForOptions(field, 1000);
    if (!opts.length) {
      userClick(el);
      opts = await waitForOptions(field, 800);
    }
    idx = pickOption(opts.map((o) => o.text), answer);
  }
  if (idx < 0) {
    pressKey('Escape');
    return null;
  }
  userClick(opts[idx].el);
  return opts[idx].text;
}

async function writeCombobox(field: FormField, answer: Answered): Promise<WriteResult> {
  const el = resolveField(field);
  if (!el) return fail(field, 'element not found');
  scrollIntoViewIfNeeded(el);
  const chosen = el.tagName === 'BUTTON' ? await comboViaButton(field, el, answer) : await comboViaInput(field, el as HTMLInputElement, answer);
  if (!chosen) return fail(field, `no option matches "${answer.value}"`, readField(field));
  await sleep(60);
  const actual = readField(field);
  return actual !== '' && (norm(actual).includes(norm(chosen)) || norm(chosen).includes(norm(actual)))
    ? success(field, actual)
    : fail(field, 'selection did not stick', actual);
}

async function writeRadio(field: FormField, answer: Answered): Promise<WriteResult> {
  const options = field.options || [];
  if (!options.length) return fail(field, 'radio group has no options');
  let idx = pickOption(options.map((o) => o.label), answer);
  if (idx < 0) idx = pickOption(options.map((o) => o.value), answer);
  if (idx < 0) return fail(field, `no option matches "${answer.value}"`);
  const opt = options[idx];
  for (let attempt = 0; attempt < 2; attempt++) {
    const el = resolveField(field, opt.selector);
    if (!el) return fail(field, 'option element not found');
    scrollIntoViewIfNeeded(el);
    if (attempt === 0) clickLikeUser(el, { preferLabel: el.tagName === 'INPUT' });
    else userClick(el);
    await sleep(40);
    const actual = readField(field);
    if (norm(actual) === norm(opt.label)) return success(field, actual);
  }
  return fail(field, 'option did not stay selected', readField(field));
}

async function writeCheckbox(field: FormField, answer: Answered): Promise<WriteResult> {
  const options = field.options?.length ? field.options : [{ label: field.label, value: 'on', selector: field.selector }];
  const wanted = field.multiple ? new Set((answer.values || answer.value.split('|')).map(norm)) : null;
  for (const opt of options) {
    const desired = wanted ? wanted.has(norm(opt.label)) || wanted.has(norm(opt.value)) : answer.value === 'true';
    const el = resolveField(field, opt.selector || field.selector);
    if (!el) return fail(field, 'checkbox not found');
    for (let attempt = 0; attempt < 2; attempt++) {
      const checked = (el as HTMLInputElement).checked === true || el.getAttribute('aria-checked') === 'true';
      if (checked === desired) break;
      if (attempt === 0) clickLikeUser(el, { preferLabel: true });
      else userClick(el);
      await sleep(30);
    }
  }
  await sleep(30);
  const actual = readField(field);
  if (field.multiple) {
    const got = new Set(actual.split('|').filter(Boolean).map(norm));
    const want = new Set(options.filter((o) => wanted!.has(norm(o.label)) || wanted!.has(norm(o.value))).map((o) => norm(o.label)));
    const same = got.size === want.size && [...want].every((w) => got.has(w));
    return same ? success(field, actual) : fail(field, 'checkbox group state did not stick', actual);
  }
  return actual === answer.value ? success(field, actual) : fail(field, 'checkbox state did not stick', actual);
}

async function writeDate(field: FormField, answer: Answered): Promise<WriteResult> {
  const parsed = parseDate(answer.value);
  if (!parsed) return fail(field, `"${answer.value}" is not a calendar date`);
  return writeTextLike(field, formatDate(parsed, field.placeholder, field.inputType));
}

async function writeRichText(field: FormField, answer: Answered): Promise<WriteResult> {
  const he = resolveField(field) as HTMLElement | null;
  if (!he) return fail(field, 'element not found');
  scrollIntoViewIfNeeded(he);
  he.focus({ preventScroll: true });
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(he);
  sel?.removeAllRanges();
  sel?.addRange(range);
  const ok = document.execCommand && document.execCommand('insertText', false, answer.value);
  if (!ok || !he.innerText.trim()) {
    he.textContent = answer.value;
    he.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: answer.value }));
  }
  he.blur();
  await sleep(30);
  const actual = readField(field);
  const probe = norm(answer.value).slice(0, 40);
  return norm(actual).includes(probe) ? success(field, actual) : fail(field, 'editor content did not stick', actual);
}

/** True when `fileName` is attached to the field (see writers/file.ts on desktop). */
export function fileAttached(field: FormField, fileName: string): boolean {
  if (readField(field) === '@file') return true;
  if (resolveField(field)) return false;
  return !!fileName && (document.body?.innerText || '').includes(fileName);
}

async function writeFile(field: FormField, answer: Answered, file?: AgentFile): Promise<WriteResult> {
  if (!file) return fail(field, `file not found: ${answer.value}`);
  const el = resolveField(field) as HTMLInputElement | null;
  if (!el) return fileAttached(field, file.name) ? success(field, '@file') : fail(field, 'element not found');
  try {
    attachFile(el, file);
  } catch (err) {
    return fail(field, `upload failed: ${(err as Error).message}`);
  }
  // Upload widgets may re-render a moment later (e.g. replace the input with the file name).
  for (let i = 0; i < 6; i++) {
    if (fileAttached(field, file.name)) return success(field, '@file');
    await sleep(250);
  }
  return fail(field, 'file was not attached', readField(field));
}

export async function writeField(field: FormField, answer: Answered, file?: AgentFile): Promise<WriteResult> {
  try {
    switch (field.kind) {
      case 'text':
      case 'textarea': return await writeTextLike(field, answer.value);
      case 'select': return await writeSelect(field, answer);
      case 'combobox': return await writeCombobox(field, answer);
      case 'radio': return await writeRadio(field, answer);
      case 'checkbox': return await writeCheckbox(field, answer);
      case 'date': return await writeDate(field, answer);
      case 'file': return await writeFile(field, answer, file);
      case 'richtext': return await writeRichText(field, answer);
      default: return fail(field, `no writer for ${field.kind}`);
    }
  } catch (err) {
    return fail(field, (err as Error).message || String(err));
  }
}

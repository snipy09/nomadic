/**
 * FormReader: normalizes any page (all frames, open shadow roots) into FormField[].
 *
 * Label resolution order: aria-labelledby, <label for>, wrapping <label>,
 * aria-label, fieldset legend, field-container heading (Lever `.application-label`,
 * Ashby `_heading_`, Internshala `.assessment_question` ...), placeholder, name.
 */
import type { Page } from 'playwright';
import type { FieldKind, FieldOption, FormField, FormReader } from './contracts.js';
import { prepareFrame } from './dom.js';

type RawField = Omit<FormField, 'id' | 'frameIndex' | 'frameUrl'>;

/** Runs inside the page. Must be fully self-contained. */
function scanFrame(opts: { includeHidden: boolean }): RawField[] {
  const out: RawField[] = [];
  const clean = (s: string | null | undefined) =>
    String(s || '').replace(/[✱✳]/g, ' ').replace(/\s+/g, ' ').trim();
  const stripReq = (s: string) => clean(s).replace(/\s*\*\s*$/, '').replace(/^\*\s*/, '').replace(/\s*\(required\)\s*$/i, '').trim();
  const q = (v: string) => '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

  const isShown = (el: Element | null): boolean => {
    if (!el) return false;
    const he = el as HTMLElement;
    if (!he.isConnected) return false;
    const style = getComputedStyle(he);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const r = he.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return true;
    // display:contents or zero-size wrappers: look at children
    return (he.offsetParent !== null || style.position === 'fixed') && (r.width > 0 || r.height > 0);
  };
  const ancestorsShown = (el: Element): boolean => {
    let cur: Element | null = el;
    while (cur) {
      const s = getComputedStyle(cur as HTMLElement);
      if (s.display === 'none') return false;
      if (s.visibility === 'hidden' && cur !== el) return false;
      const parent: Element | null = cur.parentElement || ((cur.getRootNode() as ShadowRoot).host ?? null);
      cur = parent;
    }
    return true;
  };

  const roots: Array<{ root: Document | ShadowRoot; hosts: string[] }> = [];
  const selectorFor = (el: Element, root: Document | ShadowRoot): string => {
    const tag = el.tagName.toLowerCase();
    const id = el.getAttribute('id');
    if (id && root.querySelectorAll(`[id=${q(id)}]`).length === 1) return `[id=${q(id)}]`;
    const name = el.getAttribute('name');
    if (name) {
      const value = el.getAttribute('value');
      const base = `${tag}[name=${q(name)}]`;
      if (root.querySelectorAll(base).length === 1) return base;
      if (value != null) {
        const withVal = `${base}[value=${q(value)}]`;
        if (root.querySelectorAll(withVal).length === 1) return withVal;
      }
    }
    for (const attr of ['data-automation-id', 'data-qa', 'data-testid', 'aria-label', 'data-name', 'data-rselect', 'data-wd-select']) {
      const v = el.getAttribute(attr);
      if (v) {
        const s = `${tag}[${attr}=${q(v)}]`;
        if (root.querySelectorAll(s).length === 1) return s;
      }
    }
    const parts: string[] = [];
    let cur: Element | null = el;
    while (cur && cur.parentElement) {
      const cid = cur.getAttribute('id');
      if (cid && cur !== el && root.querySelectorAll(`[id=${q(cid)}]`).length === 1) { parts.unshift(`[id=${q(cid)}]`); break; }
      const p: Element = cur.parentElement;
      const same = Array.from(p.children).filter((c) => c.tagName === cur!.tagName);
      parts.unshift(`${cur.tagName.toLowerCase()}${same.length > 1 ? `:nth-of-type(${same.indexOf(cur) + 1})` : ''}`);
      cur = p;
    }
    if (cur && !cur.parentElement && !parts[0]?.startsWith('[id=')) parts.unshift(cur.tagName.toLowerCase());
    return parts.join(' > ');
  };

  const SKIP_TEXT = 'input, select, textarea, option, button, [role="listbox"], .select__menu, script, style, [role="alert"], .bench-error, .select2-container, .select__single-value, .select__placeholder';
  const textOf = (node: Node): string => {
    if (node.nodeType === 3) return node.textContent || '';
    if (node.nodeType !== 1) return '';
    const el = node as Element;
    if (el.matches(SKIP_TEXT)) return '';
    return ' ' + Array.from(el.childNodes).map(textOf).join('') + ' ';
  };
  const textWithoutControls = (el: Element): string => clean(Array.from(el.childNodes).map(textOf).join(''));
  /** A label for a radio/checkbox option (not a question heading). */
  const isOptionLabel = (l: Element, scope: Element | Document | ShadowRoot): boolean => {
    if (l.tagName !== 'LABEL') return false;
    const forId = l.getAttribute('for');
    const target = forId ? (scope as Element).querySelector?.(`[id=${q(forId)}]`) || (l.getRootNode() as Document).querySelector?.(`[id=${q(forId)}]`) : l.querySelector('input');
    return !!target && ['radio', 'checkbox'].includes((target as HTMLInputElement).type);
  };

  const CONTROL_SEL = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), textarea, select, [contenteditable="true"], [contenteditable=""], button[aria-haspopup="listbox"]';
  const LABELISH = 'label, legend, .application-label, [class*="_heading_"], [class*="heading"], .label, [class*="label"], .assessment_question, .lbl, h3, h4, h5, p.question, .question-title';

  const groupKeyOf = (el: Element): string => {
    const t = (el as HTMLInputElement).type;
    const n = el.getAttribute('name');
    if ((t === 'radio' || t === 'checkbox') && n) return `${t}:${n}`;
    return '';
  };

  /** The nearest ancestor that holds only this field's controls. */
  const fieldContainer = (el: Element, root: Document | ShadowRoot): Element | null => {
    const gk = groupKeyOf(el);
    const members = gk ? Array.from(root.querySelectorAll(`input[type=${q((el as HTMLInputElement).type)}][name=${q(el.getAttribute('name') || '')}]`)) : [el];
    let cur: Element | null = el.parentElement;
    let best: Element | null = null;
    for (let depth = 0; cur && depth < 8; depth++) {
      if (cur.tagName === 'FORM' || cur.tagName === 'BODY') break;
      const ctrls = Array.from(cur.querySelectorAll(CONTROL_SEL)).filter((c) => c === el || (isShown(c) || ancestorsShown(c) && (c as HTMLInputElement).type === 'file') );
      const others = ctrls.filter((c) => c !== el && (!gk || groupKeyOf(c) !== gk));
      if (others.length) break;
      best = cur;
      const c = cur;
      if (members.every((m) => c.contains(m))) {
        const hasLabel = Array.from(cur.querySelectorAll(LABELISH)).some((l) => !l.contains(el) && !isOptionLabel(l, c) && textWithoutControls(l));
        if (hasLabel) return cur;
      }
      cur = cur.parentElement;
    }
    return best;
  };

  const headingIn = (container: Element, el: Element): string => {
    const cands = Array.from(container.querySelectorAll(LABELISH)).filter((l) => !l.contains(el) && !(l as Element).closest('[role="listbox"]'));
    for (const c of cands) {
      if (isOptionLabel(c, container)) continue;
      const t = textWithoutControls(c);
      if (t) return t;
    }
    return '';
  };

  const isRequiredLabel = (container: Element | null): boolean => {
    if (!container) return false;
    if (container.querySelector('.asterisk, .required, abbr[title="required"], [class*="_required_"]')) return true;
    const lbl = container.querySelector(LABELISH);
    return !!lbl && /\*|✱/.test(lbl.textContent || '');
  };

  const labelFor = (el: Element, root: Document | ShadowRoot): { label: string; container: Element | null; requiredMark: boolean } => {
    const container = fieldContainer(el, root);
    const parts: string[] = [];
    let requiredMark = false;
    const lb = el.getAttribute('aria-labelledby');
    if (lb) {
      const t = lb.split(/\s+/).map((id) => (root as Document).getElementById ? (root as Document).getElementById(id) : root.querySelector(`[id=${q(id)}]`))
        .filter((n): n is HTMLElement => !!n && n !== el && !(n.tagName === 'BUTTON' && n === el)).map((n) => textWithoutControls(n)).filter(Boolean).join(' ');
      if (t) { parts.push(t); requiredMark = /\*/.test(t); }
    }
    // File inputs: the <label for> is often just the "Attach" button; the upload group names the field.
    const group = !parts.length && (el as HTMLInputElement).type === 'file' ? el.closest('[role="group"][aria-labelledby]') : null;
    if (group) {
      const t = (group.getAttribute('aria-labelledby') || '').split(/\s+/).map((gid) => root.querySelector(`[id=${q(gid)}]`)).filter((n): n is Element => !!n).map((n) => textWithoutControls(n)).filter(Boolean).join(' ');
      if (t) { parts.push(t); requiredMark = /\*/.test(t) || group.getAttribute('aria-required') === 'true'; }
    }
    const id = el.getAttribute('id');
    if (!parts.length && id) {
      const l = root.querySelector(`label[for=${q(id)}]`);
      if (l) { const t = textWithoutControls(l); if (t) { parts.push(t); requiredMark = /\*|✱/.test(l.textContent || '') || !!l.querySelector('abbr, .asterisk, .required') || /_required_/.test(l.className); } }
    }
    if (!parts.length) {
      const wrap = el.closest('label');
      if (wrap) { const t = textWithoutControls(wrap); if (t) { parts.push(t); requiredMark = /\*|✱/.test(wrap.textContent || ''); } }
    }
    if (!parts.length) {
      const al = el.getAttribute('aria-label');
      if (al) parts.push(clean(al));
    }
    if (!parts.length) {
      const fs = el.closest('fieldset');
      const lg = fs?.querySelector('legend');
      if (lg) parts.push(textWithoutControls(lg));
    }
    if (!parts.length && container) {
      const h = headingIn(container, el);
      if (h) parts.push(h);
    }
    if (!parts.length) {
      // previous sibling text
      let sib = el.previousElementSibling;
      for (let i = 0; sib && i < 3; i++, sib = sib.previousElementSibling) {
        if (sib.matches(CONTROL_SEL) || sib.querySelector(CONTROL_SEL)) break;
        const t = textWithoutControls(sib);
        if (t) { parts.push(t); break; }
      }
    }
    if (!parts.length) {
      const ph = el.getAttribute('placeholder');
      if (ph) parts.push(clean(ph));
    }
    if (!parts.length) parts.push(clean(el.getAttribute('name') || el.getAttribute('id') || ''));
    return { label: stripReq(parts[0]), container, requiredMark: requiredMark || isRequiredLabel(container) };
  };

  const optionLabel = (inp: HTMLInputElement, root: Document | ShadowRoot): string => {
    if (inp.id) {
      const l = root.querySelector(`label[for=${q(inp.id)}]`);
      if (l) return textWithoutControls(l);
    }
    const w = inp.closest('label');
    if (w) return textWithoutControls(w);
    const al = inp.getAttribute('aria-label');
    if (al) return clean(al);
    const next = inp.nextElementSibling;
    if (next && clean(next.textContent)) return clean(next.textContent);
    return clean(inp.value);
  };

  const describe = (container: Element | null, label: string, optionTexts: string[]): string => {
    if (!container) return '';
    let t = textWithoutControls(container);
    for (const s of [label, ...optionTexts]) if (s) t = t.replace(s, ' ');
    t = clean(t);
    return t.length > 3 ? t.slice(0, 800) : '';
  };

  const valueOf = (el: Element): string => {
    if (el instanceof HTMLSelectElement) {
      const o = el.options[el.selectedIndex];
      return el.value && o ? clean(o.text) : '';
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value || '';
    if ((el as HTMLElement).isContentEditable) return clean((el as HTMLElement).innerText);
    if (el.tagName === 'BUTTON') return clean(el.getAttribute('value') || '');
    return '';
  };

  const walk = (root: Document | ShadowRoot, hosts: string[]) => {
    roots.push({ root, hosts });
    root.querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot && el.shadowRoot.mode === 'open') walk(el.shadowRoot, [...hosts, selectorFor(el, root)]);
    });
  };
  walk(document, []);

  const seenGroups = new Set<string>();
  const claimedButtons = new Set<Element>();

  for (const { root, hosts } of roots) {
    const controls = Array.from(root.querySelectorAll(CONTROL_SEL));
    for (const el of controls) {
      const input = el as HTMLInputElement;
      const tag = el.tagName;
      const type = (input.type || '').toLowerCase();
      if ((el as HTMLElement).closest('[role="listbox"], .select__menu, .wd-popup, #nomadic-auto-apply-overlay')) continue;
      // Validation proxies (e.g. react-select's hidden "required" input on Greenhouse boards): not a field of their own.
      if (tag === 'INPUT' && el.getAttribute('aria-hidden') === 'true' && el.getAttribute('tabindex') === '-1' && !['file', 'radio', 'checkbox'].includes(type) && !input.name) continue;

      const visibleSelf = isShown(el);
      const usable = visibleSelf || (ancestorsShown(el.parentElement || el) && (type === 'file' || type === 'radio' || type === 'checkbox' || tag === 'SELECT') && isShown(fieldContainer(el, root) || el.parentElement));
      if (!usable && !opts.includeHidden) continue;

      let kind: FieldKind;
      let options: FieldOption[] | undefined;
      let multiple = false;
      if (tag === 'TEXTAREA') kind = 'textarea';
      else if (tag === 'SELECT') {
        kind = 'select';
        multiple = (el as HTMLSelectElement).multiple;
        options = Array.from((el as HTMLSelectElement).options)
          .filter((o, i) => !(i === 0 && (!o.value || /^(select|choose|please|--)/i.test(o.text.trim()))) && o.value !== '')
          .map((o) => ({ label: clean(o.text), value: o.value }));
      } else if (tag === 'BUTTON') kind = 'combobox';
      else if ((el as HTMLElement).isContentEditable) kind = 'richtext';
      else if (type === 'radio' || type === 'checkbox') {
        const name = input.name;
        const gk = groupKeyOf(el);
        if (gk && seenGroups.has(gk)) continue;
        const group = name ? Array.from(root.querySelectorAll(`input[type=${q(type)}][name=${q(name)}]`)) as HTMLInputElement[] : [input];
        if (gk) seenGroups.add(gk);
        kind = type as FieldKind;
        multiple = type === 'checkbox' && group.length > 1;
        options = group.map((g) => ({ label: optionLabel(g, root), value: g.value, selector: selectorFor(g, root) }));
      } else if (type === 'file') kind = 'file';
      else if (type === 'date' || type === 'month' || type === 'datetime-local') kind = 'date';
      else if (input.getAttribute('role') === 'combobox' || input.getAttribute('aria-autocomplete') === 'list') kind = 'combobox';
      else if (/^(mm|dd|yyyy)[\/.-]/i.test(input.placeholder || '')) kind = 'date';
      else kind = 'text';

      const { label, container, requiredMark } = labelFor(el, root);
      let finalLabel = label;
      let description = '';
      if ((kind === 'radio' || kind === 'checkbox') && options) {
        const optTexts = options.map((o) => o.label);
        const heading = container ? headingIn(container, el) : '';
        if (heading && !optTexts.includes(heading)) finalLabel = stripReq(heading);
        else if (!multiple && options.length === 1) finalLabel = optTexts[0];
        description = describe(container, finalLabel, optTexts);
      }
      const required = input.required || el.getAttribute('aria-required') === 'true' || requiredMark;
      let currentValue = valueOf(el);
      if (kind === 'radio' && options) {
        const group = options.map((o) => root.querySelector(o.selector!) as HTMLInputElement | null);
        const c = group.findIndex((g) => g?.checked);
        currentValue = c >= 0 ? options[c].label : '';
      } else if (kind === 'checkbox' && options) {
        const group = options.map((o) => root.querySelector(o.selector!) as HTMLInputElement | null);
        currentValue = multiple ? group.map((g, i) => (g?.checked ? options![i].label : '')).filter(Boolean).join('|') : String(!!group[0]?.checked);
      } else if (kind === 'combobox' && tag === 'INPUT') {
        let shell: Element | null = el;
        for (let i = 0; i < 5 && shell; i++) {
          shell = shell.parentElement;
          const sv = shell?.querySelector('[class*="single-value"], [class*="singleValue"]');
          if (sv) { if (clean(sv.textContent)) currentValue = clean(sv.textContent); break; }
        }
      }
      out.push({
        kind,
        label: finalLabel,
        description: description || undefined,
        name: el.getAttribute('name') || undefined,
        domId: el.getAttribute('id') || undefined,
        inputType: tag === 'INPUT' ? type : undefined,
        placeholder: el.getAttribute('placeholder') || undefined,
        autocomplete: el.getAttribute('autocomplete') || undefined,
        required,
        options,
        multiple: multiple || undefined,
        group: (container?.closest('fieldset, section, [class*="section"]')?.querySelector('h2, h3, h4, legend') as HTMLElement | null)?.innerText?.trim() || undefined,
        selector: selectorFor(el, root),
        shadowHostPath: hosts.length ? hosts : undefined,
        currentValue,
        visible: usable,
        disabled: (el as HTMLInputElement).disabled || el.getAttribute('aria-disabled') === 'true' || undefined,
      });
    }

    // Button groups acting as radios (Ashby Yes/No, role=radiogroup of buttons).
    const groups = new Set<Element>();
    root.querySelectorAll('[role="radiogroup"], div, span').forEach((g) => {
      const kids = Array.from(g.children);
      if (kids.length < 2 || kids.length > 6) return;
      const btns = kids.filter((k) => (k.tagName === 'BUTTON' && (k as HTMLButtonElement).type !== 'submit') || (k.getAttribute('role') === 'radio' && k.tagName !== 'INPUT'));
      if (btns.length !== kids.length) return;
      if (btns.some((b) => clean(b.textContent).length > 40 || !clean(b.textContent))) return;
      if (g.closest('nav, [role="toolbar"], [role="tablist"], header, .select__menu, [role="listbox"]')) return;
      if (!isShown(g)) return;
      groups.add(g);
    });
    for (const g of groups) {
      const btns = Array.from(g.children);
      if (btns.some((b) => claimedButtons.has(b))) continue;
      btns.forEach((b) => claimedButtons.add(b));
      const first = btns[0];
      const near = g.closest('[data-field], .field, .form-group, fieldset, li') || g.parentElement;
      if (near?.querySelector('input[type="file"]')) continue;
      const { label, container, requiredMark } = labelFor(first, root);
      const heading = container ? headingIn(container, first) : label;
      const pressed = btns.find((b) => b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-checked') === 'true');
      const hiddenReq = container?.querySelector('input[required]');
      if (!stripReq(heading || label)) continue;
      out.push({
        kind: 'radio',
        label: stripReq(heading || label),
        required: requiredMark || !!hiddenReq,
        options: btns.map((b) => ({ label: clean(b.textContent), value: clean(b.textContent), selector: selectorFor(b, root) })),
        selector: selectorFor(g, root),
        shadowHostPath: hosts.length ? hosts : undefined,
        currentValue: pressed ? clean(pressed.textContent) : '',
        visible: true,
      });
    }
  }
  return out;
}

export interface ReaderOptions {
  includeHidden?: boolean;
}

export class DomFormReader implements FormReader {
  constructor(private readonly opts: ReaderOptions = {}) {}

  async read(page: Page): Promise<FormField[]> {
    const frames = page.frames();
    const fields: FormField[] = [];
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      if (frame.isDetached()) continue;
      await prepareFrame(frame);
      const raw = await frame.evaluate(scanFrame, { includeHidden: !!this.opts.includeHidden }).catch(() => [] as RawField[]);
      raw.forEach((r, n) => fields.push({ ...r, id: `f${i}_${n}`, frameIndex: i, frameUrl: frame.url() }));
    }
    return fields;
  }
}

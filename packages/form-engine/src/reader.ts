import type { Frame, Page } from 'playwright';
import type { FormField } from './types.js';

/**
 * Runs inside each frame. Walks the document and every open shadow root, and returns normalised fields.
 * Kept as a plain function (serialised by Playwright) so it has no imports.
 */
function readFieldsInPage(frameIndex: number): any[] {
  const w = window as any;
  w.__nmdCounter = w.__nmdCounter || 0;

  const roots: (Document | ShadowRoot)[] = [];
  const collect = (root: Document | ShadowRoot) => {
    roots.push(root);
    root.querySelectorAll('*').forEach((el) => {
      const sr = (el as HTMLElement).shadowRoot;
      if (sr) collect(sr);
    });
  };
  collect(document);
  const all = (sel: string): HTMLElement[] => roots.flatMap((r) => Array.from(r.querySelectorAll<HTMLElement>(sel)));

  const clean = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').replace(/[*✱]\s*$/, '').trim();
  const idOf = (el: HTMLElement) => {
    if (!el.dataset.nmdId) el.dataset.nmdId = `nmd-${frameIndex}-${++w.__nmdCounter}`;
    return el.dataset.nmdId;
  };
  const rootOf = (el: HTMLElement) => el.getRootNode() as Document | ShadowRoot;
  const byId = (el: HTMLElement, id: string) => rootOf(el).querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);

  const isShown = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && (r.width > 0 || r.height > 0);
  };

  const textWithout = (container: HTMLElement) => {
    const c = container.cloneNode(true) as HTMLElement;
    c.querySelectorAll('input,select,textarea,button,script,style,[role=listbox],[role=option]').forEach((n) => n.remove());
    return clean(c.textContent);
  };

  const ownLabel = (el: HTMLElement): string => {
    const lb = el.getAttribute('aria-labelledby');
    if (lb) {
      const t = clean(lb.split(/\s+/).map((i) => byId(el, i)?.textContent || '').join(' '));
      if (t) return t;
    }
    const al = clean(el.getAttribute('aria-label'));
    if (al) return al;
    if (el.id) {
      const lab = rootOf(el).querySelector<HTMLElement>(`label[for="${CSS.escape(el.id)}"]`);
      if (lab) {
        const t = textWithout(lab);
        if (t) return t;
      }
    }
    const wrap = el.closest('label') as HTMLElement | null;
    if (wrap) {
      const t = textWithout(wrap);
      if (t) return t;
    }
    return '';
  };

  const QUESTION_SEL =
    'legend,label,.label,[class*=label],[class*=Label],[class*=question],[class*=Question],[class*=title],h1,h2,h3,h4,h5,h6,p,span';
  /** Question text for a control/group with no direct label: nearest preceding label-ish text in ancestors. */
  const contextLabel = (el: HTMLElement, exclude: HTMLElement[] = []): string => {
    // Table layouts: the question lives in the previous cell of the same row.
    const cell = el.closest('td,th,dd') as HTMLElement | null;
    const prevCell = cell?.previousElementSibling as HTMLElement | null;
    if (prevCell && clean(prevCell.textContent) && !prevCell.querySelector('input,select,textarea')) return clean(prevCell.textContent);
    const fs = el.closest('fieldset');
    const legend = fs?.querySelector('legend');
    if (legend) return clean(legend.textContent);
    const grp = el.closest('[role=radiogroup],[role=group]') as HTMLElement | null;
    if (grp) {
      const t = ownLabel(grp);
      if (t) return t;
    }
    let cur: HTMLElement | null = el.parentElement;
    for (let depth = 0; cur && depth < 5; depth++, cur = cur.parentElement) {
      const cands = Array.from(cur.querySelectorAll<HTMLElement>(QUESTION_SEL)).filter(
        (c) =>
          !c.contains(el) &&
          !exclude.some((x) => c.contains(x) || x.contains(c)) &&
          !c.querySelector('input,select,textarea,button') &&
          !c.closest('label')?.querySelector('input,select,textarea'),
      );
      const before = cands.filter((c) => c.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
      const pick = (before.length ? before : cands).filter((c) => clean(c.textContent).length > 1);
      if (pick.length) {
        const c = before.length ? pick[pick.length - 1] : pick[0];
        return clean(c.textContent);
      }
    }
    return '';
  };

  const optionLabel = (el: HTMLElement): string => {
    const own = ownLabel(el);
    if (own) return own;
    const sib = el.nextSibling as any;
    if (sib && sib.textContent && clean(sib.textContent)) return clean(sib.textContent);
    const nx = el.nextElementSibling as HTMLElement | null;
    if (nx && clean(nx.textContent)) return clean(nx.textContent);
    return clean(el.getAttribute('value'));
  };

  const isRequired = (el: HTMLElement, label: string) =>
    (el as HTMLInputElement).required === true ||
    el.getAttribute('aria-required') === 'true' ||
    /\*\s*$/.test((el.id ? rootOf(el).querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : '') || '') ||
    /\*|required/i.test(label.slice(-12)) ||
    !!el.closest('[class*=required],[data-required=true]');

  const isInvalid = (el: HTMLElement) => {
    if (el.getAttribute('aria-invalid') === 'true') return true;
    const c = el.closest('[class*=error],[class*=invalid],[class*=has-error]');
    return !!c && c !== document.body;
  };

  const hintsOf = (el: HTMLElement) =>
    [el.getAttribute('name'), el.id, el.getAttribute('placeholder'), el.getAttribute('autocomplete'), el.getAttribute('data-qa'), el.getAttribute('data-testid')]
      .filter(Boolean)
      .join(' ');

  const out: any[] = [];
  const seenGroups = new Set<string>();

  const controls = all(
    'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=image]):not([type=reset]),textarea,select,[role=combobox]:not(input):not(select),[contenteditable=""],[contenteditable=true]',
  );

  for (const el of controls) {
    const tag = el.tagName.toLowerCase();
    const type = ((el as HTMLInputElement).type || '').toLowerCase();
    const isFile = type === 'file';
    const isChoice = type === 'radio' || type === 'checkbox';
    // Hidden controls are skipped unless they are styled-away choices/files whose label is visible.
    if (!isShown(el) && !isChoice && !isFile) continue;
    if (el.closest('[aria-hidden=true]') && !isChoice && !isFile) continue;

    if (isChoice) {
      const name = (el as HTMLInputElement).name;
      const grpKey = name ? `${type}:${name}:${rootOf(el) === document ? 'd' : 's'}` : `solo:${idOf(el)}`;
      if (seenGroups.has(grpKey)) continue;
      seenGroups.add(grpKey);
      const members = name
        ? all(`input[type=${type}]`).filter((m) => (m as HTMLInputElement).name === name && rootOf(m) === rootOf(el))
        : [el];
      const labelVisible = (m: HTMLElement) => {
        if (isShown(m)) return true;
        const l = m.closest('label') || (m.id ? rootOf(m).querySelector(`label[for="${CSS.escape(m.id)}"]`) : null);
        return !!l && isShown(l as HTMLElement);
      };
      if (!members.some(labelVisible)) continue;
      const options = members.map(optionLabel);
      const single = members.length === 1 && type === 'checkbox';
      const question = single ? optionLabel(el) : contextLabel(el, members) || options.join('/');
      out.push({
        id: idOf(members[0]),
        kind: type,
        label: question,
        hints: members.map(hintsOf).join(' '),
        inputType: type,
        required: members.some((m) => isRequired(m, question)),
        options,
        optionIds: members.map(idOf),
        frameIndex,
        value: '',
        checked: members.some((m) => (m as HTMLInputElement).checked),
        invalid: members.some(isInvalid),
      });
      continue;
    }

    let kind = 'text';
    if (tag === 'textarea') kind = 'textarea';
    else if (tag === 'select') kind = 'select';
    else if (isFile) kind = 'file';
    else if (type === 'date' || type === 'month') kind = 'date';
    else if (el.isContentEditable) kind = 'richtext';
    else if (
      el.getAttribute('role') === 'combobox' ||
      el.getAttribute('aria-haspopup') === 'listbox' ||
      /select__input|combobox|autocomplete/i.test(el.className?.toString() || '')
    )
      kind = 'combobox';

    const label = ownLabel(el) || clean(el.getAttribute('placeholder')) || contextLabel(el) || clean(el.getAttribute('name'));
    let options: string[] = [];
    let value = '';
    if (tag === 'select') {
      const sel = el as HTMLSelectElement;
      options = Array.from(sel.options).map((o) => clean(o.textContent));
      const cur = sel.options[sel.selectedIndex];
      value = cur && cur.value !== '' && !/^(select|choose|please|--)/i.test(clean(cur.textContent)) ? clean(cur.textContent) : '';
    } else if (kind === 'richtext') value = clean(el.textContent);
    else value = (el as HTMLInputElement).value || '';

    out.push({
      id: idOf(el),
      kind,
      label,
      hints: hintsOf(el),
      inputType: type || tag,
      required: isRequired(el, label),
      options,
      optionIds: [],
      frameIndex,
      value,
      checked: false,
      invalid: isInvalid(el),
    });
  }

  // Button-style Yes/No (Ashby): a parent whose only interactive children are buttons with yes/no text.
  const seenParents = new Set<HTMLElement>();
  for (const b of all('button')) {
    const t = clean(b.textContent);
    const p = b.parentElement;
    if (!p || seenParents.has(p) || !/^(yes|no)$/i.test(t) || !isShown(b)) continue;
    const btns = Array.from(p.querySelectorAll<HTMLElement>(':scope > button'));
    if (btns.length < 2 || !btns.every((x) => /^(yes|no)$/i.test(clean(x.textContent)))) continue;
    seenParents.add(p);
    const question = contextLabel(btns[0], btns);
    const pressed = btns.some((x) => x.getAttribute('aria-pressed') === 'true' || /active|selected/i.test(x.className));
    out.push({
      id: idOf(btns[0]),
      kind: 'radio',
      label: question,
      hints: '',
      inputType: 'button-group',
      required: !!p.closest('[class*=required]') || /\*/.test(question),
      options: btns.map((x) => clean(x.textContent)),
      optionIds: btns.map(idOf),
      frameIndex,
      value: '',
      checked: pressed,
      invalid: false,
    });
  }
  return out;
}

export async function readForm(page: Page): Promise<FormField[]> {
  const frames: Frame[] = page.frames();
  const fields: FormField[] = [];
  for (let i = 0; i < frames.length; i++) {
    try {
      // esbuild/tsx wraps named functions with __name(); make it resolvable inside the page.
      await frames[i].evaluate('window.__name = window.__name || ((f) => f)');
      const found = await frames[i].evaluate(readFieldsInPage, i);
      fields.push(...(found as FormField[]));
    } catch {
      /* detached or cross-origin-blocked frame */
    }
  }
  return fields;
}

export function frameOf(page: Page, field: FormField): Frame {
  return page.frames()[field.frameIndex] || page.mainFrame();
}

/**
 * Page-side checks shared by desktop and Android. Each function runs inside the page:
 * desktop serializes it into a frame with Playwright (`frame.evaluate(fn, arg)`), the
 * Android agent bundle calls it directly. Every function must stay self-contained
 * (no imports, no references to module scope) because of the serialization.
 */

/** Current value of a field's control, normalized per kind (`@file` for an attached file). */
export function readValueInPage(el: Element, f: { kind: string; multiple?: boolean; optionSelectors: string[] }): string {
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
    // react-select & co: the chosen value renders in a sibling "single-value" node, not in the input.
    let shell: Element | null = el;
    for (let i = 0; i < 5 && shell; i++) {
      shell = shell.parentElement;
      const sv = shell?.querySelector('[class*="single-value"], [class*="singleValue"], [class*="multi-value"]');
      if (sv) {
        if (clean(sv.textContent)) return clean(sv.textContent);
        const hidden = shell?.querySelector('input[type="hidden"]') as HTMLInputElement | null;
        if (hidden && hidden.value) return clean(hidden.value);
        break;
      }
      if (shell?.matches('[data-field], .field, form')) break;
    }
  }
  return (el as HTMLInputElement).value ?? '';
}

/** Validation messages shown in the field's own container. */
export function fieldErrorInPage(el: Element): string {
  const c = el.closest('[data-field], .field, .application-question, fieldset, .form-group, [data-automation-id^="formField"], .text-input-wrapper, .select__container, li') || el.parentElement;
  if (!c) return '';
  const errs = Array.from(c.querySelectorAll('[role="alert"], .error, .error-message, [class*="errorMessage"], [class*="error-message"], [class*="_error"], .invalid-feedback, [data-automation-id="errorMessage"]'))
    .filter((e) => {
      const r = (e as HTMLElement).getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (e.textContent || '').trim();
    })
    .map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim());
  return errs.join(' | ');
}

/** Validation messages visible anywhere in this document. */
export function pageErrorsInPage(): string[] {
  return Array.from(document.querySelectorAll('[role="alert"], .error-message, [class*="errorCallout"], [data-automation-id="errorMessage"]'))
    .filter((e) => {
      const r = (e as HTMLElement).getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (e.textContent || '').trim();
    })
    .map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim());
}

/** Sign-in, CAPTCHA and email-verification walls in this document. */
export function wallsInPage(): string[] {
  const vis = (el: Element) => {
    const r = (el as HTMLElement).getBoundingClientRect();
    const s = getComputedStyle(el as HTMLElement);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const text = (document.body?.innerText || '').toLowerCase();
  const out: string[] = [];
  const pw = Array.from(document.querySelectorAll('input[type="password"]')).some(vis);
  if (pw && /sign in|log in|login|create account|password/.test(text)) out.push('login');
  if (/sign in to apply|log in to apply|create an account to apply|register to apply|login to continue/.test(text)) out.push('login');
  const cap = Array.from(document.querySelectorAll('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="turnstile"], iframe[src*="challenges.cloudflare"], .g-recaptcha, .h-captcha, .cf-turnstile')).some(vis);
  if (cap) out.push('captcha');
  if (/verify your email|verification code|we (have )?sent (you )?(a|an) (code|email)|enter the (6-digit |)code/.test(text)) out.push('email_verification');
  return out;
}

/** The page shows an "application received" confirmation. */
export function isConfirmationInPage(): boolean {
  const t = (document.body?.innerText || '').toLowerCase();
  return /thank you for (applying|your application)|application (has been )?(submitted|received)|we have received your application|successfully submitted|applied successfully/.test(t);
}

/**
 * Best "Next" / "Submit" button in this document. A matching button inside a form that holds
 * inputs beats an "Apply now" call-to-action elsewhere on the page.
 */
export function findButtonInPage({ src, preferSubmit }: { src: string; preferSubmit: boolean }): Element | null {
  const re = new RegExp(src, 'i');
  const vis = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0 && !(el as HTMLButtonElement).disabled; };
  const cands = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"]')).filter(vis);
  const text = (el: Element) => ((el as HTMLInputElement).value && el.tagName === 'INPUT' ? (el as HTMLInputElement).value : el.textContent || '').replace(/\s+/g, ' ').trim();
  const score = (c: Element): number => {
    const t = text(c);
    if (/next|continue|back|cancel|save draft/i.test(t) && preferSubmit) return -1;
    let s = 0;
    if (re.test(t)) s += /submit|send|complete/i.test(t) || !preferSubmit ? 4 : 2;
    const form = c.closest('form');
    if (form && form.querySelector('input:not([type="hidden"]), textarea, select')) s += 2;
    if ((c as HTMLButtonElement).type === 'submit' && preferSubmit) s += 1;
    return s;
  };
  const ranked = cands.map((c) => ({ c, s: score(c) })).filter((x) => x.s >= (preferSubmit ? 3 : 4)).sort((a, b) => b.s - a.s);
  return ranked[0]?.c || null;
}

import type { Locator, Page } from 'playwright';
import { pickOptionIndex, type Answer } from './answerer.js';
import { frameOf } from './reader.js';
import type { FormField } from './types.js';

export interface WriteResult {
  ok: boolean;
  value?: string;
  reason?: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const digits = (s: string) => s.replace(/\D+/g, '');
const loc = (page: Page, f: FormField, id = f.id): Locator => frameOf(page, f).locator(`[data-nmd-id="${id}"]`).first();

async function setNative(l: Locator, value: string) {
  await l.evaluate((el: any, v: string) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, v);
    else el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }, value);
}

async function writeText(l: Locator, value: string): Promise<WriteResult> {
  await l.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
  try {
    await l.fill(value, { timeout: 3000 });
  } catch {
    await setNative(l, value).catch(() => {});
  }
  let got = await l.inputValue().catch(() => '');
  if (norm(got) !== norm(value) && digits(got) !== digits(value)) {
    await setNative(l, value).catch(() => {});
    got = await l.inputValue().catch(() => '');
  }
  await l.blur().catch(() => {});
  const ok = norm(got) === norm(value) || (digits(value).length >= 7 && digits(got) === digits(value)) || (!!got && norm(got).includes(norm(value)));
  return ok ? { ok, value: got } : { ok: false, value: got, reason: `Value did not stick (got "${got}")` };
}

async function writeRich(l: Locator, value: string): Promise<WriteResult> {
  await l.click({ timeout: 2000 }).catch(() => {});
  await l.page().keyboard.insertText(value);
  const got = ((await l.textContent().catch(() => '')) || '').trim();
  return got.includes(value.slice(0, 20)) ? { ok: true, value: got } : { ok: false, reason: 'Rich text did not accept input' };
}

async function writeSelect(l: Locator, f: FormField, a: Extract<Answer, { type: 'option' | 'text' }>): Promise<WriteResult> {
  const idx = pickOptionIndex(f.options, a.text, a.type === 'option' ? a.matcher : undefined);
  if (idx < 0) return { ok: false, reason: `No option matching "${a.text}" (options: ${f.options.slice(0, 6).join(' | ')})` };
  await l.selectOption({ index: idx }, { timeout: 3000 }).catch(async () => {
    await l.evaluate((el: any, i: number) => {
      el.selectedIndex = i;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, idx);
  });
  const got = await l.evaluate((el: any) => el.options[el.selectedIndex]?.textContent?.trim() || '');
  return norm(got) === norm(f.options[idx]) ? { ok: true, value: got } : { ok: false, reason: 'Select did not change' };
}

async function isChecked(l: Locator): Promise<boolean> {
  return l.evaluate((el: any) => {
    if (el.tagName === 'INPUT') return !!el.checked;
    return el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-checked') === 'true' || /active|selected|checked/i.test(el.className || '');
  });
}

async function clickChoice(l: Locator): Promise<boolean> {
  const isInput = await l.evaluate((el: any) => el.tagName === 'INPUT').catch(() => false);
  if (!isInput) {
    await l.click({ timeout: 2500 }).catch(() => l.evaluate((el: any) => el.click()));
    return true;
  }
  if (await isChecked(l)) return true;
  if (await l.isVisible().catch(() => false)) await l.check({ timeout: 1500 }).catch(() => {});
  if (await isChecked(l)) return true;
  // Hidden (opacity 0 / custom-styled) inputs: click the visible label instead.
  await l
    .evaluate((el: any) => {
      const root = el.getRootNode();
      const lab = el.closest('label') || (el.id ? root.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null);
      (lab || el).click();
    })
    .catch(() => {});
  if (await isChecked(l)) return true;
  await l
    .evaluate((el: any) => {
      el.checked = true;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.click?.();
    })
    .catch(() => {});
  return isChecked(l);
}

async function writeChoice(page: Page, f: FormField, a: Answer): Promise<WriteResult> {
  if (a.type === 'check') {
    const l = loc(page, f);
    return (await clickChoice(l)) ? { ok: true, value: 'checked' } : { ok: false, reason: 'Could not tick checkbox' };
  }
  if (a.type !== 'option' && a.type !== 'text') return { ok: false, reason: 'Unsupported answer for choice' };
  const idx = pickOptionIndex(f.options, a.text, a.type === 'option' ? a.matcher : undefined);
  if (idx < 0) return { ok: false, reason: `No option matching "${a.text}" (options: ${f.options.slice(0, 6).join(' | ')})` };
  const l = loc(page, f, f.optionIds[idx]);
  const ok = await clickChoice(l);
  const isButton = await l.evaluate((el: any) => el.tagName === 'BUTTON').catch(() => false);
  // Button groups give no reliable DOM state in every framework; a successful click is accepted.
  return ok || isButton ? { ok: true, value: f.options[idx] } : { ok: false, reason: `Could not select "${f.options[idx]}"` };
}

async function writeCombobox(page: Page, f: FormField, a: Extract<Answer, { type: 'option' | 'text' }>): Promise<WriteResult> {
  const l = loc(page, f);
  const frame = frameOf(page, f);
  const matcher = a.type === 'option' ? a.matcher : undefined;
  const optSel = '[role=option], [class*=select__option], [class*=option]:not([class*=options]), li[data-value]';

  const readOptions = async () => {
    const opts = frame.locator(optSel).filter({ visible: true });
    const n = await opts.count().catch(() => 0);
    const texts: string[] = [];
    for (let i = 0; i < Math.min(n, 60); i++) texts.push(((await opts.nth(i).textContent().catch(() => '')) || '').trim());
    return { opts, texts };
  };
  const tryPick = async () => {
    const { opts, texts } = await readOptions();
    const i = pickOptionIndex(texts, a.text, matcher);
    if (i < 0) return null;
    await opts.nth(i).click({ timeout: 2000 }).catch(() => opts.nth(i).evaluate((el: any) => el.click()));
    return texts[i];
  };

  await l.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
  await l.click({ timeout: 2500 }).catch(() => {});
  await page.waitForTimeout(150);
  let chosen = await tryPick();
  if (!chosen) {
    await l.fill('', { timeout: 1500 }).catch(() => {});
    await l.pressSequentially(a.text.slice(0, 14), { delay: 15 }).catch(() => {});
    await page.waitForTimeout(250);
    chosen = await tryPick();
  }
  if (!chosen) {
    await l.press('Enter').catch(() => {});
    await page.waitForTimeout(100);
  }
  const shown = await l
    .evaluate((el: any) => {
      let n = el as HTMLElement;
      for (let i = 0; i < 3 && n.parentElement; i++) n = n.parentElement;
      return `${(el as any).value || ''} ${n.textContent || ''}`;
    })
    .catch(() => '');
  const target = chosen || a.text;
  const ok = norm(shown).includes(norm(target)) || (!!matcher && matcher.test(shown));
  return ok ? { ok: true, value: target } : { ok: false, reason: `Dropdown did not accept "${a.text}"` };
}

export async function writeField(page: Page, f: FormField, a: Answer): Promise<WriteResult> {
  try {
    if (a.type === 'none') return { ok: false, reason: a.reason };
    const l = loc(page, f);
    switch (f.kind) {
      case 'text':
      case 'textarea':
      case 'date':
        return a.type === 'text' || a.type === 'option' ? writeText(l, a.text) : { ok: false, reason: 'Wrong answer type' };
      case 'richtext':
        return a.type === 'text' ? writeRich(l, a.text) : { ok: false, reason: 'Wrong answer type' };
      case 'select':
        return a.type === 'option' || a.type === 'text' ? writeSelect(l, f, a) : { ok: false, reason: 'Wrong answer type' };
      case 'combobox':
        return a.type === 'option' || a.type === 'text' ? writeCombobox(page, f, a) : { ok: false, reason: 'Wrong answer type' };
      case 'radio':
      case 'checkbox':
        return writeChoice(page, f, a);
      case 'file': {
        if (a.type !== 'file') return { ok: false, reason: 'Wrong answer type' };
        await l.setInputFiles(a.path, { timeout: 5000 });
        const n = await l.evaluate((el: any) => el.files?.length || 0);
        return n > 0 ? { ok: true, value: a.path } : { ok: false, reason: 'File input rejected the file' };
      }
    }
  } catch (e: any) {
    return { ok: false, reason: String(e?.message || e).split('\n')[0] };
  }
}

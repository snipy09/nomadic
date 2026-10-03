import type { Page } from 'playwright';
import type { FieldKind, FieldWriter, FormField, WriteResult } from '../contracts.js';
import { norm, resolveField, sleep } from '../dom.js';
import { pickOption } from '../options.js';
import { fail, readFieldValue, success, type Answered } from './common.js';

/** Native <select> (also select2, whose hidden select drives the widget via `change`). */
export class SelectWriter implements FieldWriter {
  readonly kinds: FieldKind[] = ['select'];

  async write(page: Page, field: FormField, answer: Answered): Promise<WriteResult> {
    const h = await resolveField(page, field);
    if (!h) return fail(field, 'element not found');
    try {
      const options = await h.evaluate((el: Element) => Array.from((el as HTMLSelectElement).options).map((o) => ({ text: o.text.replace(/\s+/g, ' ').trim(), value: o.value })));
      const usable = options.map((o, i) => ({ ...o, i })).filter((o) => o.value !== '');
      let idx = pickOption(usable.map((o) => o.text), answer);
      if (idx < 0) idx = pickOption(usable.map((o) => o.value), answer);
      if (idx < 0) return fail(field, `no option matches "${answer.value}"`);
      const target = usable[idx];
      await h.evaluate((el: Element, value: string) => {
        const sel = el as HTMLSelectElement;
        sel.focus();
        const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        if (desc?.set) desc.set.call(sel, value); else sel.value = value;
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        sel.blur();
      }, target.value);
      await sleep(30);
      let actual = await readFieldValue(page, field);
      if (norm(actual) !== norm(target.text)) {
        await h.selectOption({ value: target.value }, { timeout: 1500, force: true }).catch(() => {});
        actual = await readFieldValue(page, field);
      }
      return norm(actual) === norm(target.text) ? success(field, actual) : fail(field, 'selection did not stick', actual);
    } finally {
      await h.dispose().catch(() => {});
    }
  }
}

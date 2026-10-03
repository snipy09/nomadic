import type { Page } from 'playwright';
import type { FieldKind, FieldWriter, FormField, WriteResult } from '../contracts.js';
import { norm, resolveField, sleep } from '../dom.js';
import { clickLikeUser, fail, readFieldValue, success, type Answered } from './common.js';

/**
 * Checkboxes. Single: value 'true' / 'false' (both directions are enforced, so an
 * opt-in that must stay unchecked is unchecked). Group: `values` = labels to check.
 * Hidden (opacity:0) inputs are toggled through their label.
 */
export class CheckboxWriter implements FieldWriter {
  readonly kinds: FieldKind[] = ['checkbox'];

  async write(page: Page, field: FormField, answer: Answered): Promise<WriteResult> {
    const options = field.options?.length ? field.options : [{ label: field.label, value: 'on', selector: field.selector }];
    const wanted = field.multiple
      ? new Set((answer.values || answer.value.split('|')).map(norm))
      : null;
    for (const opt of options) {
      const desired = wanted ? wanted.has(norm(opt.label)) || wanted.has(norm(opt.value)) : answer.value === 'true';
      const h = await resolveField(page, field, opt.selector || field.selector);
      if (!h) return fail(field, 'checkbox not found');
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const checked = await h.evaluate((el: Element) => (el as HTMLInputElement).checked === true || el.getAttribute('aria-checked') === 'true');
          if (checked === desired) break;
          if (attempt === 0) await clickLikeUser(h, { preferLabel: true });
          else await h.click({ timeout: 1000, force: true }).catch(() => h.evaluate((el: Element) => (el as HTMLElement).click()));
          await sleep(30);
        }
      } finally {
        await h.dispose().catch(() => {});
      }
    }
    await sleep(30);
    const actual = await readFieldValue(page, field);
    if (field.multiple) {
      const got = new Set(actual.split('|').filter(Boolean).map(norm));
      const want = new Set(options.filter((o) => wanted!.has(norm(o.label)) || wanted!.has(norm(o.value))).map((o) => norm(o.label)));
      const same = got.size === want.size && [...want].every((w) => got.has(w));
      return same ? success(field, actual) : fail(field, 'checkbox group state did not stick', actual);
    }
    return actual === answer.value ? success(field, actual) : fail(field, 'checkbox state did not stick', actual);
  }
}

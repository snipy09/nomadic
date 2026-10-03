import type { ElementHandle, Page } from 'playwright';
import type { FieldKind, FieldWriter, FormField, WriteResult } from '../contracts.js';
import { norm, resolveField, sleep } from '../dom.js';
import { pickOption } from '../options.js';
import { clickLikeUser, fail, readFieldValue, success, type Answered } from './common.js';

/**
 * Radio groups: native radios (often opacity:0 behind a styled label) and
 * button groups (Ashby Yes/No, role=radio). Clicks the label for hidden inputs.
 */
export class RadioWriter implements FieldWriter {
  readonly kinds: FieldKind[] = ['radio'];

  async write(page: Page, field: FormField, answer: Answered): Promise<WriteResult> {
    const options = field.options || [];
    if (!options.length) return fail(field, 'radio group has no options');
    let idx = pickOption(options.map((o) => o.label), answer);
    if (idx < 0) idx = pickOption(options.map((o) => o.value), answer);
    if (idx < 0) return fail(field, `no option matches "${answer.value}"`);
    const opt = options[idx];
    for (let attempt = 0; attempt < 2; attempt++) {
      const h = await resolveField(page, field, opt.selector);
      if (!h) return fail(field, 'option element not found');
      try {
        await h.scrollIntoViewIfNeeded({ timeout: 800 }).catch(() => {});
        const isInput = await h.evaluate((el: Element) => el.tagName === 'INPUT');
        if (attempt === 0) await clickLikeUser(h, { preferLabel: isInput });
        else await forceCheck(h);
        await sleep(40);
        const actual = await readFieldValue(page, field);
        if (norm(actual) === norm(opt.label)) return success(field, actual);
      } finally {
        await h.dispose().catch(() => {});
      }
    }
    return fail(field, 'option did not stay selected', await readFieldValue(page, field));
  }
}

async function forceCheck(h: ElementHandle<Element>): Promise<void> {
  try {
    await h.click({ timeout: 1200, force: true });
  } catch {
    await h.evaluate((el: Element) => (el as HTMLElement).click()).catch(() => {});
  }
}

import type { ElementHandle, Page } from 'playwright';
import type { FieldKind, FieldWriter, FormField, WriteResult } from '../contracts.js';
import { norm, resolveField, sleep } from '../dom.js';
import { pickOption } from '../options.js';
import { clickLikeUser, clickVisibleOption, fail, readFieldValue, success, waitForOptions, type Answered } from './common.js';

/**
 * Custom dropdowns:
 *  - listbox buttons (Workday `button[aria-haspopup=listbox]`, options in a body portal)
 *  - input[role=combobox] (react-select, typeahead/autocomplete): type the search text,
 *    pick the best visible option; if nothing matches, clear and open the full list.
 */
export class ComboboxWriter implements FieldWriter {
  readonly kinds: FieldKind[] = ['combobox'];

  async write(page: Page, field: FormField, answer: Answered): Promise<WriteResult> {
    const h = await resolveField(page, field);
    if (!h) return fail(field, 'element not found');
    try {
      await h.scrollIntoViewIfNeeded({ timeout: 800 }).catch(() => {});
      const isButton = await h.evaluate((el: Element) => el.tagName === 'BUTTON');
      const chosen = isButton ? await this.viaButton(page, field, h, answer) : await this.viaInput(page, field, h, answer);
      if (!chosen) return fail(field, `no option matches "${answer.value}"`, await readFieldValue(page, field));
      await sleep(60);
      const actual = await readFieldValue(page, field);
      return actual !== '' && (norm(actual).includes(norm(chosen)) || norm(chosen).includes(norm(actual)))
        ? success(field, actual)
        : fail(field, 'selection did not stick', actual);
    } finally {
      await h.dispose().catch(() => {});
    }
  }

  private async viaButton(page: Page, field: FormField, h: ElementHandle<Element>, answer: Answered): Promise<string | null> {
    await clickLikeUser(h);
    const opts = await waitForOptions(page, field);
    const idx = pickOption(opts.map((o) => o.text), answer);
    if (idx < 0) {
      await page.keyboard.press('Escape').catch(() => {});
      await clickLikeUser(h); // close
      return null;
    }
    await clickVisibleOption(page, field, opts[idx].index);
    return opts[idx].text;
  }

  private async viaInput(page: Page, field: FormField, h: ElementHandle<Element>, answer: Answered): Promise<string | null> {
    const search = answer.searchText ?? answer.value;
    // 1) Static lists (react-select) open on click: pick without typing.
    await clickLikeUser(h);
    let opts = await waitForOptions(page, field, 350);
    let idx = opts.length ? pickOption(opts.map((o) => o.text), answer) : -1;
    if (idx >= 0) {
      await clickVisibleOption(page, field, opts[idx].index);
      return opts[idx].text;
    }
    // 2) Typeahead: type the search text and pick from the filtered list.
    await h.fill('', { timeout: 1000 }).catch(() => {});
    await h.type(search, { delay: 10, timeout: 3000 }).catch(() => {});
    opts = await waitForOptions(page, field, 1200);
    idx = pickOption(opts.map((o) => o.text), answer);
    if (idx < 0) {
      // open the unfiltered list
      await h.fill('', { timeout: 1000 }).catch(() => {});
      await h.focus().catch(() => {});
      await page.keyboard.press('ArrowDown').catch(() => {});
      opts = await waitForOptions(page, field, 1000);
      if (!opts.length) {
        await clickLikeUser(h);
        opts = await waitForOptions(page, field, 800);
      }
      idx = pickOption(opts.map((o) => o.text), answer);
    }
    if (idx < 0) {
      await page.keyboard.press('Escape').catch(() => {});
      return null;
    }
    await clickVisibleOption(page, field, opts[idx].index);
    return opts[idx].text;
  }
}

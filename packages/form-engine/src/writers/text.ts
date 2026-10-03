import type { Page } from 'playwright';
import type { FieldKind, FieldWriter, FormField, WriteResult } from '../contracts.js';
import { resolveField, sleep } from '../dom.js';
import { fail, readFieldValue, setNativeValue, success, valuesMatch, type Answered } from './common.js';

/**
 * Text / textarea writer.
 * 1) React-safe native setter + input/change/blur, read back after a tick.
 * 2) Fallback: real keyboard input via Playwright fill(), then blur.
 */
export class TextWriter implements FieldWriter {
  readonly kinds: FieldKind[] = ['text', 'textarea'];

  async write(page: Page, field: FormField, answer: Answered): Promise<WriteResult> {
    return writeTextLike(page, field, answer.value);
  }
}

export async function writeTextLike(page: Page, field: FormField, value: string): Promise<WriteResult> {
  const h = await resolveField(page, field);
  if (!h) return fail(field, 'element not found');
  try {
    await h.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
    await setNativeValue(h, value);
    await sleep(40);
    let actual = await readFieldValue(page, field);
    if (valuesMatch(actual, value, field.inputType)) return success(field, actual);
    await h.fill(value, { timeout: 2000 }).catch(() => {});
    await h.evaluate((el: Element) => (el as HTMLElement).blur()).catch(() => {});
    await sleep(40);
    actual = await readFieldValue(page, field);
    return valuesMatch(actual, value, field.inputType) ? success(field, actual) : fail(field, 'value did not stick', actual);
  } finally {
    await h.dispose().catch(() => {});
  }
}

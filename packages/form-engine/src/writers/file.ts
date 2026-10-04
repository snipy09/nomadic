import fs from 'fs';
import type { Page } from 'playwright';
import type { FieldKind, FieldWriter, FormField, WriteResult } from '../contracts.js';
import { frameAt, prepareFrame, resolveField } from '../dom.js';
import { fail, readFieldValue, success, type Answered } from './common.js';

/**
 * True when `filePath` is attached to the field. Some boards (new Greenhouse) remove the file input once a
 * file is chosen and show the file name instead; that counts only when the input is gone, so a second empty
 * input on the page is never taken as filled.
 */
export async function fileAttached(page: Page, field: FormField, filePath: string): Promise<boolean> {
  if ((await readFieldValue(page, field)) === '@file') return true;
  const h = await resolveField(page, field);
  if (h) {
    await h.dispose().catch(() => {});
    return false;
  }
  const name = filePath.split(/[\\/]/).pop() || '';
  const frame = frameAt(page, field.frameIndex);
  if (!name || !frame) return false;
  await prepareFrame(frame);
  return frame.evaluate((n) => (document.body?.innerText || '').includes(n), name).catch(() => false);
}

/** File inputs (works on hidden inputs behind "Attach" buttons). `answer.value` is a file path. */
export class FileWriter implements FieldWriter {
  readonly kinds: FieldKind[] = ['file'];

  async write(page: Page, field: FormField, answer: Answered): Promise<WriteResult> {
    if (!answer.value || !fs.existsSync(answer.value)) return fail(field, `file not found: ${answer.value}`);
    const h = await resolveField(page, field);
    if (!h) return (await fileAttached(page, field, answer.value)) ? success(field, '@file') : fail(field, 'element not found');
    try {
      await h.setInputFiles(answer.value, { timeout: 5000 });
      // Upload widgets may re-render a moment later (e.g. replace the input with the file name).
      for (let i = 0; i < 6; i++) {
        if (await fileAttached(page, field, answer.value)) return success(field, '@file');
        await page.waitForTimeout(250);
      }
      return fail(field, 'file was not attached', await readFieldValue(page, field));
    } catch (err) {
      return fail(field, `upload failed: ${(err as Error).message}`);
    } finally {
      await h.dispose().catch(() => {});
    }
  }
}

import fs from 'fs';
import type { Page } from 'playwright';
import type { FieldKind, FieldWriter, FormField, WriteResult } from '../contracts.js';
import { resolveField } from '../dom.js';
import { fail, readFieldValue, success, type Answered } from './common.js';

/** File inputs (works on hidden inputs behind "Attach" buttons). `answer.value` is a file path. */
export class FileWriter implements FieldWriter {
  readonly kinds: FieldKind[] = ['file'];

  async write(page: Page, field: FormField, answer: Answered): Promise<WriteResult> {
    if (!answer.value || !fs.existsSync(answer.value)) return fail(field, `file not found: ${answer.value}`);
    const h = await resolveField(page, field);
    if (!h) return fail(field, 'element not found');
    try {
      await h.setInputFiles(answer.value, { timeout: 5000 });
      const actual = await readFieldValue(page, field);
      return actual === '@file' ? success(field, actual) : fail(field, 'file was not attached', actual);
    } catch (err) {
      return fail(field, `upload failed: ${(err as Error).message}`);
    } finally {
      await h.dispose().catch(() => {});
    }
  }
}

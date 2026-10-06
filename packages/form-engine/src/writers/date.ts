import type { Page } from 'playwright';
import type { FieldKind, FieldWriter, FormField, WriteResult } from '../contracts.js';
import { fail, type Answered } from './common.js';
import { writeTextLike } from './text.js';
import { formatDate, parseDate } from '../values.js';

export { formatDate, parseDate };

export class DateWriter implements FieldWriter {
  readonly kinds: FieldKind[] = ['date'];

  async write(page: Page, field: FormField, answer: Answered): Promise<WriteResult> {
    const parsed = parseDate(answer.value);
    if (!parsed) return fail(field, `"${answer.value}" is not a calendar date`);
    return writeTextLike(page, field, formatDate(parsed, field.placeholder, field.inputType));
  }
}

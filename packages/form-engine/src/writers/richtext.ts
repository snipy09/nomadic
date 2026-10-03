import type { Page } from 'playwright';
import type { FieldKind, FieldWriter, FormField, WriteResult } from '../contracts.js';
import { norm, resolveField, sleep } from '../dom.js';
import { fail, readFieldValue, success, type Answered } from './common.js';

/** contenteditable editors (Quill, Draft.js, ProseMirror): insertText keeps the editor model in sync. */
export class RichTextWriter implements FieldWriter {
  readonly kinds: FieldKind[] = ['richtext'];

  async write(page: Page, field: FormField, answer: Answered): Promise<WriteResult> {
    const h = await resolveField(page, field);
    if (!h) return fail(field, 'element not found');
    try {
      await h.scrollIntoViewIfNeeded({ timeout: 800 }).catch(() => {});
      await h.evaluate((el: Element, v: string) => {
        const he = el as HTMLElement;
        he.focus();
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(he);
        sel?.removeAllRanges();
        sel?.addRange(range);
        const ok = document.execCommand && document.execCommand('insertText', false, v);
        if (!ok || !he.innerText.trim()) {
          he.textContent = v;
          he.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: v }));
        }
        he.blur();
      }, answer.value);
      await sleep(30);
      const actual = await readFieldValue(page, field);
      const probe = norm(answer.value).slice(0, 40);
      return norm(actual).includes(probe) ? success(field, actual) : fail(field, 'editor content did not stick', actual);
    } finally {
      await h.dispose().catch(() => {});
    }
  }
}

/**
 * Verifier: re-reads every field after writing, confirms the value stuck,
 * collects validation errors shown next to fields, and flags required fields
 * that are still empty.
 */
import type { Page } from 'playwright';
import type { FieldOutcome, FormField, Verifier, VerifyIssue } from './contracts.js';
import { prepareFrame, resolveField } from './dom.js';
import { readFieldValue } from './writers/common.js';
import { sameValue } from './values.js';
import { fieldErrorInPage, pageErrorsInPage } from './agent/inpage.js';
import { fileAttached } from './writers/file.js';

async function fieldError(page: Page, field: FormField): Promise<string> {
  const h = await resolveField(page, field);
  if (!h) return '';
  try {
    return await h.evaluate(fieldErrorInPage);
  } catch {
    return '';
  } finally {
    await h.dispose().catch(() => {});
  }
}

export async function pageErrors(page: Page): Promise<string[]> {
  const out: string[] = [];
  for (const frame of page.frames()) {
    await prepareFrame(frame);
    const errs = await frame.evaluate(pageErrorsInPage).catch(() => [] as string[]);
    out.push(...errs);
  }
  return [...new Set(out)];
}

export class DomVerifier implements Verifier {
  async verify(page: Page, outcomes: FieldOutcome[]): Promise<{ issues: VerifyIssue[]; pageErrors: string[] }> {
    const issues: VerifyIssue[] = [];
    for (const o of outcomes) {
      const f = o.field;
      if (o.status === 'filled' && f.kind === 'file') {
        const path = o.answer?.status === 'answered' ? o.answer.value : '';
        if (!(await fileAttached(page, f, path))) issues.push({ fieldId: f.id, kind: 'value_mismatch', message: 'file is no longer attached' });
      } else if (o.status === 'filled') {
        const actual = await readFieldValue(page, f);
        const expected = o.write?.actual ?? (o.answer?.status === 'answered' ? o.answer.value : '');
        if (!sameValue(f, actual, expected)) {
          issues.push({ fieldId: f.id, kind: 'value_mismatch', message: `expected "${expected.slice(0, 60)}", found "${actual.slice(0, 60)}"` });
          continue;
        }
        const err = await fieldError(page, f);
        if (err) issues.push({ fieldId: f.id, kind: 'validation_error', message: err });
      } else if (f.required && o.status !== 'skipped') {
        const actual = await readFieldValue(page, f);
        if (!actual || actual === 'false') issues.push({ fieldId: f.id, kind: 'required_empty', message: o.reason || 'required field is empty' });
      }
    }
    return { issues, pageErrors: await pageErrors(page) };
  }
}

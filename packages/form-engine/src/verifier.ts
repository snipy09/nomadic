/**
 * Verifier: re-reads every field after writing, confirms the value stuck,
 * collects validation errors shown next to fields, and flags required fields
 * that are still empty.
 */
import type { Page } from 'playwright';
import type { FieldOutcome, FormField, Verifier, VerifyIssue } from './contracts.js';
import { norm, prepareFrame, resolveField } from './dom.js';
import { readFieldValue, valuesMatch } from './writers/common.js';

async function fieldError(page: Page, field: FormField): Promise<string> {
  const h = await resolveField(page, field);
  if (!h) return '';
  try {
    return await h.evaluate((el: Element) => {
      const c = el.closest('[data-field], .field, .application-question, fieldset, .form-group, [data-automation-id^="formField"], .text-input-wrapper, .select__container, li') || el.parentElement;
      if (!c) return '';
      const errs = Array.from(c.querySelectorAll('[role="alert"], .error, .error-message, [class*="errorMessage"], [class*="error-message"], [class*="_error"], .invalid-feedback, [data-automation-id="errorMessage"]'))
        .filter((e) => {
          const r = (e as HTMLElement).getBoundingClientRect();
          return r.width > 0 && r.height > 0 && (e.textContent || '').trim();
        })
        .map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim());
      return errs.join(' | ');
    });
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
    const errs = await frame.evaluate(() => Array.from(document.querySelectorAll('[role="alert"], .error-message, [class*="errorCallout"], [data-automation-id="errorMessage"]'))
      .filter((e) => {
        const r = (e as HTMLElement).getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (e.textContent || '').trim();
      })
      .map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim())).catch(() => [] as string[]);
    out.push(...errs);
  }
  return [...new Set(out)];
}

function sameValue(field: FormField, actual: string, expected: string): boolean {
  if (field.kind === 'file') return actual === '@file';
  if (field.kind === 'checkbox' && !field.multiple) return actual === expected;
  if (field.kind === 'checkbox') {
    const a = new Set(actual.split('|').filter(Boolean).map(norm));
    const e = new Set(expected.split('|').filter(Boolean).map(norm));
    return a.size === e.size && [...e].every((x) => a.has(x));
  }
  if (['select', 'radio', 'combobox'].includes(field.kind)) return actual !== '' && (norm(actual) === norm(expected) || norm(actual).includes(norm(expected)) || norm(expected).includes(norm(actual)));
  if (field.kind === 'richtext') return norm(actual).includes(norm(expected).slice(0, 40));
  return valuesMatch(actual, expected, field.inputType);
}

export class DomVerifier implements Verifier {
  async verify(page: Page, outcomes: FieldOutcome[]): Promise<{ issues: VerifyIssue[]; pageErrors: string[] }> {
    const issues: VerifyIssue[] = [];
    for (const o of outcomes) {
      const f = o.field;
      if (o.status === 'filled') {
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

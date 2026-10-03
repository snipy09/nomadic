import type { BatchSnapshot, BatchSnapshotField, BatchTarget, FillReport } from '../../shared/ipc.js';

type Outcome = FillReport['fields'][number];

/** Minimal slice of automation's `ApplyResult` the snapshot needs. */
export interface PrefillResult {
  success: boolean;
  submitted: boolean;
  prefilled: boolean;
  captchaDetected: boolean;
  requiresLogin?: boolean;
  error?: string;
  report?: FillReport;
}

function displayValue(o: Outcome): string {
  const a = o.answer;
  if (a?.status === 'answered') {
    if (o.field.kind === 'file') return a.value.split(/[\\/]/).pop() || 'file';
    if (a.values?.length) return a.values.join('|');
    return a.value;
  }
  // Left as the portal had it (e.g. already filled on the page).
  return o.status === 'skipped' ? o.field.currentValue ?? '' : '';
}

/** One reviewable field per form question, from the engine's own fill report. */
export function outcomeToField(o: Outcome, key: string): BatchSnapshotField {
  const a = o.answer;
  return {
    fieldKey: key,
    label: o.field.label?.trim() || o.field.name || o.field.placeholder || 'Unlabelled field',
    value: displayValue(o),
    fieldType: o.field.kind,
    required: o.field.required,
    status: o.status,
    source: a?.status === 'answered' ? a.source : undefined,
    confidence: o.classification?.confidence,
    reason: o.reason,
    options: o.field.options?.map((opt) => opt.label).filter(Boolean),
    multiple: o.field.multiple,
  };
}

/**
 * Turn a pre-fill result into the snapshot the candidate reviews. Status is derived from
 * what the engine reported, never assumed: walls and unresolved required fields need the
 * candidate; no report or no fields means the form could not be filled.
 */
export function toSnapshot(
  id: string,
  target: BatchTarget,
  result: PrefillResult | null,
  held: boolean,
  keyOf: (o: Outcome) => string,
  thrown?: string
): BatchSnapshot {
  const base = {
    id,
    company: target.company?.trim() || hostOf(target.url),
    jobTitle: target.title?.trim() || 'Application',
    applyUrl: target.url,
  };
  const report = result?.report;
  if (!result || !report || report.fields.length === 0) {
    return {
      ...base,
      fields: report ? report.fields.map((o) => outcomeToField(o, keyOf(o))) : [],
      status: 'failed',
      submittable: false,
      walls: report?.walls ?? (result?.captchaDetected ? ['captcha'] : result?.requiresLogin ? ['login'] : []),
      pageErrors: report?.pageErrors ?? [],
      errorMessage: thrown || result?.error || 'No application form was found on this page.',
    };
  }
  const walls = [...report.walls];
  if (result.captchaDetected && !walls.includes('captcha')) walls.push('captcha');
  if (result.requiresLogin && !walls.includes('login')) walls.push('login');
  const needsAttention = walls.length > 0 || report.unresolvedRequired.length > 0 || !held;
  return {
    ...base,
    fields: report.fields.map((o) => outcomeToField(o, keyOf(o))),
    status: needsAttention ? 'needs_attention' : 'ready',
    submittable: held && walls.length === 0,
    walls,
    pageErrors: report.pageErrors,
    errorMessage: result.error,
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Application';
  }
}

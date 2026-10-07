import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

import { toSnapshot, type PrefillResult } from '../services/batch-review';
import { validateArgs } from '../ipc/handle';
import * as schemas from '../ipc/schemas';
import type { FillReport } from '../../shared/ipc';

type Outcome = FillReport['fields'][number];

const outcome = (over: Partial<Outcome> & { label: string }): Outcome => ({
  field: { id: over.label, kind: 'text', label: over.label, required: true, selector: '#x', frameIndex: 0, visible: true },
  status: 'filled',
  attempts: 1,
  ...over,
} as Outcome);

const report = (fields: Outcome[], over: Partial<FillReport> = {}): FillReport => ({
  url: 'https://a.co/1', startedAt: '', durationMs: 1, fields,
  filled: fields.filter((f) => f.status === 'filled').length, needsUser: 0, failed: 0, skipped: 0,
  unresolvedRequired: fields.filter((f) => f.field.required && (f.status === 'needs_user' || f.status === 'failed')),
  pageErrors: [], llmCalls: 0, walls: [], readyToSubmit: true, ...over,
});

const ok = (r: FillReport): PrefillResult => ({ success: true, submitted: false, prefilled: true, captchaDetected: false, report: r });
const target = { url: 'https://www.acme.co/jobs/1', company: 'Acme', title: 'Frontend Developer' };
const keyOf = (o: Outcome) => `k_${o.field.label}`;

describe('batch review snapshots', () => {
  it('maps the engine report field by field with value, source and confidence', () => {
    const email = outcome({ label: 'Email', answer: { fieldId: 'Email', status: 'answered', value: 'a@b.co', source: 'profile' }, classification: { fieldId: 'Email', questionType: 'profile', rule: 'r', confidence: 0.9 } });
    const cv = outcome({ label: 'Resume', field: { id: 'cv', kind: 'file', label: 'Resume', required: true, selector: '#cv', frameIndex: 0, visible: true }, answer: { fieldId: 'cv', status: 'answered', value: 'C:\\docs\\cv.pdf', source: 'profile' } });
    const s = toSnapshot('id1', target, ok(report([email, cv])), true, keyOf);
    expect(s.status).toBe('ready');
    expect(s.submittable).toBe(true);
    expect(s.fields[0]).toMatchObject({ fieldKey: 'k_Email', label: 'Email', value: 'a@b.co', source: 'profile', confidence: 0.9, status: 'filled', required: true });
    expect(s.fields[1].value).toBe('cv.pdf');
  });

  it('flags unresolved required fields and walls as needing the user', () => {
    const notice = outcome({ label: 'Notice', status: 'needs_user', reason: 'no saved answer', answer: { fieldId: 'Notice', status: 'needs_user', reason: 'no saved answer' } });
    const needs = toSnapshot('id1', target, ok(report([notice])), true, keyOf);
    expect(needs.status).toBe('needs_attention');
    expect(needs.fields[0]).toMatchObject({ value: '', status: 'needs_user', reason: 'no saved answer' });

    const walled = toSnapshot('id1', target, { ...ok(report([outcome({ label: 'Email' })], { walls: ['captcha'] })), captchaDetected: true }, false, keyOf);
    expect(walled.status).toBe('needs_attention');
    expect(walled.submittable).toBe(false);
    expect(walled.walls).toEqual(['captcha']);
  });

  it('is not submittable when the form was not held open for review', () => {
    const s = toSnapshot('id1', target, ok(report([outcome({ label: 'Email' })])), false, keyOf);
    expect(s.submittable).toBe(false);
    expect(s.status).toBe('needs_attention');
  });

  it('reports failures instead of inventing fields', () => {
    const none = toSnapshot('id1', { url: 'https://www.beta.co/x' }, { success: false, submitted: false, prefilled: false, captchaDetected: false, error: 'Job posting closed or not found (404)' }, false, keyOf);
    expect(none).toMatchObject({ status: 'failed', submittable: false, fields: [], errorMessage: 'Job posting closed or not found (404)', company: 'beta.co' });
    const thrown = toSnapshot('id2', target, null, false, keyOf, 'Chrome not found');
    expect(thrown.errorMessage).toBe('Chrome not found');
  });
});

describe('batch IPC validation', () => {
  it('accepts reviewed ids and the keep option', () => {
    expect(() => validateArgs('submit-all-batch-copilot', schemas.batchOverridesArgs, [{ app_1: { q_x: 'y' } }, ['app_1']])).not.toThrow();
    expect(() => validateArgs('submit-all-batch-copilot', schemas.batchOverridesArgs, [])).not.toThrow();
    expect(() => validateArgs('start-batch-copilot', schemas.batchTargetsArgs, [[{ url: 'https://a.co' }], { keep: true }])).not.toThrow();
  });

  it('rejects malformed ids, values and options', () => {
    expect(() => validateArgs('submit-all-batch-copilot', schemas.batchOverridesArgs, [undefined, 'app_1'])).toThrow(/arg1/);
    expect(() => validateArgs('submit-all-batch-copilot', schemas.batchOverridesArgs, [undefined, [42]])).toThrow(/arg1/);
    expect(() => validateArgs('submit-all-batch-copilot', schemas.batchOverridesArgs, [{ app_1: { q: 1 } }])).toThrow(/arg0/);
    expect(() => validateArgs('submit-all-batch-copilot', schemas.batchOverridesArgs, [undefined, Array.from({ length: 51 }, (_, i) => `a${i}`)])).toThrow(/arg1/);
    expect(() => validateArgs('start-batch-copilot', schemas.batchTargetsArgs, [[{ url: 'https://a.co' }], { keep: true, autoSubmit: true }])).toThrow(/arg1/);
  });
});

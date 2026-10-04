import { describe, expect, it, vi } from 'vitest';
import { outcomeKey, submitReviewedApplication, writeReviewedValues } from '../apply-flow.js';
import type { FieldOutcome, FillReport, FormField } from '../../../form-engine/src/index.js';

const fieldOf = (label: string, over: Partial<FormField> = {}): FormField => ({ id: label, kind: 'text', label, required: true, selector: `#${label}`, frameIndex: 0, visible: true, ...over });

function makeReport(fields: FieldOutcome[]): FillReport {
  const unresolvedRequired = fields.filter((o) => o.field.required && (o.status === 'needs_user' || o.status === 'failed'));
  return { url: 'https://a.co', startedAt: '', durationMs: 0, fields, filled: 0, needsUser: 0, failed: 0, skipped: 0, unresolvedRequired, pageErrors: [], llmCalls: 0, walls: [], readyToSubmit: unresolvedRequired.length === 0 };
}

function setup(writeOk = true) {
  const email: FieldOutcome = { field: fieldOf('Email'), status: 'filled', attempts: 1, answer: { fieldId: 'Email', status: 'answered', value: 'a@b.co', source: 'profile', fingerprint: 'q_email' } };
  const notice: FieldOutcome = { field: fieldOf('Notice'), status: 'needs_user', attempts: 1, reason: 'no answer', answer: { fieldId: 'Notice', status: 'needs_user', reason: 'no answer', fingerprint: 'q_notice' } };
  const cv: FieldOutcome = { field: fieldOf('Resume', { kind: 'file' }), status: 'filled', attempts: 1, answer: { fieldId: 'Resume', status: 'answered', value: 'cv.pdf', source: 'profile', fingerprint: 'q_cv' } };
  const report = makeReport([email, notice, cv]);
  const write = vi.fn(async (_page: unknown, field: FormField, _answer?: unknown) => (writeOk ? { fieldId: field.id, ok: true } : { fieldId: field.id, ok: false, error: 'element not found' }));
  const engine = {
    writers: new Map([['text', { kinds: ['text'], write }], ['file', { kinds: ['file'], write }]]) as any,
    emit: vi.fn(),
    submit: vi.fn().mockResolvedValue({ submitted: true, blocked: false, confirmed: true, reasons: [] }),
  };
  const page = { isClosed: () => false, url: () => 'https://a.co', frames: () => { throw new Error('no frames in test'); } } as any;
  return { report, engine, page, write };
}

const Engine = { isPageConfirmedSubmission: vi.fn().mockResolvedValue(true), emitStatus: vi.fn().mockResolvedValue(undefined) } as any;

describe('review then submit', () => {
  it('keys outcomes by the answer fingerprint', () => {
    const { report } = setup();
    expect(report.fields.map(outcomeKey)).toEqual(['q_email', 'q_notice', 'q_cv']);
  });

  it('writes only changed or missing values and never rewrites files', async () => {
    const { report, engine, page, write } = setup();
    const res = await writeReviewedValues(page, engine, report, { q_email: 'a@b.co', q_notice: '30 days', q_cv: 'other.pdf' });
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][1].label).toBe('Notice');
    expect(write.mock.calls[0][2]).toMatchObject({ value: '30 days', source: 'custom' });
    expect(res.written).toBe(1);
    expect(report.readyToSubmit).toBe(true);
    expect(report.unresolvedRequired).toEqual([]);
  });

  it('keeps a field unresolved when writing the reviewed value fails', async () => {
    const { report, engine, page } = setup(false);
    const res = await writeReviewedValues(page, engine, report, { q_notice: '30 days' });
    expect(res.errors[0]).toMatch(/Notice: element not found/);
    expect(report.readyToSubmit).toBe(false);
  });

  it('refuses to submit while a required field is unresolved', async () => {
    const { report, engine, page } = setup();
    const res = await submitReviewedApplication(Engine, { url: 'https://a.co', page, engine: engine as any, report }, {});
    expect(res.submitted).toBe(false);
    expect(res.error).toMatch(/Required fields still need you: Notice/);
    expect(engine.submit).not.toHaveBeenCalled();
  });

  it('refuses when the held tab was closed', async () => {
    const { report, engine, page } = setup();
    page.isClosed = () => true;
    const res = await submitReviewedApplication(Engine, { url: 'https://a.co', page, engine: engine as any, report }, { q_notice: 'x' });
    expect(res.submitted).toBe(false);
    expect(res.error).toMatch(/tab was closed/);
  });

  it('submits the same tab once the reviewed values are written', async () => {
    const { report, engine, page } = setup();
    const res = await submitReviewedApplication(Engine, { url: 'https://a.co', page, engine: engine as any, report }, { q_notice: '30 days' });
    expect(engine.submit).toHaveBeenCalledWith(page, report);
    expect(res).toMatchObject({ submitted: true, success: true, error: undefined });
  });
});

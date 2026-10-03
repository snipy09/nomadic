import { describe, expect, it } from 'vitest';
import type { BatchSnapshot, BatchSnapshotField } from '../../shared/ipc';
import {
  appStatus,
  attentionMessage,
  buildOverrides,
  canSubmit,
  finishedCount,
  reviewedIds,
  runReducer,
  startRun,
  unresolvedFields,
  type RunState,
} from '../features/apply/runModel';

const field = (over: Partial<BatchSnapshotField> = {}): BatchSnapshotField => ({
  fieldKey: 'q_email', label: 'Email', value: 'a@b.co', fieldType: 'text', required: true, status: 'filled', source: 'profile', confidence: 0.95, ...over,
});

const snap = (url: string, over: Partial<BatchSnapshot> = {}): BatchSnapshot => ({
  id: `id-${url}`, company: 'Acme', jobTitle: 'Dev', applyUrl: url, fields: [field()], status: 'ready', submittable: true, walls: [], pageErrors: [], ...over,
});

const targets = [{ url: 'https://a.co/1', company: 'Acme' }, { url: 'https://b.co/2', company: 'Beta' }];

function reviewState(snaps: BatchSnapshot[]): RunState {
  return runReducer(startRun(targets), { type: 'fillDone', snapshots: snaps });
}

describe('apply run model', () => {
  it('dedupes targets and starts every application queued', () => {
    const s = startRun([...targets, targets[0]]);
    expect(s.stage).toBe('filling');
    expect(s.apps.map((a) => a.url)).toEqual(['https://a.co/1', 'https://b.co/2']);
    expect(s.apps.every((a) => appStatus(a) === 'queued')).toBe(true);
  });

  it('folds live field events into the right application', () => {
    let s = startRun(targets);
    s = runReducer(s, {
      type: 'progress',
      event: { log: '', url: 'https://b.co/2', statusEvent: { phase: 'filling', message: 'Filled "Email"', colorState: 'green', formEvent: { type: 'field_filled', fieldId: 'f1', label: 'Email', kind: 'text', value: 'a@b.co', source: 'profile', attempt: 1 } } },
    });
    expect(appStatus(s.apps[0])).toBe('queued');
    expect(appStatus(s.apps[1])).toBe('filling');
    expect(s.apps[1].live).toEqual([{ key: 'f1', label: 'Email', state: 'filled', value: 'a@b.co', source: 'profile' }]);
    expect(finishedCount(s)).toBe(0);
  });

  it('records a wall the portal puts in front of the user while filling', () => {
    const s = runReducer(startRun(targets), {
      type: 'progress',
      event: { log: '', url: 'https://a.co/1', statusEvent: { phase: 'user_input_required', message: 'Account Required', colorState: 'red', actionRequired: 'Sign in to Workday' } },
    });
    expect(s.apps[0].waitingOnUser).toBe('Sign in to Workday');
  });

  it('takes a snapshot pushed with a progress event before the whole run ends', () => {
    const s = runReducer(startRun(targets), { type: 'progress', event: { log: '', url: 'https://a.co/1', statusEvent: { phase: 'user_input_required', message: 'x', colorState: 'green' }, snapshot: snap('https://a.co/1') } });
    expect(appStatus(s.apps[0])).toBe('ready');
    expect(finishedCount(s)).toBe(1);
    expect(s.stage).toBe('filling');
  });

  it('marks applications without a snapshot as failed with the reason', () => {
    const s = runReducer(startRun(targets), { type: 'fillDone', error: 'Portal blocked' });
    expect(s.stage).toBe('review');
    expect(s.apps.map(appStatus)).toEqual(['failed', 'failed']);
    expect(attentionMessage(s.apps[0])).toBe('Portal blocked');
  });

  it('never lets an application be approved while required fields need the user', () => {
    const needs = field({ fieldKey: 'q_notice', label: 'Notice period', value: '', status: 'needs_user', source: undefined, reason: 'no saved answer' });
    let s = reviewState([snap('https://a.co/1', { status: 'needs_attention', fields: [field(), needs] }), snap('https://b.co/2')]);
    expect(appStatus(s.apps[0])).toBe('needs_you');
    expect(unresolvedFields(s.apps[0]).map((f) => f.label)).toEqual(['Notice period']);

    s = runReducer(s, { type: 'approve', url: 'https://a.co/1', approved: true });
    expect(s.apps[0].approved).toBe(false);

    s = runReducer(s, { type: 'edit', url: 'https://a.co/1', key: 'q_notice', value: '30 days' });
    expect(appStatus(s.apps[0])).toBe('ready');
    s = runReducer(s, { type: 'approve', url: 'https://a.co/1', approved: true });
    expect(s.apps[0].approved).toBe(true);

    // Clearing the answer again withdraws the approval.
    s = runReducer(s, { type: 'edit', url: 'https://a.co/1', key: 'q_notice', value: ' ' });
    expect(s.apps[0].approved).toBe(false);
  });

  it('requires a required checkbox to be ticked', () => {
    const consent = field({ fieldKey: 'q_consent', label: 'I agree', value: '', fieldType: 'checkbox', status: 'needs_user' });
    let s = reviewState([snap('https://a.co/1', { fields: [consent] }), snap('https://b.co/2')]);
    s = runReducer(s, { type: 'edit', url: 'https://a.co/1', key: 'q_consent', value: 'false' });
    expect(appStatus(s.apps[0])).toBe('needs_you');
    s = runReducer(s, { type: 'edit', url: 'https://a.co/1', key: 'q_consent', value: 'true' });
    expect(appStatus(s.apps[0])).toBe('ready');
  });

  it('treats walls and forms that are no longer held as needing the user', () => {
    const s = reviewState([snap('https://a.co/1', { walls: ['captcha'], submittable: false, status: 'needs_attention' }), snap('https://b.co/2', { submittable: false })]);
    expect(s.apps.map(appStatus)).toEqual(['needs_you', 'needs_you']);
    expect(attentionMessage(s.apps[0])).toMatch(/solve the CAPTCHA/);
  });

  it('submits nothing until the user reviews, and only the reviewed subset after', () => {
    let s = reviewState([snap('https://a.co/1'), snap('https://b.co/2')]);
    expect(appStatus(s.apps[0])).toBe('ready');
    expect(reviewedIds(s)).toEqual([]);
    expect(canSubmit(s)).toBe(false);
    expect(runReducer(s, { type: 'submitStart', ids: ['id-https://a.co/1'] })).toBe(s);

    s = runReducer(s, { type: 'approve', url: 'https://b.co/2', approved: true });
    expect(reviewedIds(s)).toEqual(['id-https://b.co/2']);
    expect(canSubmit(s)).toBe(true);

    s = runReducer(s, { type: 'skip', url: 'https://b.co/2', skipped: true });
    expect(reviewedIds(s)).toEqual([]);
    expect(appStatus(s.apps[1])).toBe('skipped');
  });

  it('cannot submit while a retry is still filling', () => {
    let s = reviewState([snap('https://a.co/1'), snap('https://b.co/2', { status: 'failed', submittable: false, fields: [] })]);
    s = runReducer(s, { type: 'approve', url: 'https://a.co/1', approved: true });
    s = runReducer(s, { type: 'retryStart', url: 'https://b.co/2' });
    expect(appStatus(s.apps[1])).toBe('filling');
    expect(canSubmit(s)).toBe(false);
    s = runReducer(s, { type: 'retryDone', url: 'https://b.co/2', snapshot: snap('https://b.co/2') });
    expect(canSubmit(s)).toBe(true);
  });

  it('sends only changed or user-supplied values, never files', () => {
    const fields = [
      field(),
      field({ fieldKey: 'q_city', label: 'City', value: 'Pune' }),
      field({ fieldKey: 'q_notice', label: 'Notice', value: '', status: 'needs_user' }),
      field({ fieldKey: 'q_cv', label: 'Resume', value: 'cv.pdf', fieldType: 'file' }),
    ];
    let s = reviewState([snap('https://a.co/1', { fields }), snap('https://b.co/2')]);
    s = runReducer(s, { type: 'edit', url: 'https://a.co/1', key: 'q_email', value: 'a@b.co' });
    s = runReducer(s, { type: 'edit', url: 'https://a.co/1', key: 'q_city', value: 'Mumbai' });
    s = runReducer(s, { type: 'edit', url: 'https://a.co/1', key: 'q_notice', value: '15 days' });
    s = runReducer(s, { type: 'edit', url: 'https://a.co/1', key: 'q_cv', value: 'other.pdf' });
    expect(buildOverrides(s, ['id-https://a.co/1', 'id-https://b.co/2'])).toEqual({ 'id-https://a.co/1': { q_city: 'Mumbai', q_notice: '15 days' } });
    expect(buildOverrides(s, ['id-https://b.co/2'])).toEqual({});
  });

  it('maps per-application submit results, and blames the whole call when it fails', () => {
    let s = reviewState([snap('https://a.co/1'), snap('https://b.co/2')]);
    s = runReducer(s, { type: 'approve', url: 'https://a.co/1', approved: true });
    s = runReducer(s, { type: 'approve', url: 'https://b.co/2', approved: true });
    const ids = reviewedIds(s);
    const submitting = runReducer(s, { type: 'submitStart', ids });
    expect(submitting.apps.map(appStatus)).toEqual(['submitting', 'submitting']);

    const done = runReducer(submitting, {
      type: 'submitDone', ids,
      result: { success: true, applied: 1, failed: 1, results: [{ id: ids[0], submitted: true, confirmed: true }, { id: ids[1], submitted: false, confirmed: false, error: 'Required fields still need you: Phone' }] },
    });
    expect(done.stage).toBe('done');
    expect(done.apps.map(appStatus)).toEqual(['submitted', 'not_submitted']);
    expect(done.apps[1].result?.error).toMatch(/Phone/);

    const failed = runReducer(submitting, { type: 'submitDone', ids, result: { success: false, error: 'No master profile saved.' } });
    expect(failed.apps.map((a) => a.result?.error)).toEqual(['No master profile saved.', 'No master profile saved.']);
  });

  it('ignores edits once the run has moved past review', () => {
    let s = reviewState([snap('https://a.co/1'), snap('https://b.co/2')]);
    s = runReducer(s, { type: 'cancel' });
    expect(s.stage).toBe('cancelled');
    expect(runReducer(s, { type: 'edit', url: 'https://a.co/1', key: 'q_email', value: 'x' })).toBe(s);
  });
});

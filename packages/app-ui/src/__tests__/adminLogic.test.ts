import { describe, expect, it } from 'vitest';
import {
  allowedLessonStatuses, buildSourceHealth, describeChange, expiryLabel, formatDuration, formatRelative, fromDateInput,
  lessonDraftChanged, linkCheckPassed, parseKeyPoints, resourceStatusOptions, toDateInput, validateLessonDraft,
  validatePlanChange, validateReason,
} from '../features/admin/adminLogic';
import type { AdminResourceItem, ScrapeSourceHealth } from '@nomadic/app-core/shared/admin';

describe('validateReason', () => {
  it('requires 3 to 500 characters after trimming', () => {
    expect(validateReason('  ab ')).toMatch(/at least 3/);
    expect(validateReason('Ticket 42')).toBe(null);
    expect(validateReason('x'.repeat(501))).toMatch(/under 500/);
  });
});

describe('expiry dates', () => {
  it('round-trips a local date through the date input', () => {
    const iso = fromDateInput('2030-05-17');
    expect(iso).not.toBe(null);
    expect(toDateInput(iso)).toBe('2030-05-17');
    expect(fromDateInput('')).toBe(null);
    expect(fromDateInput('17/05/2030')).toBe(null);
    expect(toDateInput(null)).toBe('');
  });

  it('accepts no expiry or a future date, never a past one; lifetime ignores the date', () => {
    const now = new Date('2026-10-03T12:00:00');
    expect(validatePlanChange('pro', '', now)).toBe(null);
    expect(validatePlanChange('pro', '2026-12-01', now)).toBe(null);
    expect(validatePlanChange('pro', '2026-10-01', now)).toMatch(/future/);
    expect(validatePlanChange('lifetime', '2020-01-01', now)).toBe(null);
  });

  it('labels expiry state', () => {
    const now = new Date('2026-10-03T12:00:00Z').getTime();
    expect(expiryLabel(null, now)).toEqual({ text: 'No expiry', tone: 'neutral' });
    expect(expiryLabel('2026-10-01T00:00:00Z', now).tone).toBe('danger');
    expect(expiryLabel('2026-10-05T00:00:00Z', now).tone).toBe('warning');
    expect(expiryLabel('2027-01-01T00:00:00Z', now).tone).toBe('neutral');
  });
});

describe('formatting', () => {
  it('formats relative times and durations', () => {
    const now = new Date('2026-10-03T12:00:00Z').getTime();
    expect(formatRelative(null, now)).toBe('Never');
    expect(formatRelative('2026-10-03T11:59:30Z', now)).toBe('Just now');
    expect(formatRelative('2026-10-03T11:30:00Z', now)).toBe('30 min ago');
    expect(formatRelative('2026-10-03T09:00:00Z', now)).toBe('3 h ago');
    expect(formatRelative('2026-09-26T12:00:00Z', now)).toBe('7 days ago');
    expect(formatDuration(450)).toBe('450 ms');
    expect(formatDuration(2500)).toBe('2.5 s');
    expect(formatDuration(125_000)).toBe('2 min 5 s');
  });
});

describe('describeChange', () => {
  it('describes plan, status, lesson and resource changes from before/after', () => {
    expect(describeChange({ action: 'user.plan_changed', before: { tier: 'trial', expires_at: null }, after: { tier: 'pro', expires_at: null } }))
      .toBe('Free trial to Pro');
    expect(describeChange({ action: 'user.plan_changed', before: { tier: 'pro', expires_at: null }, after: { tier: 'pro', expires_at: '2030-01-01T00:00:00Z' } }))
      .toMatch(/^Pro to Pro, expiry none to /);
    expect(describeChange({ action: 'user.suspended', before: { status: 'active' }, after: { status: 'suspended', sessions_ended: 2 } }))
      .toBe('Signed out of 2 devices');
    expect(describeChange({ action: 'lesson.edited', before: { version: 1, status: 'draft' }, after: { version: 2, status: 'review', changed: ['summary_md', 'status'] } }))
      .toBe('v1 to v2 (text, status), draft to review');
    expect(describeChange({ action: 'resource.status_changed', before: { version: 1, status: 'broken' }, after: { version: 2, status: 'retired' } }))
      .toBe('broken to retired (v1 to v2)');
    expect(describeChange({ action: 'something.new', before: null, after: null })).toBe('');
  });
});

describe('buildSourceHealth', () => {
  const src = (over: Partial<ScrapeSourceHealth>): ScrapeSourceHealth => ({
    source: 's', runs: 2, failures: 0, lastRunAt: 'x', lastStatus: 'ok', lastOkAt: 'x', lastError: null,
    fetched: 0, upserted: 0, linkFailed: 0, avgDurationMs: 0, ...over,
  });

  it('puts failing sources first and flags stale sources that still have live jobs', () => {
    const views = buildSourceHealth(
      [src({ source: 'naukri' }), src({ source: 'internshala', failures: 1, lastStatus: 'error', lastError: 'HTTP 503' }), src({ source: 'ats', failures: 1 })],
      { naukri: 10, legacy: 4 },
    );
    expect(views.map((v) => [v.source, v.label])).toEqual([
      ['internshala', 'Failing'],
      ['ats', 'Recovered'],
      ['legacy', 'No recent runs'],
      ['naukri', 'Healthy'],
    ]);
    expect(views.find((v) => v.source === 'naukri')?.activeJobs).toBe(10);
    expect(views[0].failureRate).toBe(0.5);
  });
});

describe('content rules (mirror migration 014)', () => {
  it('only offers allowed lesson status transitions', () => {
    expect(allowedLessonStatuses('draft')).toEqual(['draft', 'review', 'archived']);
    expect(allowedLessonStatuses('review')).toContain('published');
    expect(allowedLessonStatuses('draft')).not.toContain('published');
    expect(allowedLessonStatuses('archived')).toEqual(['archived', 'draft']);
  });

  it('only allows active for resources that passed the link check', () => {
    const r = { lastChecked: '2026-10-01T00:00:00Z', httpStatus: 200 } as AdminResourceItem;
    expect(linkCheckPassed(r)).toBe(true);
    expect(linkCheckPassed({ ...r, httpStatus: 404 })).toBe(false);
    expect(linkCheckPassed({ ...r, lastChecked: null })).toBe(false);
    const opts = resourceStatusOptions({ ...r, httpStatus: 500 } as AdminResourceItem);
    expect(opts.find((o) => o.value === 'active')?.disabled).toBe(true);
    expect(opts.find((o) => o.value === 'retired')?.disabled).toBe(false);
  });

  it('validates lesson drafts: required fields, no links, bounded key points', () => {
    const ok = { title: 'Arrays', summaryMd: 'Arrays hold items.', keyPoints: 'One\nTwo', status: 'draft' as const };
    expect(validateLessonDraft(ok)).toEqual({});
    expect(validateLessonDraft({ ...ok, title: ' ' }).title).toBeTruthy();
    expect(validateLessonDraft({ ...ok, summaryMd: 'See https://example.com' }).summaryMd).toMatch(/links/);
    expect(validateLessonDraft({ ...ok, keyPoints: 'http://x.co' }).keyPoints).toMatch(/links/);
    expect(validateLessonDraft({ ...ok, keyPoints: Array(21).fill('p').join('\n') }).keyPoints).toMatch(/20/);
  });

  it('detects changes, ignoring surrounding whitespace and blank key point lines', () => {
    const original = { title: 'Arrays', summaryMd: 'Text', keyPoints: ['One'], status: 'draft' as const };
    expect(parseKeyPoints(' One \n\n Two ')).toEqual(['One', 'Two']);
    expect(lessonDraftChanged({ title: ' Arrays ', summaryMd: 'Text ', keyPoints: 'One\n', status: 'draft' }, original)).toBe(false);
    expect(lessonDraftChanged({ title: 'Arrays', summaryMd: 'Text', keyPoints: 'One', status: 'review' }, original)).toBe(true);
    expect(lessonDraftChanged({ title: 'Arrays', summaryMd: 'Text', keyPoints: 'One\nTwo', status: 'draft' }, original)).toBe(true);
  });
});

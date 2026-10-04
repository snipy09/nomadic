import { describe, expect, it } from 'vitest';
import type { Application } from '../types';
import {
  DEFAULT_FILTERS, MOVE_OPTIONS, STAGES, filterApplications, groupByStage, historyNewestFirst, isFiltered, lastActivity,
  modesPresent, parseTimestamp, postingUrl, sortApplications, stageCounts, stageOf, statusLabel, validateDraft, withStatus,
} from '../features/applications/applicationsLogic';

const app = (over: Partial<Application>): Application => ({
  id: 1, company: 'Acme', title: 'Frontend Developer', apply_url: 'https://acme.co/1', status: 'applied', mode: 'manual',
  applied_at: '2026-10-01T10:00:00.000Z', ...over,
});

const apps: Application[] = [
  app({ id: 1, company: 'Acme', title: 'Frontend Developer', status: 'applied', applied_at: '2026-10-01T10:00:00.000Z' }),
  app({ id: 2, company: 'beta labs', title: 'Data Analyst', status: 'interviewing', mode: 'autonomous', applied_at: '2026-09-20 08:00:00', notes: 'Round 2 with Priya' }),
  app({ id: 3, company: 'Gamma', title: 'SDE Intern', status: 'captcha_blocked', mode: 'autonomous', applied_at: '2026-09-25T10:00:00.000Z' }),
  app({ id: 4, company: 'Delta', title: 'Backend Engineer', status: 'offered', applied_at: '2026-09-10T10:00:00.000Z', updated_at: '2026-10-02T09:00:00.000Z' }),
  app({ id: 5, company: 'Epsilon', title: 'QA', status: 'rejected', applied_at: '2026-09-01T10:00:00.000Z' }),
];

describe('status mapping', () => {
  it('maps every status the app writes to a stage', () => {
    expect(['applied', 'submitted'].map(stageOf)).toEqual(['applied', 'applied']);
    expect(stageOf('interviewing')).toBe('interviewing');
    expect(['offered', 'accepted'].map(stageOf)).toEqual(['offer', 'offer']);
    expect(['rejected', 'withdrawn', 'archived'].map(stageOf)).toEqual(['closed', 'closed', 'closed']);
    expect(['failed', 'captcha_blocked', 'requires_login', 'prefilled'].map(stageOf)).toEqual(['attention', 'attention', 'attention', 'attention']);
    expect(stageOf(undefined)).toBe('applied');
  });

  it('shows unknown statuses as-is in Needs action', () => {
    expect(stageOf('on_hold')).toBe('attention');
    expect(statusLabel('on_hold')).toBe('On hold');
    expect(statusLabel('Interviewing')).toBe('Interviewing');
  });

  it('offers only user-settable statuses in Move to, and every drop column maps to one of them', () => {
    expect(MOVE_OPTIONS.map((o) => o.value)).toEqual(['applied', 'interviewing', 'offered', 'rejected', 'withdrawn']);
    for (const s of STAGES) if (s.dropStatus) expect(stageOf(s.dropStatus)).toBe(s.id);
  });
});

describe('grouping and counts', () => {
  it('groups by stage in pipeline order and counts', () => {
    const g = groupByStage(apps);
    expect(Object.keys(g)).toEqual(['attention', 'applied', 'interviewing', 'offer', 'closed']);
    expect(g.attention.map((a) => a.id)).toEqual([3]);
    expect(g.offer.map((a) => a.id)).toEqual([4]);
    expect(stageCounts(apps)).toEqual({ total: 5, attention: 1, applied: 1, interviewing: 1, offer: 1, closed: 1 });
    expect(stageCounts([]).total).toBe(0);
  });
});

describe('filtering', () => {
  it('searches company, role, notes and status label with all terms', () => {
    expect(filterApplications(apps, { ...DEFAULT_FILTERS, search: 'priya' }).map((a) => a.id)).toEqual([2]);
    expect(filterApplications(apps, { ...DEFAULT_FILTERS, search: 'BETA analyst' }).map((a) => a.id)).toEqual([2]);
    expect(filterApplications(apps, { ...DEFAULT_FILTERS, search: 'captcha' }).map((a) => a.id)).toEqual([3]);
    expect(filterApplications(apps, { ...DEFAULT_FILTERS, search: 'beta frontend' })).toEqual([]);
  });

  it('filters by stage and mode', () => {
    expect(filterApplications(apps, { ...DEFAULT_FILTERS, stage: 'closed' }).map((a) => a.id)).toEqual([5]);
    expect(filterApplications(apps, { ...DEFAULT_FILTERS, mode: 'autonomous' }).map((a) => a.id)).toEqual([2, 3]);
    expect(isFiltered(DEFAULT_FILTERS)).toBe(false);
    expect(isFiltered({ ...DEFAULT_FILTERS, search: ' x ' })).toBe(true);
    expect(modesPresent(apps)).toEqual(['autonomous', 'manual']);
  });
});

describe('sorting', () => {
  it('sorts by applied date, last activity or company', () => {
    expect(sortApplications(apps, 'recent').map((a) => a.id)).toEqual([1, 3, 2, 4, 5]);
    expect(sortApplications(apps, 'activity').map((a) => a.id)).toEqual([4, 1, 3, 2, 5]);
    expect(sortApplications(apps, 'company').map((a) => a.company)).toEqual(['Acme', 'beta labs', 'Delta', 'Epsilon', 'Gamma']);
    expect(apps[0].id).toBe(1); // input not mutated
  });
});

describe('time and links', () => {
  it('parses SQLite timestamps as UTC', () => {
    expect(parseTimestamp('2026-09-20 08:00:00')).toBe(Date.parse('2026-09-20T08:00:00Z'));
    expect(Number.isNaN(parseTimestamp('soon'))).toBe(true);
    expect(lastActivity(app({ applied_at: 'bad', history: [{ status: 'applied', changed_at: '2026-10-03T00:00:00Z' }] }))).toBe(Date.parse('2026-10-03T00:00:00Z'));
  });

  it('only links real http(s) postings', () => {
    expect(postingUrl(app({ apply_url: 'https://acme.co/1' }))).toBe('https://acme.co/1');
    expect(postingUrl(app({ apply_url: 'manual:3f1c' }))).toBeNull();
    expect(postingUrl(app({ apply_url: 'mailto:hr@acme.co' }))).toBeNull();
    expect(postingUrl(app({ apply_url: '' }))).toBeNull();
  });
});

describe('updates', () => {
  it('appends to history on a status change and is a no-op for the same status', () => {
    const a = app({ history: [{ status: 'applied', changed_at: '2026-10-01T10:00:00.000Z' }] });
    const b = withStatus(a, 'interviewing', '2026-10-02T10:00:00.000Z');
    expect(b.status).toBe('interviewing');
    expect(b.history?.map((h) => h.status)).toEqual(['applied', 'interviewing']);
    expect(historyNewestFirst(b)[0].status).toBe('interviewing');
    expect(withStatus(b, 'interviewing', 'x')).toBe(b);
    expect(a.history).toHaveLength(1);
  });

  it('validates a manual entry without inventing a link', () => {
    const ok = { company: 'Acme', title: 'SDE', url: '', status: 'applied' as const, notes: '' };
    expect(validateDraft(ok)).toEqual({});
    expect(Object.keys(validateDraft({ ...ok, company: ' ', title: '' }))).toEqual(['company', 'title']);
    expect(validateDraft({ ...ok, url: 'acme.co/jobs' }).url).toBeTruthy();
    expect(validateDraft({ ...ok, url: 'javascript:alert(1)' }).url).toBeTruthy();
    expect(validateDraft({ ...ok, url: 'https://acme.co/jobs/1' })).toEqual({});
  });
});

describe('follow-ups', () => {
  const app = (over: Record<string, unknown>) => ({ id: 1, company: 'A', title: 'T', apply_url: 'u', status: 'applied', mode: 'manual', applied_at: '', ...over }) as any;
  it('classifies overdue, today and upcoming; closed applications have none', async () => {
    const { followUpState } = await import('../features/applications/applicationsLogic');
    expect(followUpState(app({ follow_up_at: '2026-10-01' }), '2026-10-04')).toBe('overdue');
    expect(followUpState(app({ follow_up_at: '2026-10-04' }), '2026-10-04')).toBe('today');
    expect(followUpState(app({ follow_up_at: '2026-10-09' }), '2026-10-04')).toBe('upcoming');
    expect(followUpState(app({ follow_up_at: '2026-10-01', status: 'rejected' }), '2026-10-04')).toBeNull();
    expect(followUpState(app({}), '2026-10-04')).toBeNull();
  });

  it('due list is today or earlier, oldest first', async () => {
    const { dueFollowUps } = await import('../features/applications/applicationsLogic');
    const list = [app({ id: 1, follow_up_at: '2026-10-04' }), app({ id: 2, follow_up_at: '2026-09-30' }), app({ id: 3, follow_up_at: '2026-10-05' })];
    expect(dueFollowUps(list, '2026-10-04').map((a) => a.id)).toEqual([2, 1]);
  });

  it('addDays crosses months and years', async () => {
    const { addDays } = await import('../features/applications/applicationsLogic');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

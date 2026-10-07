import { describe, expect, it } from 'vitest';
import { dateRange, deadline, emptyReason, filterNews } from '../features/news/newsLogic';
import type { NewsItem, NewsResult } from '../types';

const item = (o: Partial<NewsItem>): NewsItem => ({ id: 'x', kind: 'hiring', title: 't', detail: null, company: null, url: 'https://x.test', sourceLabel: 's', at: null, ...o });

describe('news helpers', () => {
  it('filters by kind', () => {
    const items = [item({ id: 'a' }), item({ id: 'b', kind: 'hackathon' })];
    expect(filterNews(items, 'all')).toHaveLength(2);
    expect(filterNews(items, 'hackathon').map((i) => i.id)).toEqual(['b']);
  });

  it('shows hiring plans and campus drives from company news under Hiring too', () => {
    const items = [
      item({ id: 'a' }),
      item({ id: 'plan', kind: 'update', topic: 'hiring' }),
      item({ id: 'drive', kind: 'update', topic: 'campus' }),
      item({ id: 'cut', kind: 'update', topic: 'layoffs' }),
    ];
    expect(filterNews(items, 'hiring').map((i) => i.id)).toEqual(['a', 'plan', 'drive']);
    expect(filterNews(items, 'update').map((i) => i.id)).toEqual(['plan', 'drive', 'cut']);
  });

  it('formats event dates in India time', () => {
    expect(dateRange('2026-11-14T03:30:00Z', '2026-11-15T12:00:00Z')).toBe('14–15 Nov');
    expect(dateRange('2026-12-28T05:00:00Z', '2027-01-05T05:00:00Z')).toBe('28 Dec – 5 Jan');
    expect(dateRange('2026-11-14T03:30:00Z', null)).toBe('14 Nov');
    expect(dateRange(null, null)).toBeNull();
  });

  it('shows a registration deadline, urgent within three days, never a past one', () => {
    const now = Date.parse('2026-11-03T00:00:00Z');
    expect(deadline(item({ registrationEndsAt: '2026-11-05T18:29:00Z' }), now)).toEqual({ label: 'Register by 5 Nov', soon: true });
    expect(deadline(item({ registrationEndsAt: '2026-11-20T00:00:00Z' }), now)?.soon).toBe(false);
    expect(deadline(item({ registrationEndsAt: '2026-11-01T00:00:00Z' }), now)).toBeNull();
  });

  it('tells "not published yet" apart from a quiet week', () => {
    const res = (s: NewsResult['sources']): NewsResult => ({ success: true, items: [], sources: s, fetchedAt: '' });
    expect(emptyReason(res({ snapshots: 'not_ready', jobs: 'ok', hackathons: 'not_ready' }))).toBe('not_ready');
    expect(emptyReason(res({ snapshots: 'ok', jobs: 'ok', hackathons: 'ok' }))).toBe('quiet');
    expect(emptyReason(res({ snapshots: 'not_ready', jobs: 'ok', hackathons: 'not_ready', articles: 'ok' }))).toBe('quiet');
  });
});

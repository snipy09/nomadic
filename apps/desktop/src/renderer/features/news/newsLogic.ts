/** Pure helpers for the News page. Dates are shown in India time; nothing is inferred beyond the item's fields. */
import type { NewsItem, NewsResult } from '../../types';

export type NewsFilter = 'all' | 'hiring' | 'hackathon';

export function filterNews(items: NewsItem[], filter: NewsFilter): NewsItem[] {
  return filter === 'all' ? items : items.filter((i) => i.kind === filter);
}

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', ...opts });

/** "14 Nov", or "14–15 Nov", or "28 Dec – 5 Jan". */
export function dateRange(startsAt?: string | null, endsAt?: string | null): string | null {
  if (!startsAt) return null;
  const start = fmt(startsAt, { day: 'numeric', month: 'short' });
  if (!endsAt) return start;
  const end = fmt(endsAt, { day: 'numeric', month: 'short' });
  if (start === end) return start;
  const [sd, sm] = start.split(' ');
  const [ed, em] = end.split(' ');
  return sm === em ? `${sd}–${ed} ${sm}` : `${start} – ${end}`;
}

/** "Register by 5 Nov" (shown as urgent within 3 days), or null. */
export function deadline(item: NewsItem, now = Date.now()): { label: string; soon: boolean } | null {
  if (!item.registrationEndsAt) return null;
  const t = Date.parse(item.registrationEndsAt);
  if (!Number.isFinite(t) || t < now) return null;
  return { label: `Register by ${fmt(item.registrationEndsAt, { day: 'numeric', month: 'short' })}`, soon: t - now < 3 * 86_400_000 };
}

/** Explains an empty page: nothing published yet versus nothing this week. */
export function emptyReason(res: NewsResult | null): 'not_ready' | 'quiet' {
  if (!res) return 'quiet';
  const s = res.sources;
  return s.snapshots !== 'ok' && s.hackathons !== 'ok' ? 'not_ready' : 'quiet';
}

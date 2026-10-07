import { z } from 'zod';
import { BlockedByRobotsError, PoliteFetcher } from '../feed/http.js';
import { canonicalizeUrl } from '../pipeline/normalize.js';
import type { FetchLike } from '../sources/ats.js';
import { NEWS_KINDS, cities, classifyArticle, headcount, matchCompany, period, roles, type NewsKind } from './extract.js';
import { NEWS_FEEDS, type NewsFeed } from './feeds.js';
import { parseFeed } from './rss.js';
import { toNewsRow, type NewsStore } from './store.js';

/**
 * One news run: read each publisher feed (robots.txt obeyed, 1 s between requests to a host), keep articles from the
 * last `maxAgeDays` that are about hiring, campus drives, layoffs, funding or expansion, read their facts, and publish
 * them to `news_items`. Funding and expansion stories are kept only when they name a known company (they are company
 * news, not hiring news). A feed that fails is reported and changes nothing.
 */

export const NewsArticleSchema = z.object({
  url: z
    .string()
    .max(2000)
    .refine((v) => /^https?:\/\/[^\s]+$/i.test(v), 'must be an absolute http(s) URL'),
  source: z.string().regex(/^[a-z0-9-]{1,40}$/),
  sourceName: z.string().min(1).max(80),
  title: z.string().trim().min(1).max(400),
  summary: z.string().max(600),
  publishedAt: z.iso.datetime({ offset: true }),
  kind: z.enum(NEWS_KINDS),
  companyName: z.string().max(120).nullable(),
  companySlug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/).nullable(),
  roles: z.array(z.string().max(60)).max(8),
  headcountText: z.string().max(80).nullable(),
  periodText: z.string().max(80).nullable(),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  locations: z.array(z.string().max(60)).max(8),
});
export type NewsArticle = z.infer<typeof NewsArticleSchema>;

export interface NewsFeedStats {
  id: string;
  name: string;
  ok: boolean;
  error: string | null;
  blockedByRobots: boolean;
  fetched: number;
  tooOld: number;
  offTopic: number;
  kept: number;
}

export interface NewsRunReport {
  startedAt: string;
  finishedAt: string;
  published: boolean;
  feeds: NewsFeedStats[];
  articles: NewsArticle[];
  byKind: Record<NewsKind, number>;
  duplicates: number;
  written: number;
  retired: number;
  warnings: string[];
}

export interface NewsRunOptions {
  publish: boolean;
  store?: NewsStore;
  feeds?: NewsFeed[];
  /** Feed ids to skip (settings.ini news_feeds_off). */
  feedsOff?: string[];
  maxAgeDays?: number;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  minDelayMs?: number;
  clock?: () => Date;
  log?: (message: string) => void;
}

export function articleFrom(feed: NewsFeed, entry: { title: string; link: string; publishedAt: string | null; summary: string }, now: Date): NewsArticle | null {
  const kind = classifyArticle(entry.title, entry.summary);
  if (!kind) return null;
  const company = matchCompany(entry.title, entry.summary);
  if ((kind === 'funding' || kind === 'expansion') && !company?.slug) return null;
  const both = `${entry.title}. ${entry.summary}`;
  const published = entry.publishedAt ? new Date(entry.publishedAt) : now;
  const when = period(both, published);
  return {
    url: entry.link,
    source: feed.id,
    sourceName: feed.name,
    title: entry.title,
    summary: entry.summary.slice(0, 600),
    publishedAt: published.toISOString(),
    kind,
    companyName: company?.name ?? null,
    companySlug: company?.slug ?? null,
    roles: kind === 'funding' ? [] : roles(both),
    headcountText: kind === 'funding' ? null : headcount(both),
    periodText: when?.text ?? null,
    startsOn: when?.startsOn ?? null,
    endsOn: when?.endsOn ?? null,
    locations: cities(both),
  };
}

const titleKey = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '');

export async function runNewsScrape(options: NewsRunOptions): Promise<NewsRunReport> {
  const clock = options.clock ?? (() => new Date());
  const log = options.log ?? (() => undefined);
  const started = clock();
  const startedAt = started.toISOString();
  const maxAge = options.maxAgeDays ?? 30;
  const oldest = new Date(started.getTime() - maxAge * 86_400_000).toISOString();
  const off = new Set(options.feedsOff ?? []);
  const feeds = (options.feeds ?? NEWS_FEEDS).filter((f) => !off.has(f.id));
  const http = new PoliteFetcher({ fetchImpl: options.fetchImpl, sleep: options.sleep, minDelayMs: options.minDelayMs });
  const fetchFeed = http.asFetch();
  if (options.publish && !options.store) throw new Error('publishing needs a news store');

  const report: NewsRunReport = {
    startedAt,
    finishedAt: startedAt,
    published: options.publish,
    feeds: [],
    articles: [],
    byKind: { hiring: 0, campus: 0, layoffs: 0, funding: 0, expansion: 0 },
    duplicates: 0,
    written: 0,
    retired: 0,
    warnings: [],
  };
  if (off.size) report.warnings.push(`feeds turned off in settings: ${[...off].join(', ')}`);

  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  // Different hosts in parallel; PoliteFetcher spaces requests to the same host.
  await Promise.all(
    feeds.map(async (feed) => {
      const s: NewsFeedStats = { id: feed.id, name: feed.name, ok: true, error: null, blockedByRobots: false, fetched: 0, tooOld: 0, offTopic: 0, kept: 0 };
      try {
        const res = await fetchFeed(feed.url, { headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const entries = parseFeed(await res.text());
        if (!entries.length) throw new Error('no articles in the feed (not RSS/Atom?)');
        s.fetched = entries.length;
        for (const entry of entries) {
          if (entry.publishedAt && entry.publishedAt < oldest) {
            s.tooOld++;
            continue;
          }
          const article = articleFrom(feed, entry, started);
          if (!article) {
            s.offTopic++;
            continue;
          }
          const parsed = NewsArticleSchema.safeParse(article);
          if (!parsed.success) {
            if (report.warnings.length < 30) report.warnings.push(`${feed.id}: skipped "${entry.title.slice(0, 60)}": ${parsed.error.issues[0]?.message}`);
            continue;
          }
          const urlKey = canonicalizeUrl(article.url);
          const tKey = titleKey(article.title);
          if (seenUrls.has(urlKey) || seenTitles.has(tKey)) {
            report.duplicates++;
            continue;
          }
          seenUrls.add(urlKey);
          seenTitles.add(tKey);
          report.articles.push(parsed.data);
          s.kept++;
        }
      } catch (err) {
        s.ok = false;
        s.blockedByRobots = err instanceof BlockedByRobotsError && err.reason === null;
        s.error = err instanceof Error ? err.message : String(err);
      }
      report.feeds.push(s);
      log(`[news] ${feed.id}: ${s.ok ? `${s.kept} kept of ${s.fetched}` : `failed: ${s.error}`}`);
    })
  );
  report.feeds.sort((a, b) => a.id.localeCompare(b.id));
  report.articles.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  for (const a of report.articles) report.byKind[a.kind]++;

  if (options.publish) {
    report.written = await options.store!.upsertArticles(report.articles.map((a) => toNewsRow(a, startedAt)));
    report.retired = await options.store!.retireOlderThan(new Date(started.getTime() - (maxAge + 15) * 86_400_000).toISOString());
  }
  report.finishedAt = clock().toISOString();
  return report;
}

export function articleFacts(a: Pick<NewsArticle, 'periodText' | 'headcountText' | 'roles' | 'locations'>): string {
  return [a.periodText, a.headcountText, a.roles.join(', '), a.locations.join(', ')].filter(Boolean).join(' · ');
}

export function formatNewsSummary(report: NewsRunReport): string {
  const k = report.byKind;
  const lines = [
    `Nomadic news scrape — ${report.startedAt}`,
    report.published ? 'Published to Supabase (news_items)' : 'Dry run (nothing written)',
    '',
    'Feeds (kept / read, older than the window, not about hiring):',
    ...report.feeds.map((f) =>
      f.ok
        ? `  ${f.id.padEnd(16)} ${String(f.kept).padStart(3)} / ${String(f.fetched).padEnd(4)} old ${String(f.tooOld).padStart(3)}  off-topic ${f.offTopic}`
        : `  ${f.id.padEnd(16)} FAILED${f.blockedByRobots ? ' (robots.txt)' : ''}: ${f.error}`
    ),
    '',
    `Articles: ${report.articles.length} (hiring ${k.hiring}, campus drives ${k.campus}, layoffs ${k.layoffs}, funding ${k.funding}, expansion ${k.expansion}); ${report.duplicates} duplicates skipped.`,
  ];
  if (report.published) lines.push(`Written: ${report.written}. Retired (too old): ${report.retired}.`);
  const sample = report.articles.filter((a) => a.kind === 'hiring' || a.kind === 'campus').slice(0, 25);
  if (sample.length) {
    lines.push('', 'Latest hiring news:');
    for (const a of sample) {
      const facts = articleFacts(a);
      lines.push(`  ${a.publishedAt.slice(0, 10)}  ${a.companyName ?? '-'} — ${a.title}`, ...(facts ? [`              ${facts}`] : []), `              ${a.url}`);
    }
  }
  if (report.warnings.length) lines.push('', 'Warnings:', ...report.warnings.map((w) => `  ${w}`));
  return lines.join('\n') + '\n';
}

import type { NewsItem, NewsResult, NewsSourceState, NewsTopic } from '../../shared/ipc.js';
import { log } from './app-context.js';
import { getAnonSupabase } from './supabase.js';

/**
 * The News page (Home): hiring updates per company, company news from publishers and upcoming hackathons and
 * contests. Every item is built from published rows (migration 031/033 tables written by the feed and news scrapers,
 * and the live `jobs` table) and links to its source. Nothing is estimated: counts are what the rows say, article
 * facts are what the headline and summary say, and missing facts are left out of the line.
 */

export const NEWS_JOBS_WINDOW_DAYS = 7;
/** A company needs this many new postings in the window to make a jobs-board news item. */
export const NEWS_JOBS_MIN_POSTINGS = 2;
/** Snapshots older than this are not news. */
export const NEWS_SNAPSHOT_MAX_AGE_DAYS = 3;
/** Company news older than this is not shown. */
export const NEWS_ARTICLE_MAX_AGE_DAYS = 30;

export interface SnapshotRow {
  company_slug: string;
  taken_on: string;
  open_total: number;
  internships: number;
  entry_level: number;
  new_openings: number;
  baseline: boolean;
  sample_titles: unknown;
}

export interface CompanyRow {
  slug: string;
  name: string;
  careers_url: string;
}

export interface NewsJobRow {
  company: string | null;
  title: string | null;
  apply_url: string | null;
  employment_type: string | null;
  posted_at: string | null;
  created_at: string | null;
}

export interface ArticleRow {
  id: number | string;
  url: string;
  source_name: string;
  title: string;
  published_at: string;
  kind: string;
  company_name: string | null;
  roles: string[] | null;
  headcount_text: string | null;
  period_text: string | null;
  locations: string[] | null;
}

export interface HackathonRow {
  source: string;
  /** 'contest' for coding contests (migration 033); absent before it. */
  kind?: string | null;
  source_id: string;
  title: string;
  organiser: string | null;
  url: string;
  mode: string;
  city: string | null;
  in_india: boolean;
  starts_at: string | null;
  ends_at: string | null;
  registration_ends_at: string | null;
  themes: string[] | null;
  prize_text: string | null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const companyKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '');
const titlesOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string' && t.trim() !== '') : []);

/** Latest snapshot per company, newest first; companies with new roles come first. */
export function hiringFromSnapshots(snapshots: SnapshotRow[], companies: CompanyRow[], now: Date): NewsItem[] {
  const bySlug = new Map(companies.map((c) => [c.slug, c]));
  const latest = new Map<string, SnapshotRow>();
  for (const s of snapshots) {
    const prev = latest.get(s.company_slug);
    if (!prev || s.taken_on > prev.taken_on) latest.set(s.company_slug, s);
  }
  const oldest = new Date(now.getTime() - NEWS_SNAPSHOT_MAX_AGE_DAYS * 86_400_000).toISOString().slice(0, 10);
  const items: NewsItem[] = [];
  for (const s of latest.values()) {
    const c = bySlug.get(s.company_slug);
    if (!c || s.open_total <= 0 || s.taken_on < oldest) continue;
    const fresh = !s.baseline && s.new_openings > 0;
    const facts = [
      `${plural(s.open_total, 'open role')} in India`,
      s.internships > 0 ? plural(s.internships, 'internship') : '',
      s.entry_level > 0 ? `${s.entry_level} entry level` : '',
    ].filter(Boolean);
    const samples = titlesOf(s.sample_titles).slice(0, 2);
    items.push({
      id: `hiring:${s.company_slug}:${s.taken_on}`,
      kind: 'hiring',
      title: fresh ? `${c.name} posted ${plural(s.new_openings, 'new role')} in India` : `${c.name} is hiring in India`,
      detail: [facts.join(' · '), samples.length ? `e.g. ${samples.join(', ')}` : ''].filter(Boolean).join(' — '),
      company: c.name,
      url: c.careers_url,
      sourceLabel: `${c.name} careers`,
      at: `${s.taken_on}T00:00:00.000Z`,
      newRoles: s.baseline ? null : s.new_openings,
    });
  }
  return items.sort((a, b) => (b.newRoles ?? -1) - (a.newRoles ?? -1) || (b.at ?? '').localeCompare(a.at ?? ''));
}

/** Companies that posted several roles on the job board in the last week (skipping ones covered by snapshots). */
export function hiringFromJobs(rows: NewsJobRow[], now: Date, coveredCompanies: ReadonlySet<string> = new Set()): NewsItem[] {
  const since = now.getTime() - NEWS_JOBS_WINDOW_DAYS * 86_400_000;
  const groups = new Map<string, { name: string; rows: NewsJobRow[]; newest: number }>();
  for (const r of rows) {
    const name = (r.company ?? '').trim();
    const when = Date.parse(r.posted_at ?? r.created_at ?? '');
    if (!name || !r.apply_url || !Number.isFinite(when) || when < since) continue;
    const key = companyKey(name);
    if (!key || coveredCompanies.has(key)) continue;
    const g = groups.get(key) ?? { name, rows: [], newest: 0 };
    g.rows.push(r);
    g.newest = Math.max(g.newest, when);
    groups.set(key, g);
  }
  const items: NewsItem[] = [];
  for (const [key, g] of groups) {
    if (g.rows.length < NEWS_JOBS_MIN_POSTINGS) continue;
    const interns = g.rows.filter((r) => /intern/i.test(`${r.employment_type ?? ''} ${r.title ?? ''}`)).length;
    const titles = [...new Set(g.rows.map((r) => (r.title ?? '').trim()).filter(Boolean))].slice(0, 2);
    const newest = g.rows.reduce((a, b) => (Date.parse(b.posted_at ?? b.created_at ?? '') > Date.parse(a.posted_at ?? a.created_at ?? '') ? b : a));
    items.push({
      id: `jobs:${key}`,
      kind: 'hiring',
      title: `${g.name} posted ${plural(g.rows.length, 'role')} this week`,
      detail: [interns > 0 ? plural(interns, 'internship') : '', titles.length ? `e.g. ${titles.join(', ')}` : ''].filter(Boolean).join(' — ') || null,
      company: g.name,
      url: String(newest.apply_url),
      sourceLabel: 'Nomadic job board',
      at: new Date(g.newest).toISOString(),
      newRoles: g.rows.length,
    });
  }
  return items.sort((a, b) => (b.newRoles ?? 0) - (a.newRoles ?? 0) || (b.at ?? '').localeCompare(a.at ?? ''));
}

const TOPICS: readonly NewsTopic[] = ['hiring', 'campus', 'layoffs', 'funding', 'expansion'];

/** Company news, newest first: the headline as published, with the facts read from it on the detail line. */
export function updatesFromArticles(rows: ArticleRow[], now: Date): NewsItem[] {
  const since = now.getTime() - NEWS_ARTICLE_MAX_AGE_DAYS * 86_400_000;
  return rows
    .filter((r) => r.url && r.title && Date.parse(r.published_at) >= since && TOPICS.includes(r.kind as NewsTopic))
    .sort((a, b) => b.published_at.localeCompare(a.published_at))
    .map((r): NewsItem => {
      const facts = [r.period_text, r.headcount_text, (r.roles ?? []).join(', '), (r.locations ?? []).join(', ')].filter((x): x is string => Boolean(x));
      return {
        id: `news:${r.id}`,
        kind: 'update',
        topic: r.kind as NewsTopic,
        title: r.title,
        detail: facts.length ? facts.join(' · ') : null,
        company: r.company_name,
        url: r.url,
        sourceLabel: r.source_name,
        at: r.published_at,
      };
    });
}

const SOURCE_LABEL: Record<string, string> = {
  devfolio: 'Devfolio',
  unstop: 'Unstop',
  devpost: 'Devpost',
  hackerearth: 'HackerEarth',
  hack2skill: 'Hack2skill',
  mlh: 'MLH',
  codeforces: 'Codeforces',
};

/** Upcoming hackathons, soonest deadline (registration, else start) first; ended ones are dropped. */
export function hackathonItems(rows: HackathonRow[], now: Date): NewsItem[] {
  const nowIso = now.toISOString();
  return rows
    .filter((h) => !h.ends_at || h.ends_at > nowIso)
    .map((h): NewsItem => {
      const where = h.mode === 'online' ? 'Online' : h.city ? h.city : h.mode === 'hybrid' ? 'Hybrid' : null;
      const themes = (h.themes ?? []).slice(0, 2).join(', ');
      return {
        id: `hackathon:${h.source}:${h.source_id}`,
        kind: 'hackathon',
        eventKind: h.kind === 'contest' ? 'contest' : 'hackathon',
        title: h.title,
        detail: [h.organiser, where, h.prize_text, themes].filter((x): x is string => Boolean(x)).join(' · ') || null,
        company: null,
        url: h.url,
        sourceLabel: SOURCE_LABEL[h.source] ?? h.source,
        at: h.starts_at,
        startsAt: h.starts_at,
        endsAt: h.ends_at,
        registrationEndsAt: h.registration_ends_at && h.registration_ends_at > nowIso ? h.registration_ends_at : null,
        mode: (['online', 'in_person', 'hybrid'].includes(h.mode) ? h.mode : 'unknown') as NewsItem['mode'],
        city: h.city,
      };
    })
    .sort((a, b) => ((a.registrationEndsAt ?? a.startsAt ?? '9999') < (b.registrationEndsAt ?? b.startsAt ?? '9999') ? -1 : 1));
}

/** A table that is not published yet (migration 031/033 not applied) is "not ready", not a failure. */
export function sourceState(error: { code?: string; message?: string } | null): NewsSourceState {
  if (!error) return 'ok';
  if (error.code === 'PGRST205' || error.code === '42P01' || /does not exist|could not find the table/i.test(error.message ?? '')) return 'not_ready';
  return 'error';
}

export async function getNews(now: Date = new Date()): Promise<NewsResult> {
  const fetchedAt = now.toISOString();
  const supabase = getAnonSupabase();
  if (!supabase) {
    return { success: false, items: [], sources: { snapshots: 'error', jobs: 'error', hackathons: 'error', articles: 'error' }, fetchedAt, error: 'Nomadic is not connected to its server.' };
  }
  const since = new Date(now.getTime() - NEWS_JOBS_WINDOW_DAYS * 86_400_000).toISOString();
  const snapSince = new Date(now.getTime() - NEWS_SNAPSHOT_MAX_AGE_DAYS * 86_400_000).toISOString().slice(0, 10);
  const articleSince = new Date(now.getTime() - NEWS_ARTICLE_MAX_AGE_DAYS * 86_400_000).toISOString();
  try {
    const [snaps, companies, jobs, hacks, articles] = await Promise.all([
      supabase.from('company_hiring_snapshots').select('company_slug, taken_on, open_total, internships, entry_level, new_openings, baseline, sample_titles').gte('taken_on', snapSince).limit(500),
      supabase.from('companies').select('slug, name, careers_url').limit(2000),
      supabase
        .from('jobs')
        .select('company, title, apply_url, employment_type, posted_at, created_at')
        .eq('is_active', true)
        .or(`posted_at.gte.${since},and(posted_at.is.null,created_at.gte.${since})`)
        .limit(2000),
      supabase
        .from('hackathons')
        // '*' so the list still loads before migration 033 adds `kind`.
        .select('*')
        .order('starts_at', { ascending: true, nullsFirst: false })
        .limit(120),
      supabase
        .from('news_items')
        .select('id, url, source_name, title, published_at, kind, company_name, roles, headcount_text, period_text, locations')
        .gte('published_at', articleSince)
        .order('published_at', { ascending: false })
        .limit(150),
    ]);
    const sources = {
      snapshots: sourceState(snaps.error ?? companies.error),
      jobs: sourceState(jobs.error),
      hackathons: sourceState(hacks.error),
      articles: sourceState(articles.error),
    };
    const fromSnaps = sources.snapshots === 'ok' ? hiringFromSnapshots((snaps.data ?? []) as SnapshotRow[], (companies.data ?? []) as CompanyRow[], now) : [];
    const covered = new Set(fromSnaps.map((i) => companyKey(i.company ?? '')));
    const fromJobs = sources.jobs === 'ok' ? hiringFromJobs((jobs.data ?? []) as NewsJobRow[], now, covered) : [];
    const hackathons = sources.hackathons === 'ok' ? hackathonItems((hacks.data ?? []) as HackathonRow[], now) : [];
    const updates = sources.articles === 'ok' ? updatesFromArticles((articles.data ?? []) as ArticleRow[], now) : [];
    for (const [name, st] of Object.entries(sources)) if (st === 'error') log(`[News] ${name} could not be read`);
    const allFailed = Object.values(sources).every((s) => s === 'error');
    return {
      success: !allFailed,
      items: [...fromSnaps, ...fromJobs, ...updates, ...hackathons],
      sources,
      fetchedAt,
      error: allFailed ? 'Could not load the news. Check your connection and try again.' : undefined,
    };
  } catch (err: unknown) {
    log(`[News] ${err instanceof Error ? err.message : String(err)}`);
    return { success: false, items: [], sources: { snapshots: 'error', jobs: 'error', hackathons: 'error', articles: 'error' }, fetchedAt, error: 'Could not load the news. Check your connection and try again.' };
  }
}

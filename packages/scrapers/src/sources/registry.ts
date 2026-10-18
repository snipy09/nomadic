import { DEFAULT_TOP_TECH_BOARDS } from '../ats-api-scraper.js';
import { scrapeAggregatorsAndRss } from '../aggregator-rss-scraper.js';
import { scrapeDirectDom } from '../direct-dom-scraper.js';
import { scrapeIndeedIndia, scrapeNaukriIndia } from '../indian-portals-scraper.js';
import { scrapeInternshalaListings, scrapeJobicy } from '../internshala-scraper.js';
import type { JobCandidate, SourceId } from '../job-schema.js';
import { scrapeNicheBoards } from '../niche-boards-scraper.js';
import { scrapeWebSearchIndexes } from '../web-search-scraper.js';
import {
  fetchAshbyBoard,
  fetchBoards,
  fetchGreenhouseBoard,
  fetchLeverBoard,
  fetchRemotive,
  type BoardConfig,
  type FetchLike,
} from './ats.js';
import { internshalaToCandidate, rawJobToCandidate } from './legacy.js';
import { COMPANIES } from '../feed/companies.js';
import { ADZUNA_ENV, fetchAdzuna } from './adzuna.js';
import { feedCompanies, loadDiscoveredBoards, mergeBoards } from './boards.js';
import { fetchCareersJobs } from './careers-jobs.js';
import { fetchUnstopJobs } from './unstop-jobs.js';

export type Tier = 1 | 2 | 3;

export interface SourceContext {
  fetch: FetchLike;
  now: Date;
  /** Non-fatal problems (one board down, etc.). Fatal ones should throw. */
  warn: (message: string) => void;
  /**
   * Says that every job whose source id starts with this prefix was read (one company's whole listing). When a
   * warning stops expiry for the whole source, unseen jobs under these prefixes are still expired.
   */
  complete?: (idPrefix: string) => void;
}

export interface SourceDefinition {
  id: SourceId;
  label: string;
  tier: Tier;
  /** Official APIs list only open jobs, so their links need no HTTP liveness check. */
  officialApi: boolean;
  /** Lists only jobs in India, so the region filter does not apply. */
  indiaOnly?: boolean;
  /** Environment variables the source needs; without them it is left out unless named explicitly. */
  requiresEnv?: readonly string[];
  /** Longer than the default 90 s for sources that page politely through many listings. */
  timeoutMs?: number;
  fetchCandidates(ctx: SourceContext): Promise<JobCandidate[]>;
}

/** Greenhouse public boards. Any board that 404s shows up as a warning in the run report. */
export const GREENHOUSE_BOARDS: BoardConfig[] = [
  { name: 'Stripe', boardId: 'stripe' },
  { name: 'Databricks', boardId: 'databricks' },
  { name: 'Figma', boardId: 'figma' },
  { name: 'Cloudflare', boardId: 'cloudflare' },
  { name: 'GitLab', boardId: 'gitlab' },
  { name: 'Airbnb', boardId: 'airbnb' },
  { name: 'Coinbase', boardId: 'coinbase' },
  { name: 'Discord', boardId: 'discord' },
];

export const LEVER_BOARDS: BoardConfig[] = DEFAULT_TOP_TECH_BOARDS.filter((b) => b.type === 'lever').map(
  ({ name, boardId }) => ({ name, boardId })
);

export const ASHBY_BOARDS: BoardConfig[] = DEFAULT_TOP_TECH_BOARDS.filter((b) => b.type === 'ashby').map(
  ({ name, boardId }) => ({ name, boardId })
);

/** The feed's famous companies on one ATS, as boards for the job board. */
function feedBoards(kind: 'greenhouse' | 'lever' | 'ashby'): BoardConfig[] {
  return COMPANIES.flatMap((c) => (c.careers?.kind === kind ? [{ name: c.name, boardId: c.careers.board }] : []));
}

/** Built-in boards + the feed's companies + boards found by `discover` (state/boards.json), read at run time. */
export function boardsFor(kind: 'greenhouse' | 'lever' | 'ashby'): BoardConfig[] {
  const builtIn = { greenhouse: GREENHOUSE_BOARDS, lever: LEVER_BOARDS, ashby: ASHBY_BOARDS }[kind];
  return mergeBoards([...builtIn, ...feedBoards(kind)], loadDiscoveredBoards(), kind);
}

const envInt = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

// /feed/ is Jobspresso's (empty) blog feed; the job listings are at /jobs/feed/.
export const RSS_FEEDS = [{ name: 'Jobspresso Tech', url: 'https://jobspresso.co/jobs/feed/' }];

/** Generic DOM scraping has no default targets; supply them via SCRAPER_DOM_TARGETS (JSON). */
function domTargetsFromEnv(): { name: string; url: string }[] {
  try {
    const parsed = JSON.parse(process.env.SCRAPER_DOM_TARGETS || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((t) => t && typeof t.url === 'string' && typeof t.name === 'string')
      : [];
  } catch {
    return [];
  }
}

function boardWarning(ctx: SourceContext, source: string) {
  return (board: BoardConfig, err: Error) => ctx.warn(`${source}/${board.boardId}: ${err.message}`);
}

export const SOURCES: SourceDefinition[] = [
  // ── Tier 1 ────────────────────────────────────────────────────────────────
  {
    id: 'greenhouse',
    label: 'Greenhouse API',
    tier: 1,
    officialApi: true,
    timeoutMs: 15 * 60_000,
    fetchCandidates: (ctx) =>
      fetchBoards(boardsFor('greenhouse'), (b) => fetchGreenhouseBoard(ctx.fetch, b), boardWarning(ctx, 'greenhouse')),
  },
  {
    id: 'lever',
    label: 'Lever API',
    tier: 1,
    officialApi: true,
    timeoutMs: 15 * 60_000,
    fetchCandidates: (ctx) =>
      fetchBoards(boardsFor('lever'), (b) => fetchLeverBoard(ctx.fetch, b), boardWarning(ctx, 'lever')),
  },
  {
    id: 'ashby',
    label: 'Ashby API',
    tier: 1,
    officialApi: true,
    timeoutMs: 15 * 60_000,
    fetchCandidates: (ctx) =>
      fetchBoards(boardsFor('ashby'), (b) => fetchAshbyBoard(ctx.fetch, b), boardWarning(ctx, 'ashby')),
  },
  {
    id: 'remotive',
    label: 'Remotive',
    tier: 1,
    officialApi: true,
    fetchCandidates: (ctx) => fetchRemotive(ctx.fetch),
  },
  {
    id: 'internshala',
    label: 'Internshala',
    tier: 1,
    officialApi: false,
    indiaOnly: true,
    timeoutMs: 20 * 60_000,
    fetchCandidates: async () =>
      (await scrapeInternshalaListings(undefined, { maxPages: envInt('SCRAPER_INTERNSHALA_PAGES', 5) })).map(internshalaToCandidate),
  },
  {
    id: 'careers',
    label: 'Company careers sites',
    tier: 1,
    officialApi: true,
    timeoutMs: 20 * 60_000,
    fetchCandidates: (ctx) =>
      fetchCareersJobs(ctx.fetch, { companies: feedCompanies(), maxPages: envInt('SCRAPER_MAX_PAGES', 25), now: ctx.now, warn: ctx.warn, complete: ctx.complete }),
  },
  {
    id: 'unstop',
    label: 'Unstop',
    tier: 1,
    officialApi: false,
    indiaOnly: true,
    timeoutMs: 15 * 60_000,
    fetchCandidates: (ctx) => fetchUnstopJobs(ctx.fetch, { maxPages: envInt('SCRAPER_UNSTOP_PAGES', 34), now: ctx.now, warn: ctx.warn }),
  },
  {
    id: 'adzuna',
    label: 'Adzuna',
    tier: 1,
    officialApi: true,
    requiresEnv: ADZUNA_ENV,
    timeoutMs: 10 * 60_000,
    fetchCandidates: (ctx) =>
      fetchAdzuna(ctx.fetch, {
        appId: process.env.ADZUNA_APP_ID ?? '',
        appKey: process.env.ADZUNA_APP_KEY ?? '',
        maxCalls: envInt('ADZUNA_MAX_CALLS', 40),
        pagesPerQuery: envInt('ADZUNA_PAGES_PER_QUERY', 10),
        now: ctx.now,
        warn: ctx.warn,
      }),
  },
  // ── Tier 2 ────────────────────────────────────────────────────────────────
  {
    id: 'rss',
    label: 'RSS',
    tier: 2,
    officialApi: false,
    fetchCandidates: async (ctx) =>
      (await scrapeAggregatorsAndRss(RSS_FEEDS)).map((j) => rawJobToCandidate(j, 'rss', { now: ctx.now })),
  },
  {
    id: 'arbeitnow',
    label: 'Arbeitnow',
    tier: 2,
    officialApi: false,
    fetchCandidates: async (ctx) =>
      (await scrapeNicheBoards()).map((j) => rawJobToCandidate(j, 'arbeitnow', { now: ctx.now })),
  },
  {
    id: 'jobicy',
    label: 'Jobicy',
    tier: 2,
    officialApi: false,
    fetchCandidates: async (ctx) =>
      (await scrapeJobicy()).map((j) => rawJobToCandidate({ ...j, createdAt: j.postedAt }, 'jobicy', { now: ctx.now })),
  },
  // ── Tier 3 (opt-in) ───────────────────────────────────────────────────────
  {
    id: 'naukri',
    label: 'Naukri',
    tier: 3,
    officialApi: false,
    indiaOnly: true,
    fetchCandidates: async (ctx) =>
      (await scrapeNaukriIndia()).map((j) => rawJobToCandidate(j, 'naukri', { now: ctx.now })),
  },
  {
    id: 'indeed',
    label: 'Indeed',
    tier: 3,
    officialApi: false,
    indiaOnly: true,
    fetchCandidates: async (ctx) =>
      (await scrapeIndeedIndia()).map((j) => rawJobToCandidate(j, 'indeed', { now: ctx.now })),
  },
  {
    id: 'web-search',
    label: 'Web search (RemoteOK tags)',
    tier: 3,
    officialApi: false,
    fetchCandidates: async (ctx) =>
      (await scrapeWebSearchIndexes(['react', 'typescript', 'python', 'intern'])).map((j) =>
        rawJobToCandidate(j, 'web-search', { now: ctx.now })
      ),
  },
  {
    id: 'dom',
    label: 'Direct DOM',
    tier: 3,
    officialApi: false,
    fetchCandidates: async (ctx) =>
      (await scrapeDirectDom(domTargetsFromEnv())).map((j) => rawJobToCandidate(j, 'dom', { now: ctx.now })),
  },
];

export function getSource(id: string): SourceDefinition | undefined {
  return SOURCES.find((s) => s.id === id);
}

export interface SourceSelection {
  /** Explicit source ids. Naming a tier 3 source opts into it. */
  sources?: string[];
  /** Restrict to these tiers. */
  tiers?: Tier[];
  /** Include tier 3 sources when selecting by tier. */
  includeTier3?: boolean;
  env?: Record<string, string | undefined>;
}

/**
 * Tier 3 is off unless explicitly requested: by id, by --include-tier3,
 * or SCRAPER_ENABLE_TIER3=1.
 */
export function selectSources(
  selection: SourceSelection = {},
  registry: SourceDefinition[] = SOURCES
): SourceDefinition[] {
  const env = selection.env ?? process.env;
  if (selection.sources && selection.sources.length > 0) {
    const unknown = selection.sources.filter((id) => !registry.some((s) => s.id === id));
    if (unknown.length > 0) {
      throw new Error(`Unknown source(s): ${unknown.join(', ')}. Known: ${registry.map((s) => s.id).join(', ')}`);
    }
    return registry.filter((s) => selection.sources!.includes(s.id));
  }
  const hasEnv = (s: SourceDefinition) => (s.requiresEnv ?? []).every((name) => Boolean(env[name]?.trim()));
  const tier3 = selection.includeTier3 || env.SCRAPER_ENABLE_TIER3 === '1' || env.SCRAPER_ENABLE_TIER3 === 'true';
  return registry.filter((s) => {
    if (selection.tiers && selection.tiers.length > 0 && !selection.tiers.includes(s.tier)) return false;
    if (s.tier === 3 && !tier3) return false;
    return hasEnv(s);
  });
}

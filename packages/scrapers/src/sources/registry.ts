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

export type Tier = 1 | 2 | 3;

export interface SourceContext {
  fetch: FetchLike;
  now: Date;
  /** Non-fatal problems (one board down, etc.). Fatal ones should throw. */
  warn: (message: string) => void;
}

export interface SourceDefinition {
  id: SourceId;
  label: string;
  tier: Tier;
  /** Official APIs list only open jobs, so their links need no HTTP liveness check. */
  officialApi: boolean;
  /** Lists only jobs in India, so the region filter does not apply. */
  indiaOnly?: boolean;
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

export const RSS_FEEDS = [{ name: 'Jobspresso Tech', url: 'https://jobspresso.co/feed/' }];

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
    fetchCandidates: (ctx) =>
      fetchBoards(GREENHOUSE_BOARDS, (b) => fetchGreenhouseBoard(ctx.fetch, b), boardWarning(ctx, 'greenhouse')),
  },
  {
    id: 'lever',
    label: 'Lever API',
    tier: 1,
    officialApi: true,
    fetchCandidates: (ctx) =>
      fetchBoards(LEVER_BOARDS, (b) => fetchLeverBoard(ctx.fetch, b), boardWarning(ctx, 'lever')),
  },
  {
    id: 'ashby',
    label: 'Ashby API',
    tier: 1,
    officialApi: true,
    fetchCandidates: (ctx) =>
      fetchBoards(ASHBY_BOARDS, (b) => fetchAshbyBoard(ctx.fetch, b), boardWarning(ctx, 'ashby')),
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
    fetchCandidates: async () => (await scrapeInternshalaListings()).map(internshalaToCandidate),
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
  const tier3 = selection.includeTier3 || env.SCRAPER_ENABLE_TIER3 === '1' || env.SCRAPER_ENABLE_TIER3 === 'true';
  return registry.filter((s) => {
    if (selection.tiers && selection.tiers.length > 0 && !selection.tiers.includes(s.tier)) return false;
    if (s.tier === 3 && !tier3) return false;
    return true;
  });
}

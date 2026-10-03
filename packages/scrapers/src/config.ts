import fs from 'fs';
import { DEFAULT_TOP_TECH_BOARDS } from './ats-api-scraper.ts';

/**
 * Scraper pipeline configuration.
 *
 * Tier 3 sources (Naukri, Indeed, web search, generic DOM) are OFF by default and
 * only run when `tier3Enabled` is true: set `SCRAPER_ENABLE_TIER3=1`, pass
 * `--enable-tier3` to the CLI, or set `"tier3Enabled": true` in the JSON file
 * pointed to by `SCRAPER_CONFIG_FILE`.
 */

export interface BoardConfig {
  /** Company display name. */
  name: string;
  /** Board / account / company identifier in the ATS. */
  boardId: string;
}

export interface FeedConfig {
  name: string;
  url: string;
  /** Feed only lists remote jobs. */
  remote?: boolean;
}

export interface ScraperConfig {
  tier3Enabled: boolean;
  boards: {
    greenhouse: BoardConfig[];
    lever: BoardConfig[];
    ashby: BoardConfig[];
    workable: BoardConfig[];
    smartrecruiters: BoardConfig[];
  };
  remotive: { limit: number; category?: string };
  jobicy: { count: number; tag?: string };
  internshala: { listingUrls: string[]; maxDetailPages: number };
  rssFeeds: FeedConfig[];
  remoteokTags: string[];
  domTargets: FeedConfig[];
  requestTimeoutMs: number;
  /** Parallel board/feed requests per source. */
  sourceConcurrency: number;
}

const byType = (type: 'lever' | 'ashby' | 'greenhouse') =>
  DEFAULT_TOP_TECH_BOARDS.filter(b => b.type === type).map(b => ({ name: b.name, boardId: b.boardId }));

export const DEFAULT_SCRAPER_CONFIG: ScraperConfig = {
  tier3Enabled: false,
  boards: {
    // Legacy roster had no Greenhouse boards; these are well-known public boards.
    greenhouse: [
      { name: 'Stripe', boardId: 'stripe' },
      { name: 'Airbnb', boardId: 'airbnb' },
      { name: 'Figma', boardId: 'figma' },
      { name: 'Discord', boardId: 'discord' },
      { name: 'Cloudflare', boardId: 'cloudflare' },
      { name: 'GitLab', boardId: 'gitlab' },
      { name: 'Databricks', boardId: 'databricks' },
      { name: 'Robinhood', boardId: 'robinhood' },
      ...byType('greenhouse'),
    ],
    lever: byType('lever'),
    ashby: byType('ashby'),
    workable: [],
    smartrecruiters: [
      { name: 'Visa', boardId: 'Visa' },
      { name: 'Bosch', boardId: 'BoschGroup' },
    ],
  },
  remotive: { limit: 300 },
  jobicy: { count: 50, tag: 'dev' },
  internshala: {
    listingUrls: [
      'https://internshala.com/internships/work-from-home-computer-science-internships/',
      'https://internshala.com/internships/computer-science-internship/',
      'https://internshala.com/jobs/developer-jobs/',
    ],
    maxDetailPages: 40,
  },
  rssFeeds: [{ name: 'Jobspresso', url: 'https://jobspresso.co/feed/', remote: true }],
  remoteokTags: ['react', 'typescript', 'python', 'intern', 'bangalore', 'india'],
  domTargets: [],
  requestTimeoutMs: 15000,
  sourceConcurrency: 6,
};

function truthy(value: string | undefined): boolean {
  return value !== undefined && /^(1|true|yes|on)$/i.test(value.trim());
}

export type ScraperConfigOverrides = Partial<Omit<ScraperConfig, 'boards'>> & { boards?: Partial<ScraperConfig['boards']> };

export function mergeConfig(base: ScraperConfig, overrides: ScraperConfigOverrides = {}): ScraperConfig {
  return {
    ...base,
    ...overrides,
    boards: { ...base.boards, ...(overrides.boards ?? {}) },
    remotive: { ...base.remotive, ...(overrides.remotive ?? {}) },
    jobicy: { ...base.jobicy, ...(overrides.jobicy ?? {}) },
    internshala: { ...base.internshala, ...(overrides.internshala ?? {}) },
  };
}

/** Defaults <- `SCRAPER_CONFIG_FILE` JSON <- env flags <- explicit overrides. */
export function loadScraperConfig(
  overrides: ScraperConfigOverrides = {},
  env: Record<string, string | undefined> = process.env,
): ScraperConfig {
  let config = DEFAULT_SCRAPER_CONFIG;
  const file = env.SCRAPER_CONFIG_FILE;
  if (file) {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as ScraperConfigOverrides;
    config = mergeConfig(config, parsed);
  }
  if (truthy(env.SCRAPER_ENABLE_TIER3)) config = mergeConfig(config, { tier3Enabled: true });
  return mergeConfig(config, overrides);
}

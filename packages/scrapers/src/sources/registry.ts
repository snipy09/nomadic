import type { ScraperConfig } from '../config.ts';
import type { SourceTier } from '../pipeline/schema.ts';
import {
  ashbySource,
  greenhouseSource,
  leverSource,
  smartRecruitersSource,
  workableSource,
} from './ats.ts';
import {
  arbeitnowSource,
  directDomSource,
  indeedSource,
  jobicySource,
  naukriSource,
  remoteokSource,
  remotiveSource,
  rssSource,
} from './aggregators.ts';
import { internshalaSource } from './internshala.ts';
import type { SourceAdapter } from './types.ts';

/**
 * Source registry. Order matters: it is the dedupe tie-breaker after tier, so
 * keep official ATS APIs first.
 *
 *   Tier 1: Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Remotive, Internshala
 *   Tier 2: Jobicy, Arbeitnow (niche board), RSS feeds
 *   Tier 3 (opt-in): RemoteOK (legacy web search), Naukri, Indeed, generic DOM
 */
export const SOURCE_REGISTRY: SourceAdapter[] = [
  greenhouseSource,
  leverSource,
  ashbySource,
  workableSource,
  smartRecruitersSource,
  remotiveSource,
  internshalaSource,
  jobicySource,
  arbeitnowSource,
  rssSource,
  remoteokSource,
  naukriSource,
  indeedSource,
  directDomSource,
];

export function getSource(key: string): SourceAdapter | undefined {
  return SOURCE_REGISTRY.find(s => s.key === key);
}

export interface SourceSelection {
  selected: SourceAdapter[];
  /** Requested but not run, with the reason. */
  skipped: Array<{ key: string; reason: string }>;
  unknown: string[];
}

/**
 * Resolves a spec like `tier1,tier2`, `all`, or `greenhouse,lever,internshala`.
 * Tier 3 sources are skipped unless `config.tier3Enabled` is true.
 */
export function resolveSources(spec: string | string[] | undefined, config: ScraperConfig, registry: SourceAdapter[] = SOURCE_REGISTRY): SourceSelection {
  const tokens = (Array.isArray(spec) ? spec : (spec ?? 'tier1,tier2').split(','))
    .map(t => t.trim().toLowerCase())
    .filter(Boolean);

  const wanted = new Set<SourceAdapter>();
  const unknown: string[] = [];
  for (const token of tokens) {
    const tierMatch = token.match(/^tier([123])$/);
    if (token === 'all') registry.forEach(s => wanted.add(s));
    else if (tierMatch) registry.filter(s => s.tier === (Number(tierMatch[1]) as SourceTier)).forEach(s => wanted.add(s));
    else {
      const source = registry.find(s => s.key === token);
      if (source) wanted.add(source);
      else unknown.push(token);
    }
  }

  const selected: SourceAdapter[] = [];
  const skipped: SourceSelection['skipped'] = [];
  for (const source of registry) {
    if (!wanted.has(source)) continue;
    if (source.tier === 3 && !config.tier3Enabled) {
      skipped.push({ key: source.key, reason: 'tier 3 is opt-in (set SCRAPER_ENABLE_TIER3=1 or --enable-tier3)' });
    } else if (!source.isConfigured(config)) {
      skipped.push({ key: source.key, reason: 'not configured (no boards/feeds/targets)' });
    } else {
      selected.push(source);
    }
  }
  return { selected, skipped, unknown };
}

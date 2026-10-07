import type { RawJob } from './ats-api-scraper.ts';

/** Profile-keyword relevance, without the scrapers (the Android app scores the feed with it). */

/**
 * computeRelevanceScore — keyword-match score (0–100) between a job and
 * a set of profile keywords/desired titles.
 */
export function computeRelevanceScore(job: RawJob, keywords: string[]): number {
  if (!keywords || keywords.length === 0) return 50;

  const normTitle = (job.title ?? '').toLowerCase();
  const normDesc = (job.description ?? '').toLowerCase();

  const validKeywords = keywords
    .map(r => (r ?? '').toLowerCase().trim())
    .filter(k => k.length > 0);

  if (validKeywords.length === 0) return 50;

  let weightedHits = 0;
  const maxWeighted = validKeywords.length * 2;

  for (const kw of validKeywords) {
    if (normTitle.includes(kw)) weightedHits += 2;
    else if (normDesc.includes(kw)) weightedHits += 1;
  }

  return Math.min(100, Math.round((weightedHits / maxWeighted) * 100));
}

/**
 * extractProfileKeywords — derives a keyword list from a profile object.
 */
export function extractProfileKeywords(profile?: Record<string, unknown>): string[] {
  if (!profile) return [];

  const collected: string[] = [];

  const rawKeywords = profile['keywords'];
  if (Array.isArray(rawKeywords)) {
    for (const k of rawKeywords) {
      if (typeof k === 'string' && k.trim()) collected.push(k.trim());
    }
  }

  const titles = profile['desiredTitle'] ?? profile['desired_title'];
  if (typeof titles === 'string') {
    collected.push(...titles.split(/[,;|]/));
  } else if (Array.isArray(titles)) {
    for (const t of titles) {
      if (typeof t === 'string') collected.push(...t.split(/[,;|]/));
    }
  }

  const stack = profile['techStack'] ?? profile['tech_stack'];
  if (typeof stack === 'string') {
    collected.push(...stack.split(/[,;|\s]+/));
  } else if (Array.isArray(stack)) {
    for (const t of stack) {
      if (typeof t === 'string') collected.push(...t.split(/[,;|\s]+/));
    }
  }

  const seen = new Set<string>();
  return collected
    .map(k => k.trim().toLowerCase())
    .filter(k => k.length >= 2 && !seen.has(k) && seen.add(k));
}

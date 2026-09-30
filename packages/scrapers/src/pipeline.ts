import type { RawJob } from './ats-api-scraper.js';
import { computeJobHash } from './hasher.js';

/** 1 = official APIs (invest), 2 = RSS / niche boards (keep if healthy), 3 = fragile scraping (opt-in). */
export type SourceTier = 1 | 2 | 3;

export interface SourceDef {
  name: string;
  tier: SourceTier;
  timeoutMs: number;
  run: () => Promise<RawJob[]>;
}

export interface SourceRunResult {
  name: string;
  tier: SourceTier;
  status: 'ok' | 'empty' | 'error' | 'timeout' | 'skipped';
  fetched: number;
  valid: number;
  dropped: number;
  ms: number;
  error?: string;
}

const clean = (s: unknown) =>
  String(s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = '';
    const keep = new URLSearchParams();
    // Only keep params that identify the job itself (Greenhouse embeds use gh_jid).
    for (const k of ['gh_jid', 'jid', 'job', 'id']) if (u.searchParams.has(k)) keep.set(k, u.searchParams.get(k)!);
    u.search = keep.toString();
    return (u.origin + u.pathname.replace(/\/+$/, '') + (u.search || '')).toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export type ValidationResult = { ok: true; job: RawJob } | { ok: false; reason: string };

/** Boundary validation: nothing malformed reaches the feed. Returns a cleaned copy. */
export function validateJob(j: Partial<RawJob> | null | undefined): ValidationResult {
  if (!j || typeof j !== 'object') return { ok: false, reason: 'not an object' };
  const title = clean(j.title);
  const company = clean(j.company);
  if (title.length < 3) return { ok: false, reason: 'missing title' };
  if (title.length > 180) return { ok: false, reason: 'title too long (likely scraped garbage)' };
  if (company.length < 2) return { ok: false, reason: 'missing company' };
  let url: URL;
  try {
    url = new URL(String(j.applyUrl ?? '').trim());
  } catch {
    return { ok: false, reason: 'invalid apply URL' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, reason: 'non-http apply URL' };
  if (/linkedin\.com/i.test(url.hostname) || /linkedin/i.test(String(j.source ?? ''))) return { ok: false, reason: 'LinkedIn excluded by policy' };
  const applyUrl = url.toString();
  const posted = j.postedAt ? new Date(j.postedAt) : undefined;
  return {
    ok: true,
    job: {
      ...(j as RawJob),
      title,
      company,
      applyUrl,
      location: clean(j.location) || 'Remote / Unspecified',
      description: j.description ?? '',
      source: j.source || 'Unknown',
      jobHash: j.jobHash || computeJobHash(company, title, applyUrl),
      postedAt: posted && !Number.isNaN(posted.getTime()) ? posted.toISOString() : undefined,
    },
  };
}

/** Dedupe by hash, canonical URL, and company+title+location. First occurrence wins (caller orders by tier). */
export function dedupeJobs(jobs: RawJob[]): { jobs: RawJob[]; dropped: number } {
  const seen = new Set<string>();
  const out: RawJob[] = [];
  for (const j of jobs) {
    const keys = [`h:${j.jobHash}`, `u:${canonicalUrl(j.applyUrl)}`, `t:${norm(j.company)}|${norm(j.title)}|${norm(j.location)}`];
    if (keys.some((k) => seen.has(k))) continue;
    keys.forEach((k) => seen.add(k));
    out.push(j);
  }
  return { jobs: out, dropped: jobs.length - out.length };
}

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });

export interface RunSourcesOptions {
  includeTier3?: boolean;
}

/** Run all sources in parallel; one broken source never hides another, and every source reports its health. */
export async function runSources(
  sources: SourceDef[],
  opts: RunSourcesOptions = {},
): Promise<{ jobs: RawJob[]; results: SourceRunResult[]; invalidReasons: Record<string, number> }> {
  const includeTier3 = opts.includeTier3 ?? process.env.NOMADIC_TIER3 === '1';
  const invalidReasons: Record<string, number> = {};
  const active = sources.filter((s) => s.tier < 3 || includeTier3);
  const results: SourceRunResult[] = sources
    .filter((s) => !active.includes(s))
    .map((s) => ({ name: s.name, tier: s.tier, status: 'skipped' as const, fetched: 0, valid: 0, dropped: 0, ms: 0 }));

  const settled = await Promise.all(
    active.map(async (s) => {
      const t0 = Date.now();
      try {
        const raw = await withTimeout(s.run(), s.timeoutMs);
        const list = Array.isArray(raw) ? raw : [];
        const valid: RawJob[] = [];
        for (const item of list) {
          const v = validateJob(item);
          if (v.ok) valid.push(v.job);
          else invalidReasons[v.reason] = (invalidReasons[v.reason] || 0) + 1;
        }
        const r: SourceRunResult = {
          name: s.name, tier: s.tier, status: list.length ? 'ok' : 'empty',
          fetched: list.length, valid: valid.length, dropped: list.length - valid.length, ms: Date.now() - t0,
        };
        return { jobs: valid, r, tier: s.tier };
      } catch (e: any) {
        const timeout = String(e?.message) === 'timeout';
        const r: SourceRunResult = {
          name: s.name, tier: s.tier, status: timeout ? 'timeout' : 'error',
          fetched: 0, valid: 0, dropped: 0, ms: Date.now() - t0, error: String(e?.message || e),
        };
        return { jobs: [] as RawJob[], r, tier: s.tier };
      }
    }),
  );

  // Lower tier first so trusted sources win when the same job appears in several places.
  const ordered = settled.sort((a, b) => a.tier - b.tier);
  results.push(...settled.map((x) => x.r));
  const { jobs, dropped } = dedupeJobs(ordered.flatMap((x) => x.jobs));
  if (dropped) invalidReasons['duplicate'] = dropped;
  return { jobs, results, invalidReasons };
}

export interface SourceAlert {
  source: string;
  kind: 'zero' | 'drop' | 'error';
  message: string;
}

/** Flag sources that returned nothing, errored, or dropped by more than 50% versus the previous run. */
export function detectSourceAlerts(current: SourceRunResult[], previous?: Pick<SourceRunResult, 'name' | 'valid'>[]): SourceAlert[] {
  const prev = new Map((previous || []).map((p) => [p.name, p.valid]));
  const alerts: SourceAlert[] = [];
  for (const r of current) {
    if (r.status === 'skipped') continue;
    if (r.status === 'error' || r.status === 'timeout')
      alerts.push({ source: r.name, kind: 'error', message: `${r.name} ${r.status}: ${r.error}` });
    else if (r.valid === 0) alerts.push({ source: r.name, kind: 'zero', message: `${r.name} returned 0 valid jobs` });
    else {
      const before = prev.get(r.name);
      if (before && before >= 10 && r.valid < before * 0.5)
        alerts.push({ source: r.name, kind: 'drop', message: `${r.name} dropped from ${before} to ${r.valid} jobs` });
    }
  }
  return alerts;
}

export function formatRunTable(results: SourceRunResult[]): string {
  const rows = results.map((r) => `| ${r.name} | T${r.tier} | ${r.status} | ${r.fetched} | ${r.valid} | ${r.dropped} | ${r.ms} ms | ${r.error ?? ''} |`);
  return ['| Source | Tier | Status | Fetched | Valid | Dropped | Time | Error |', '|---|---|---|---|---|---|---|---|', ...rows].join('\n');
}

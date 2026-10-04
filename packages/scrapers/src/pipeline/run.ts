import { randomUUID } from 'crypto';
import { parseJob, type PipelineJob } from '../job-schema.js';
import type { FetchLike } from '../sources/ats.js';
import { SOURCES, type SourceDefinition, type Tier } from '../sources/registry.js';
import { classifyRoleFamily, classifySeniority, refineEmploymentType } from './classify.js';
import { dedupeJobs } from './dedupe.js';
import { isFailedLink, validateLinks } from './link-validate.js';
import { canonicalizeUrl, dedupeKeyFor } from './normalize.js';
import { isIndiaEligible, type Region } from './region.js';
import { scoreJob } from './score.js';
import { toJobRow, type JobStore, type ScrapeRunRow } from './store.js';

/**
 * fetch -> normalize (zod) -> classify -> dedupe -> link-validate -> score -> upsert -> expire
 * plus one scrape_runs row per source and drop/zero alerts.
 */

export interface SourceStats {
  source: string;
  label: string;
  tier: Tier;
  status: 'ok' | 'error';
  error: string | null;
  warnings: string[];
  durationMs: number;
  fetched: number;
  valid: number;
  invalid: number;
  invalidSamples: string[];
  /** Valid jobs dropped by the region filter (e.g. US-only roles when region is india). */
  outOfRegion: number;
  duplicates: number;
  linkOk: number;
  linkFailed: number;
  linkUnknown: number;
  closed: number;
  upserted: number;
  expired: number;
  previousFetched: number | null;
  alert: string | null;
}

export interface PipelineReport {
  runId: string;
  startedAt: string;
  finishedAt: string;
  published: boolean;
  linkCheck: 'http' | 'structural';
  sources: SourceStats[];
  totals: {
    fetched: number;
    valid: number;
    unique: number;
    duplicates: number;
    linkFailed: number;
    upserted: number;
    expired: number;
    legacyExpired: number;
  };
  alerts: string[];
  /** Jobs that survived every stage (also what gets upserted when publishing). */
  jobs: PipelineJob[];
}

export interface PipelineOptions {
  sources?: SourceDefinition[];
  /** Write to the store (upsert/expire/scrape_runs). Without it the run is a dry run. */
  publish?: boolean;
  store?: JobStore;
  fetch?: FetchLike;
  /** HTTP liveness check for links (structural check always runs). Default true. */
  linkCheck?: boolean;
  /** Also HTTP-check links from official APIs (benchmark mode). Default false. */
  checkOfficialLinks?: boolean;
  linkConcurrency?: number;
  sourceTimeoutMs?: number;
  /** Max jobs kept per source after validation (0 = unlimited). */
  limitPerSource?: number;
  /** 'india' keeps only jobs open to candidates in India (see region.ts). Default 'all'. */
  region?: Region;
  now?: () => Date;
  log?: (message: string) => void;
}

const DROP_THRESHOLD = 0.5;

export function computeAlert(fetched: number, previous: number | null, status: 'ok' | 'error'): string | null {
  if (status === 'error') return 'source_error';
  if (fetched === 0) return 'zero_results';
  if (previous !== null && previous > 0 && fetched < previous * DROP_THRESHOLD) {
    return `dropped_${Math.round((1 - fetched / previous) * 100)}pct (was ${previous}, now ${fetched})`;
  }
  return null;
}

export function expirySkipReason(stats: SourceStats, truncated: boolean): string | null {
  if (stats.status !== 'ok') return 'source error';
  if (stats.alert) return stats.alert;
  if (stats.warnings.length > 0) return 'partial fetch (see warnings)';
  if (truncated) return 'results truncated by --limit-per-source';
  return null;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function emptyStats(source: SourceDefinition): SourceStats {
  return {
    source: source.id,
    label: source.label,
    tier: source.tier,
    status: 'ok',
    error: null,
    warnings: [],
    durationMs: 0,
    fetched: 0,
    valid: 0,
    invalid: 0,
    invalidSamples: [],
    outOfRegion: 0,
    duplicates: 0,
    linkOk: 0,
    linkFailed: 0,
    linkUnknown: 0,
    closed: 0,
    upserted: 0,
    expired: 0,
    previousFetched: null,
    alert: null,
  };
}

export async function runPipeline(options: PipelineOptions = {}): Promise<PipelineReport> {
  const sources = options.sources ?? SOURCES.filter((s) => s.tier !== 3);
  const now = options.now ?? (() => new Date());
  const log = options.log ?? (() => {});
  const fetchImpl: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const publish = Boolean(options.publish);
  const linkCheck = options.linkCheck ?? true;
  const store = options.store;
  if (publish && !store) throw new Error('publish requires a store');

  const runId = randomUUID();
  const startedAt = now().toISOString();
  const statsBySource = new Map<string, SourceStats>();
  const officialSources = new Set(sources.filter((s) => s.officialApi).map((s) => s.id));
  const truncated = new Set<string>();

  // ── 1. Fetch + normalize (all sources in parallel) ─────────────────────────
  const fetched = await Promise.all(
    sources.map(async (source) => {
      const stats = emptyStats(source);
      statsBySource.set(source.id, stats);
      const t0 = Date.now();
      const valid: PipelineJob[] = [];
      try {
        const candidates = await withTimeout(
          source.fetchCandidates({ fetch: fetchImpl, now: now(), warn: (msg) => stats.warnings.push(msg) }),
          options.sourceTimeoutMs ?? 90_000,
          source.id
        );
        stats.fetched = candidates.length;
        for (const candidate of candidates) {
          const parsed = parseJob(candidate);
          if (!parsed.ok) {
            stats.invalid++;
            if (stats.invalidSamples.length < 5) stats.invalidSamples.push(parsed.issues.join('; '));
            continue;
          }
          if (parsed.job.source !== source.id) {
            stats.invalid++;
            continue;
          }
          const job = parsed.job;
          if (options.region === 'india' && !source.indiaOnly && !isIndiaEligible(job)) {
            stats.outOfRegion++;
            continue;
          }
          const seniority = classifySeniority(job.title, job.employmentType);
          valid.push({
            ...job,
            employmentType: refineEmploymentType(job.employmentType, seniority),
            tier: source.tier,
            canonicalUrl: canonicalizeUrl(job.applyUrl),
            dedupeKey: dedupeKeyFor(job),
            roleFamily: classifyRoleFamily(job.title, job.description),
            seniority,
            linkStatus: 'unchecked',
            score: 0,
          });
        }
        if (options.limitPerSource && valid.length > options.limitPerSource) {
          valid.length = options.limitPerSource;
          truncated.add(source.id);
        }
        stats.valid = valid.length;
      } catch (err) {
        stats.status = 'error';
        stats.error = err instanceof Error ? err.message : String(err);
      }
      stats.durationMs = Date.now() - t0;
      if (stats.invalid > 0)
        log(`[${source.id}] dropped ${stats.invalid} invalid record(s): ${stats.invalidSamples[0]}`);
      log(
        `[${source.id}] fetched=${stats.fetched} valid=${stats.valid}${stats.outOfRegion ? ` outside-region=${stats.outOfRegion}` : ''}${stats.error ? ` error=${stats.error}` : ''} (${stats.durationMs}ms)`
      );
      return valid;
    })
  );

  // ── 2. Dedupe across sources ───────────────────────────────────────────────
  const { kept, duplicates } = dedupeJobs(fetched.flat());
  for (const dup of duplicates) statsBySource.get(dup.job.source)!.duplicates++;

  // ── 3. Link validation ───────────────────────────────────────────────────
  const officialUrls = new Set(kept.filter((j) => officialSources.has(j.source)).map((j) => j.applyUrl));
  const linkResults = await validateLinks(
    kept.map((j) => j.applyUrl),
    {
      fetch: fetchImpl,
      http: linkCheck,
      concurrency: options.linkConcurrency ?? 10,
      trusted: options.checkOfficialLinks ? undefined : (url) => officialUrls.has(url),
    }
  );
  const linkCheckedAt = linkCheck ? now().toISOString() : null;

  const live: PipelineJob[] = [];
  const failedBySource = new Map<string, string[]>();
  for (const job of kept) {
    const result = linkResults.get(job.applyUrl) ?? { status: 'unchecked' as const };
    job.linkStatus = result.status;
    job.linkReason = result.reason;
    const stats = statsBySource.get(job.source)!;
    if (isFailedLink(result.status)) {
      stats.linkFailed++;
      if (result.status === 'closed') stats.closed++;
      failedBySource.set(job.source, [...(failedBySource.get(job.source) ?? []), job.sourceJobId]);
      continue;
    }
    if (result.status === 'ok') stats.linkOk++;
    else stats.linkUnknown++;
    job.score = scoreJob(job, now());
    live.push(job);
  }
  live.sort((a, b) => b.score - a.score);

  // ── 4. Alerts vs. previous run ───────────────────────────────────────────
  const previous = store ? await store.getPreviousFetchCounts(sources.map((s) => s.id)).catch(() => ({})) : {};
  const alerts: string[] = [];
  for (const stats of statsBySource.values()) {
    stats.previousFetched = (previous as Record<string, number>)[stats.source] ?? null;
    stats.alert = computeAlert(stats.fetched, stats.previousFetched, stats.status);
    if (stats.alert) alerts.push(`${stats.source}: ${stats.alert}${stats.error ? ` (${stats.error})` : ''}`);
  }

  // ── 5. Upsert + expire ───────────────────────────────────────────────────
  let legacyExpired = 0;
  if (publish && store) {
    const labels = new Map(sources.map((s) => [s.id, s.label]));
    const seenAt = startedAt;
    for (const source of sources) {
      const stats = statsBySource.get(source.id)!;
      const rows = live
        .filter((j) => j.source === source.id)
        .map((j) => toJobRow(j, labels.get(j.source)!, seenAt, linkCheckedAt));
      try {
        stats.upserted = await store.upsertJobs(rows);
        stats.expired += await store.expireByIds(source.id, failedBySource.get(source.id) ?? [], 'link_check_failed');
        // Expire jobs that disappeared from the source, but only after a complete,
        // healthy fetch: an outage, a >50% drop, one failed board, or a
        // --limit-per-source cut would otherwise expire jobs that are still open.
        const skipReason = expirySkipReason(stats, truncated.has(source.id));
        if (skipReason) {
          stats.warnings.push(`skipped expiry of unseen jobs: ${skipReason}`);
        } else {
          stats.expired += await store.expireUnseen(source.id, seenAt, 'not_seen_in_source');
        }
      } catch (err) {
        stats.status = 'error';
        stats.error = err instanceof Error ? err.message : String(err);
        alerts.push(`${source.id}: publish_error (${stats.error})`);
      }
    }

    // Rows from the old publishers have no source_id; once this pipeline has
    // published a healthy run they are superseded.
    const upsertedTotal = [...statsBySource.values()].reduce((n, s) => n + s.upserted, 0);
    const healthy = [...statsBySource.values()].filter(
      (s) => s.tier === 1 && s.status === 'ok' && s.upserted > 0
    ).length;
    if (upsertedTotal > 0 && healthy >= 2) {
      legacyExpired = await store.expireLegacy('superseded_by_pipeline').catch(() => 0);
    }
  }

  const finishedAt = now().toISOString();
  const statsList = sources.map((s) => statsBySource.get(s.id)!);

  if (publish && store) {
    const rows: ScrapeRunRow[] = statsList.map((s) => ({
      run_id: runId,
      source: s.source,
      tier: s.tier,
      status: s.status,
      started_at: startedAt,
      finished_at: finishedAt,
      duration_ms: s.durationMs,
      fetched: s.fetched,
      valid: s.valid,
      invalid: s.invalid,
      duplicates: s.duplicates,
      link_failed: s.linkFailed,
      upserted: s.upserted,
      expired: s.expired,
      error: s.error,
      alert: s.alert,
      published: true,
    }));
    await store.insertScrapeRuns(rows);
  }

  const sum = (pick: (s: SourceStats) => number) => statsList.reduce((n, s) => n + pick(s), 0);
  return {
    runId,
    startedAt,
    finishedAt,
    published: publish,
    linkCheck: linkCheck ? 'http' : 'structural',
    sources: statsList,
    totals: {
      fetched: sum((s) => s.fetched),
      valid: sum((s) => s.valid),
      unique: live.length,
      duplicates: sum((s) => s.duplicates),
      linkFailed: sum((s) => s.linkFailed),
      upserted: sum((s) => s.upserted),
      expired: sum((s) => s.expired),
      legacyExpired,
    },
    alerts,
    jobs: live,
  };
}

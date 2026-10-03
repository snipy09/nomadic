import crypto from 'crypto';
import { loadScraperConfig, type ScraperConfig } from '../config.ts';
import { getSource, resolveSources } from '../sources/registry.ts';
import {
  consoleLogger,
  errorMessage,
  type Logger,
  type SourceAdapter,
  type SourceContext,
  type SourceFetchResult,
} from '../sources/types.ts';
import { computeAlerts, dispatchAlerts } from './alerts.ts';
import { classifyJob } from './classify.ts';
import { dedupeJobs } from './dedupe.ts';
import { validateJobLinks, type LinkCheckOptions } from './link-validation.ts';
import { parseJob, type Job } from './schema.ts';
import { computeQualityScore } from './score.ts';
import { defaultSkillTagger, type SkillTagger } from './skills.ts';
import { pipelineJobHash } from './store.ts';
import type {
  JobStore,
  PipelineJob,
  ScrapeAlert,
  ScrapeRunRecord,
  SourceRunStats,
} from './types.ts';

/**
 * The scraper pipeline (Phase 2, Step 2.2):
 *
 *   fetch -> normalize (zod) -> dedupe -> link validation -> classify + skills
 *   -> score -> upsert by (source, source_job_id) -> expire missing -> record run
 */

export interface RunPipelineOptions {
  /** `tier1,tier2` (default), `all`, `tier3`, or source keys. */
  sources?: string | string[];
  config?: ScraperConfig;
  /** Where to write. Required when `publish` is true. */
  store?: JobStore;
  publish?: boolean;
  fetchImpl?: typeof fetch;
  linkCheck?: LinkCheckOptions;
  skillTagger?: SkillTagger;
  log?: Logger;
  now?: () => Date;
  trigger?: string;
  alertWebhookUrl?: string;
  runId?: string;
  /** Run the DB lifecycle RPC after publishing (default true). */
  maintainLifecycle?: boolean;
}

export interface PipelineResult {
  run: ScrapeRunRecord;
  /** Active jobs after every stage (what the feed will show from this run). */
  jobs: PipelineJob[];
  /** Jobs found closed by link validation (written as expired when publishing). */
  closedJobs: PipelineJob[];
  /** Normalized jobs before dedupe, per source (useful for metrics). */
  normalizedBySource: Record<string, Job[]>;
  duplicates: Array<{ job: Job; duplicateOf: Job; reason: string }>;
  alerts: ScrapeAlert[];
}

function emptyStats(source: SourceAdapter): SourceRunStats {
  return {
    key: source.key,
    label: source.label,
    tier: source.tier,
    status: 'ok',
    fetched: 0,
    valid: 0,
    invalid: 0,
    duplicates: 0,
    closed: 0,
    published: 0,
    expired: 0,
    durationMs: 0,
    errors: [],
  };
}

export async function runPipeline(options: RunPipelineOptions = {}): Promise<PipelineResult> {
  const log = options.log ?? consoleLogger;
  const now = options.now ?? (() => new Date());
  const config = options.config ?? loadScraperConfig();
  const fetchImpl = options.fetchImpl ?? fetch;
  const tagger = options.skillTagger ?? defaultSkillTagger;
  const runId = options.runId ?? crypto.randomUUID();
  const publish = Boolean(options.publish);
  if (publish && !options.store) throw new Error('runPipeline: publish=true requires a store');

  const started = now();
  const startedAt = started.toISOString();
  const selection = resolveSources(options.sources, config);
  for (const u of selection.unknown) log.warn(`[pipeline] unknown source "${u}" ignored`);
  for (const s of selection.skipped) log.info(`[pipeline] skipping ${s.key}: ${s.reason}`);

  const ctx: SourceContext = { fetch: fetchImpl, config, log, now: started };
  const statsByKey = new Map<string, SourceRunStats>();
  const fetchResults = new Map<string, SourceFetchResult>();

  // ── 1. fetch (sources in parallel) ────────────────────────────────────────
  await Promise.all(
    selection.selected.map(async source => {
      const stats = emptyStats(source);
      statsByKey.set(source.key, stats);
      const t0 = Date.now();
      try {
        const res = await source.fetchRaw(ctx);
        fetchResults.set(source.key, res);
        stats.fetched = res.records.length;
        stats.closed += res.closedSignals;
        stats.errors.push(...res.errors);
        if (res.errors.length > 0) stats.status = res.records.length > 0 ? 'partial' : 'failed';
      } catch (err) {
        stats.status = 'failed';
        stats.errors.push(`${source.key}: ${errorMessage(err)}`);
        fetchResults.set(source.key, { records: [], errors: [], failedScopes: ['*'], closedSignals: 0 });
      }
      stats.durationMs = Date.now() - t0;
    }),
  );

  // ── 2. normalize + validate (registry order => deterministic dedupe) ──────
  const normalizedBySource: Record<string, Job[]> = {};
  const allJobs: Job[] = [];
  for (const source of selection.selected) {
    const stats = statsByKey.get(source.key)!;
    const res = fetchResults.get(source.key)!;
    const jobs: Job[] = [];
    let logged = 0;
    for (const record of res.records) {
      let issues: string[];
      try {
        const input = source.normalize(record, ctx);
        if (!input) {
          issues = ['adapter returned null'];
        } else {
          const parsed = parseJob(input);
          if (parsed.ok) {
            jobs.push(parsed.job);
            continue;
          }
          issues = parsed.issues;
        }
      } catch (err) {
        issues = [`normalize threw: ${errorMessage(err)}`];
      }
      stats.invalid++;
      if (logged++ < 3) log.warn(`[pipeline] ${source.key}: dropped invalid record (${issues.join('; ')})`);
    }
    if (stats.invalid > 3) log.warn(`[pipeline] ${source.key}: ${stats.invalid} invalid records dropped in total`);
    stats.valid = jobs.length;
    normalizedBySource[source.key] = jobs;
    allJobs.push(...jobs);
  }

  // ── 3. dedupe ─────────────────────────────────────────────────────────────
  const { kept, duplicates } = dedupeJobs(allJobs);
  for (const d of duplicates) statsByKey.get(d.job.source)!.duplicates++;

  // ── 4. link validation ────────────────────────────────────────────────────
  const links = await validateJobLinks(kept, { fetchImpl, ...options.linkCheck });

  // ── 5-6. classify, tag skills, score ──────────────────────────────────────
  const active: PipelineJob[] = [];
  const closed: PipelineJob[] = [];
  kept.forEach((job, i) => {
    const link = links[i];
    const stats = statsByKey.get(job.source)!;
    if (link.status === 'invalid') {
      stats.invalid++;
      return;
    }
    const cls = classifyJob(job);
    const skills = tagger.tag(`${job.title}\n${job.description}`);
    const pj: PipelineJob = {
      ...job,
      applyUrl: link.applyUrl,
      jobHash: pipelineJobHash(job.source, job.sourceJobId),
      canonicalUrl: link.canonicalUrl,
      linkStatus: link.status,
      linkReason: link.reason ?? null,
      roleFamily: cls.roleFamily,
      seniority: cls.seniority,
      feedType: cls.feedType,
      experienceLevel: cls.experienceLevel,
      skills,
      qualityScore: computeQualityScore(job, { linkStatus: link.status, skills, now: started.getTime() }),
      status: link.status === 'closed' ? 'expired' : 'active',
      expireReason: link.status === 'closed' ? `link_closed:${link.reason ?? 'unknown'}` : null,
    };
    if (pj.status === 'active') {
      active.push(pj);
      stats.published++;
    } else {
      closed.push(pj);
      stats.closed++;
    }
  });

  // ── 7. upsert + expire ────────────────────────────────────────────────────
  const runErrors: string[] = [];
  if (publish && options.store) {
    const store = options.store;
    const upsert = await store.upsertJobs([...active, ...closed], { seenAt: startedAt, runId });
    runErrors.push(...upsert.errors);
    if (upsert.errors.length === 0) {
      for (const source of selection.selected) {
        const stats = statsByKey.get(source.key)!;
        const res = fetchResults.get(source.key)!;
        // Never expire on a failed/empty fetch: an outage must not wipe the feed.
        if (stats.status === 'failed' || stats.fetched === 0 || res.failedScopes.includes('*')) continue;
        const exp = await store.expireMissing({
          source: source.key,
          seenBefore: startedAt,
          excludeCompanies: res.failedScopes,
          reason: 'disappeared',
          at: now().toISOString(),
        });
        if (exp.error) stats.errors.push(`expire: ${exp.error}`);
        stats.expired = exp.expired;
      }
    } else {
      log.error(`[pipeline] upsert had errors; skipping expiry this run: ${upsert.errors.join(' | ')}`);
    }
  }

  // ── 8. alerts ─────────────────────────────────────────────────────────────
  const sources: SourceRunStats[] = [
    ...selection.selected.map(s => statsByKey.get(s.key)!),
    ...selection.skipped.map(s => ({
      ...emptyStats(getSource(s.key)!),
      status: 'skipped' as const,
      skipReason: s.reason,
    })),
  ];
  const previous = options.store ? await options.store.getLastSourceCounts(selection.selected.map(s => s.key)) : {};
  const alerts = computeAlerts(sources, previous);
  const alertWebhookUrl = options.alertWebhookUrl ?? process.env.SCRAPER_ALERT_WEBHOOK_URL;
  const delivery = await dispatchAlerts(alerts, { log, webhookUrl: alertWebhookUrl, fetchImpl, runId });
  if (delivery.error) log.warn(`[pipeline] alert webhook failed: ${delivery.error}`);

  // ── 9. record run ─────────────────────────────────────────────────────────
  const finished = now();
  const ran = sources.filter(s => s.status !== 'skipped');
  const sum = (k: keyof Pick<SourceRunStats, 'fetched' | 'valid' | 'invalid' | 'duplicates' | 'closed' | 'published' | 'expired'>) =>
    ran.reduce((acc, s) => acc + s[k], 0);
  const anyFailed = ran.some(s => s.status !== 'ok') || runErrors.length > 0;
  const run: ScrapeRunRecord = {
    id: runId,
    startedAt,
    finishedAt: finished.toISOString(),
    durationMs: Math.max(0, finished.getTime() - started.getTime()),
    status: ran.length > 0 && ran.every(s => s.status === 'failed') ? 'failed' : anyFailed ? 'partial' : 'ok',
    trigger: options.trigger ?? 'cli',
    sourcesRequested: Array.isArray(options.sources) ? options.sources : (options.sources ?? 'tier1,tier2').split(','),
    published: publish,
    totals: {
      fetched: sum('fetched'),
      valid: sum('valid'),
      invalid: sum('invalid'),
      duplicates: sum('duplicates'),
      closed: sum('closed'),
      published: publish ? sum('published') : 0,
      expired: sum('expired'),
    },
    alerts,
    error: runErrors.length > 0 ? runErrors.join(' | ').slice(0, 2000) : null,
    sources,
  };

  if (publish && options.store) {
    const rec = await options.store.recordRun(run);
    if (rec.error) log.error(`[pipeline] could not record scrape run: ${rec.error}`);
    if (options.maintainLifecycle !== false && options.store.maintainLifecycle) {
      const m = await options.store.maintainLifecycle();
      if (m.error) log.warn(`[pipeline] lifecycle maintenance: ${m.error}`);
    }
  }

  return { run, jobs: active, closedJobs: closed, normalizedBySource, duplicates, alerts };
}

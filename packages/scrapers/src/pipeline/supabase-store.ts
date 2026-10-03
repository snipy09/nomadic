import type { SupabaseClient } from '@supabase/supabase-js';
import { toJobRow } from './store.ts';
import type { ExpireScope, JobStore, PipelineJob, ScrapeAlert, ScrapeRunRecord, SourceRunStatus } from './types.ts';

/**
 * Supabase-backed JobStore. Needs the SERVICE ROLE key: since migration 002 the
 * anon key can only read the feed, and `scrape_runs` is operator-only.
 */
export class SupabaseJobStore implements JobStore {
  constructor(private readonly supabase: SupabaseClient, private readonly batchSize = 200) {}

  async upsertJobs(jobs: PipelineJob[], ctx: { seenAt: string; runId: string }) {
    const errors: string[] = [];
    let upserted = 0;
    for (let i = 0; i < jobs.length; i += this.batchSize) {
      const rows = jobs.slice(i, i + this.batchSize).map(j => toJobRow(j, ctx));
      // first_seen_at / created_at are omitted so the column defaults apply on
      // insert and existing values are untouched on conflict.
      const { error } = await this.supabase
        .from('jobs')
        .upsert(rows, { onConflict: 'source_key,source_job_id', ignoreDuplicates: false });
      if (error) errors.push(`upsert batch ${i / this.batchSize + 1}: ${error.message}`);
      else upserted += rows.length;
    }
    return { upserted, errors };
  }

  async expireMissing(scope: ExpireScope) {
    let query = this.supabase
      .from('jobs')
      .update({ status: 'expired', is_active: false, expired_at: scope.at, expire_reason: scope.reason })
      .eq('source_key', scope.source)
      .eq('status', 'active')
      .lt('last_seen_at', scope.seenBefore);
    if (scope.excludeCompanies.length > 0) {
      const list = scope.excludeCompanies.map(c => `"${c.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',');
      query = query.not('company', 'in', `(${list})`);
    }
    const { data, error } = await query.select('id');
    if (error) return { expired: 0, error: error.message };
    return { expired: Array.isArray(data) ? data.length : 0 };
  }

  async getLastSourceCounts(sources: string[]) {
    const out: Record<string, number | null> = {};
    await Promise.all(
      sources.map(async source => {
        const { data, error } = await this.supabase
          .from('scrape_run_sources')
          .select('fetched_count')
          .eq('source_key', source)
          .neq('status', 'skipped')
          .order('started_at', { ascending: false })
          .limit(1);
        out[source] = !error && Array.isArray(data) && data.length > 0 ? Number(data[0].fetched_count) : null;
      }),
    );
    return out;
  }

  async recordRun(run: ScrapeRunRecord) {
    const { error } = await this.supabase.from('scrape_runs').insert({
      id: run.id,
      started_at: run.startedAt,
      finished_at: run.finishedAt,
      duration_ms: run.durationMs,
      status: run.status,
      trigger: run.trigger,
      sources_requested: run.sourcesRequested,
      published: run.published,
      fetched_count: run.totals.fetched,
      valid_count: run.totals.valid,
      invalid_count: run.totals.invalid,
      duplicate_count: run.totals.duplicates,
      closed_count: run.totals.closed,
      published_count: run.totals.published,
      expired_count: run.totals.expired,
      alerts: run.alerts,
      error: run.error,
    });
    if (error) return { error: `scrape_runs insert: ${error.message}` };

    const rows = run.sources.map(s => ({
      run_id: run.id,
      source_key: s.key,
      source_label: s.label,
      tier: s.tier,
      status: s.status,
      started_at: run.startedAt,
      duration_ms: s.durationMs,
      fetched_count: s.fetched,
      valid_count: s.valid,
      invalid_count: s.invalid,
      duplicate_count: s.duplicates,
      closed_count: s.closed,
      published_count: s.published,
      expired_count: s.expired,
      errors: s.errors.slice(0, 50),
      skip_reason: s.skipReason ?? null,
    }));
    if (rows.length > 0) {
      const res = await this.supabase.from('scrape_run_sources').insert(rows);
      if (res.error) return { error: `scrape_run_sources insert: ${res.error.message}` };
    }
    return {};
  }

  async maintainLifecycle() {
    const { data, error } = await this.supabase.rpc('maintain_jobs_lifecycle');
    return error ? { error: error.message } : { result: data };
  }
}

// ── Admin view API ───────────────────────────────────────────────────────────

export interface ScrapeRunSourceSummary {
  sourceKey: string;
  sourceLabel: string;
  tier: number;
  status: SourceRunStatus;
  durationMs: number;
  fetched: number;
  valid: number;
  invalid: number;
  duplicates: number;
  closed: number;
  published: number;
  expired: number;
  errors: string[];
  skipReason: string | null;
}

export interface ScrapeRunSummary {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  status: 'ok' | 'partial' | 'failed';
  trigger: string;
  published: boolean;
  totals: ScrapeRunRecord['totals'];
  alerts: ScrapeAlert[];
  error: string | null;
  sources: ScrapeRunSourceSummary[];
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0) || 0);

/**
 * Recent scrape runs (newest first) with per-source rows, for the desktop admin
 * view. Pass the SERVICE ROLE client (`getServiceSupabase()` in the desktop
 * main process): `scrape_runs` has RLS enabled with no anon policy.
 */
export async function getRecentScrapeRuns(supabase: SupabaseClient, limit = 20): Promise<ScrapeRunSummary[]> {
  const { data, error } = await supabase
    .from('scrape_runs')
    .select('*, sources:scrape_run_sources(*)')
    .order('started_at', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 200)));
  if (error) throw new Error(`getRecentScrapeRuns: ${error.message}`);

  return (data ?? []).map((r: any): ScrapeRunSummary => ({
    id: r.id,
    startedAt: r.started_at,
    finishedAt: r.finished_at ?? null,
    durationMs: r.duration_ms ?? null,
    status: r.status,
    trigger: r.trigger,
    published: Boolean(r.published),
    totals: {
      fetched: num(r.fetched_count),
      valid: num(r.valid_count),
      invalid: num(r.invalid_count),
      duplicates: num(r.duplicate_count),
      closed: num(r.closed_count),
      published: num(r.published_count),
      expired: num(r.expired_count),
    },
    alerts: Array.isArray(r.alerts) ? r.alerts : [],
    error: r.error ?? null,
    sources: (Array.isArray(r.sources) ? r.sources : [])
      .map((s: any): ScrapeRunSourceSummary => ({
        sourceKey: s.source_key,
        sourceLabel: s.source_label ?? s.source_key,
        tier: num(s.tier),
        status: s.status,
        durationMs: num(s.duration_ms),
        fetched: num(s.fetched_count),
        valid: num(s.valid_count),
        invalid: num(s.invalid_count),
        duplicates: num(s.duplicate_count),
        closed: num(s.closed_count),
        published: num(s.published_count),
        expired: num(s.expired_count),
        errors: Array.isArray(s.errors) ? s.errors : [],
        skipReason: s.skip_reason ?? null,
      }))
      .sort((a: ScrapeRunSourceSummary, b: ScrapeRunSourceSummary) => a.tier - b.tier || a.sourceKey.localeCompare(b.sourceKey)),
  }));
}

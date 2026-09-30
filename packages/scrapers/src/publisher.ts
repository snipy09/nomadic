import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScoredJob, ScrapeReport } from './index.ts';

export interface PublishResult {
  upserted: number;
  failedBatches: number;
  expired: number;
  /** True when the freshness columns (migration 006) were missing and the legacy payload was used. */
  legacySchema: boolean;
}

/** A source is only trusted to expire its old jobs when it returned a healthy number of them this run. */
const MIN_JOBS_TO_EXPIRE = 10;
const BATCH_SIZE = 100;

function rowFor(j: ScoredJob, runStart: string, full: boolean) {
  const base = {
    job_hash: j.jobHash,
    company: j.company,
    title: j.title,
    location: j.location || 'Remote',
    description: (j.description || '').slice(0, 5000),
    apply_url: j.applyUrl,
    source: j.source || 'Direct ATS',
    salary_range: j.salary || null,
    is_active: true,
  };
  if (!full) return base;
  return {
    ...base,
    employment_type: j.employmentType || 'job',
    workplace_type: j.workplaceType || null,
    experience_level: j.experienceLevel || null,
    posted_at: j.postedAt || null,
    last_seen_at: runStart,
  };
}

/**
 * Upsert jobs, then deactivate jobs from healthy sources that this run no longer saw (closed/removed postings).
 * Falls back to the pre-migration column set so publishing never hard-fails on an older database.
 */
export async function publishJobs(supabase: SupabaseClient, jobs: ScoredJob[], runStartedAt = new Date()): Promise<PublishResult> {
  const runStart = runStartedAt.toISOString();
  let full = true;
  let upserted = 0;
  let failedBatches = 0;

  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const chunk = jobs.slice(i, i + BATCH_SIZE);
    let { error } = await supabase.from('jobs').upsert(chunk.map((j) => rowFor(j, runStart, full)), { onConflict: 'job_hash', ignoreDuplicates: false });
    if (error && full && /column|schema cache/i.test(error.message)) {
      console.warn('[Publisher] jobs table is missing migration 006 columns; publishing without freshness data. Apply packages/supabase/migrations/006_job_freshness.sql.');
      full = false;
      ({ error } = await supabase.from('jobs').upsert(chunk.map((j) => rowFor(j, runStart, false)), { onConflict: 'job_hash', ignoreDuplicates: false }));
    }
    if (error) {
      failedBatches++;
      console.warn(`[Publisher] Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${error.message}`);
    } else upserted += chunk.length;
  }

  let expired = 0;
  if (full && failedBatches === 0) {
    const perSource = new Map<string, number>();
    for (const j of jobs) perSource.set(j.source || 'Direct ATS', (perSource.get(j.source || 'Direct ATS') || 0) + 1);
    for (const [source, count] of perSource) {
      if (count < MIN_JOBS_TO_EXPIRE) continue;
      const { data, error } = await supabase
        .from('jobs')
        .update({ is_active: false })
        .eq('source', source)
        .eq('is_active', true)
        .or(`last_seen_at.is.null,last_seen_at.lt.${runStart}`)
        .select('id');
      if (error) console.warn(`[Publisher] Could not expire stale ${source} jobs: ${error.message}`);
      else expired += data?.length || 0;
    }
  }
  return { upserted, failedBatches, expired, legacySchema: !full };
}

/** Best-effort run log for the admin view; never throws. */
export async function recordScrapeRun(supabase: SupabaseClient, report: ScrapeReport, result: PublishResult, startedAt: Date): Promise<void> {
  try {
    await supabase.from('scrape_runs').insert({
      started_at: startedAt.toISOString(),
      total_jobs: report.jobs.length,
      upserted: result.upserted,
      expired: result.expired,
      sources: report.sources,
      alerts: report.alerts,
    });
  } catch {
    /* table may not exist yet */
  }
}

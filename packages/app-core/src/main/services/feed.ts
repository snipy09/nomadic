import { runAllScrapers, computeRelevanceScore, extractProfileKeywords } from '@job-automator/scrapers';
import type { CloudFeedPageOptions, FeedJob, SavedJob, SaveJobInput } from '../../shared/ipc.js';
import { getDb } from '../db.js';
import { log } from './app-context.js';
import { getAnonSupabase } from './supabase.js';
import { getMasterProfileRow } from './profile.js';
import { removeAndSyncJob, saveAndSyncJob } from './cloud-sync.js';

/** Maps a Supabase `jobs` row to a scored feed job. */
// Unknown fields stay unknown: no invented location, seniority or posting date.
function mapCloudJob(j: Record<string, any>, profileKeywords: string[]): FeedJob {
  const rawJob = {
    title: (j['title'] as string) || '',
    company: (j['company'] as string) || '',
    location: (j['location'] as string) || '',
    applyUrl: (j['apply_url'] as string) || '',
    source: (j['source'] as string) || 'Cloud Feed',
    description: (j['description'] as string) || '',
    jobHash: (j['job_hash'] as string) || '',
  };
  const score = computeRelevanceScore(rawJob, profileKeywords);
  const titleLower = rawJob.title.toLowerCase();
  const locLower = rawJob.location.toLowerCase();
  // The jobs table stores 'unknown' as the default for these columns.
  const known = (v: unknown): string | undefined => (typeof v === 'string' && v && v !== 'unknown' ? v : undefined);
  return {
    ...rawJob,
    salary: (j['salary_range'] as string) || undefined,
    score,
    employmentType: known(j['employment_type']) || (titleLower.includes('intern') ? 'internship' : undefined),
    workplaceType: known(j['workplace_type']) || (j['remote'] || locLower.includes('remote') ? 'remote' : undefined),
    experienceLevel: known(j['seniority']),
    createdAt: (j['posted_at'] as string) || (j['first_seen'] as string) || (j['created_at'] as string) || undefined,
  };
}

export async function runScrapers(): Promise<{ success: boolean; jobs: FeedJob[]; error?: string }> {
  log('[Scrapers] Starting high-throughput scraper pipeline...');
  try {
    const jobs = await runAllScrapers();
    log(`[Scrapers] Pipeline complete. Found ${jobs.length} unique positions.`);
    return { success: true, jobs };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[Scrapers] ERROR: ${msg}`);
    return { success: false, error: msg, jobs: [] };
  }
}

// Fast Instant Page-Wise Hydration (< 30ms)
export async function getCloudFeedPage(
  opts?: CloudFeedPageOptions
): Promise<{ success: boolean; jobs: FeedJob[]; totalCount: number }> {
  const page = Math.max(1, opts?.page || 1);
  const pageSize = opts?.pageSize || 18;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    const profileData: Record<string, unknown> = getMasterProfileRow() ?? {};

    const supabase = getAnonSupabase();
    if (!supabase) return { success: false, jobs: [], totalCount: 0 };

    let query = supabase
      .from('jobs')
      .select('*', { count: 'exact' })
      .eq('is_active', true);

    if (opts?.filterTab === 'internships') {
      query = query.or('employment_type.ilike.%intern%,title.ilike.%intern%,source.ilike.%internshala%');
    } else if (opts?.filterTab === 'jobs') {
      query = query.not('title', 'ilike', '%intern%').not('employment_type', 'ilike', '%intern%');
    } else if (opts?.filterTab === 'internshala') {
      query = query.ilike('source', '%internshala%');
    } else if (opts?.filterTab === 'remote') {
      query = query.or('workplace_type.ilike.%remote%,location.ilike.%remote%');
    }

    if (opts?.search && opts.search.trim().length > 0) {
      const s = opts.search.trim();
      query = query.or(`title.ilike.%${s}%,company.ilike.%${s}%,location.ilike.%${s}%`);
    }

    if (opts?.source && opts.source !== 'all') {
      query = query.eq('source', opts.source);
    }

    const { data: dbJobs, count, error } = await query
      .order('posted_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error || !dbJobs || !Array.isArray(dbJobs)) {
      return { success: false, jobs: [], totalCount: 0 };
    }

    const profileKeywords = extractProfileKeywords(profileData);
    const jobs = dbJobs.map((j) => mapCloudJob(j, profileKeywords));

    return { success: true, jobs, totalCount: count ?? jobs.length };
  } catch (err: any) {
    log(`[Cloud Feed Page] Error: ${err?.message}`);
    return { success: false, jobs: [], totalCount: 0 };
  }
}

// Supabase Cloud + Live Scrapers
export async function getCloudFeed(): Promise<{ success: boolean; jobs: FeedJob[]; error?: string }> {
  log(`[Cloud Sync] Syncing latest job opportunities from Supabase Cloud...`);
  try {
    const profileData: Record<string, unknown> = getMasterProfileRow() ?? {};

    let cloudJobs: FeedJob[] = [];
    try {
      const supabase = getAnonSupabase();
      if (supabase) {
        const { data: dbJobs, error } = await supabase
          .from('jobs')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1500);

        if (!error && dbJobs && Array.isArray(dbJobs) && dbJobs.length > 0) {
          const profileKeywords = extractProfileKeywords(profileData);
          cloudJobs = dbJobs.map((j) => mapCloudJob(j, profileKeywords));
          log(`[Cloud Sync] Loaded ${cloudJobs.length} active opportunities from Supabase (scored against candidate profile).`);
        }
      }
    } catch (err: any) {
      log(`[Cloud Sync] Supabase notice: ${err?.message}`);
    }

    // If cloud feed has no jobs, run local high-throughput scraper on the fly as guaranteed fallback
    if (cloudJobs.length === 0) {
      log(`[Cloud Sync] Running local scraper pipeline for instant feed population...`);
      try {
        const scraped = await runAllScrapers(profileData);
        if (scraped && scraped.length > 0) {
          cloudJobs = scraped.map(s => ({
            ...s,
            applyUrl: s.applyUrl,
          }));
        }
      } catch (scrapErr: any) {
        log(`[Cloud Sync] Scraper fallback warning: ${scrapErr?.message}`);
      }
    }

    const combined = [...cloudJobs];
    const seenUrls = new Set<string>();
    const deduplicated: FeedJob[] = [];

    for (const job of combined) {
      const url = (job.applyUrl || '').toLowerCase();
      const src = (job.source || '').toLowerCase();
      if (url.includes('linkedin.com') || src.includes('linkedin')) continue;
      if (url && !seenUrls.has(url)) {
        seenUrls.add(url);
        deduplicated.push(job);
      }
    }

    log(`[Cloud Sync] Feed active with ${deduplicated.length} verified listings.`);
    return { success: true, jobs: deduplicated };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[Cloud Sync] Sync error: ${msg}`);
    return { success: false, error: msg, jobs: [] };
  }
}

export function getSavedJobs(): SavedJob[] {
  try {
    const db = getDb();
    const results = db.exec('SELECT * FROM saved_jobs ORDER BY saved_at DESC');
    if (!results.length) return [];
    const cols = results[0].columns;
    return results[0].values.map(row => {
      const obj = Object.fromEntries(cols.map((c, i) => [c, row[i]]));
      return {
        title: String(obj['title'] ?? ''),
        company: String(obj['company'] ?? ''),
        applyUrl: String(obj['apply_url'] ?? ''),
        location: obj['location'] ? String(obj['location']) : undefined,
        salary: obj['salary'] ? String(obj['salary']) : undefined,
        source: obj['source'] ? String(obj['source']) : undefined,
        score: obj['score'] ? Number(obj['score']) : undefined,
        description: obj['description'] ? String(obj['description']) : undefined,
      };
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[Saved Jobs] Fetch error: ${msg}`);
    return [];
  }
}

export function saveJob(job: SaveJobInput): { success: boolean; error?: string } {
  try {
    saveAndSyncJob({
      title: String(job['title'] ?? ''),
      company: String(job['company'] ?? ''),
      apply_url: String(job['applyUrl'] ?? job['apply_url'] ?? ''),
      location: job['location'] ? String(job['location']) : undefined,
      salary: job['salary'] ? String(job['salary']) : undefined,
      source: job['source'] ? String(job['source']) : 'Cloud Feed',
      score: job['score'] ? Number(job['score']) : 50,
      description: job['description'] ? String(job['description']) : undefined,
    });
    log(`[Saved Jobs] Bookmarked position: ${job['title']} at ${job['company']}`);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[Saved Jobs] Save error: ${msg}`);
    return { success: false, error: msg };
  }
}

export function removeSavedJob(applyUrl: string): { success: boolean; error?: string } {
  try {
    removeAndSyncJob(applyUrl);
    log(`[Saved Jobs] Removed position: ${applyUrl}`);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[Saved Jobs] Remove error: ${msg}`);
    return { success: false, error: msg };
  }
}

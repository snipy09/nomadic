import { htmlToText } from '@job-automator/email-verifier';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isIndiaEligible, type Region } from '../pipeline/region.js';
import { contactsFromText } from './from-text.js';
import type { ContactCandidate } from './schema.js';

/**
 * Addresses written in the descriptions of jobs the pipeline already published
 * ("send your resume to priya@acme.in"). The job gives the company, the role and the place.
 */

export interface JobDescriptionRow {
  id: number | string;
  title: string;
  company: string;
  location: string | null;
  remote: boolean | null;
  description: string | null;
  apply_url: string | null;
  canonical_url: string | null;
  posted_at: string | null;
}

export type JobReader = () => Promise<JobDescriptionRow[]>;

const PAGE = 1000;

/** Active jobs whose description or apply link may hold an address. Works with the anon key (active jobs are public). */
export function supabaseJobReader(client: SupabaseClient): JobReader {
  return async () => {
    const rows: JobDescriptionRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await client
        .from('jobs')
        .select('id, title, company, location, remote, description, apply_url, canonical_url, posted_at')
        .eq('status', 'active')
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`jobs read failed: ${error.message}`);
      rows.push(...((data ?? []) as JobDescriptionRow[]));
      if (!data || data.length < PAGE) break;
    }
    return rows;
  };
}

export interface JobContactsResult {
  contacts: ContactCandidate[];
  jobsRead: number;
  outOfRegion: number;
}

export function contactsFromJobs(rows: JobDescriptionRow[], region: Region): JobContactsResult {
  const result: JobContactsResult = { contacts: [], jobsRead: rows.length, outOfRegion: 0 };
  for (const job of rows) {
    const raw = job.description ?? '';
    if (!raw.includes('@') && !/\b(?:at|AT)\b.{1,40}\b(?:dot|DOT)\b|\[\s*at\s*\]|\(\s*at\s*\)/.test(raw)) continue;
    const location = job.location?.trim() || null;
    const remote = Boolean(job.remote);
    if (region === 'india' && !isIndiaEligible({ location: location ?? '', remote })) {
      result.outOfRegion++;
      continue;
    }
    const sourceUrl = job.canonical_url || job.apply_url;
    if (!sourceUrl || !job.company?.trim()) continue;
    result.contacts.push(
      ...contactsFromText({
        text: /<[a-z][\s\S]*>/i.test(raw) ? htmlToText(raw) : raw,
        company: job.company,
        companyDomain: null,
        hiringFor: job.title || null,
        location,
        remote,
        source: 'job_description',
        sourceUrl,
        jobUrl: job.apply_url || null,
        postedAt: toIso(job.posted_at),
        snippetPrefix: `${job.title} at ${job.company}`,
      })
    );
  }
  return result;
}

function toIso(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

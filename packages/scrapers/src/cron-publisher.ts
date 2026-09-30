import { runAllScrapersWithReport } from './index.js';
import { publishJobs, recordScrapeRun } from './publisher.js';
import { scrapeRecruiterLeads } from './recruiter-scraper.js';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
// Writes to jobs / hr_contacts require the SERVICE ROLE key after the secure
// RLS migration (002) — the anon key can only READ the feed. Prefer the service
// role key; fall back to anon only so misconfigured setups fail loudly.
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    'Missing required env vars SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. ' +
    'Set them in GitHub Secrets (CI) or a local .env file — never hardcode credentials.'
  );
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    '[Scraper] WARNING: SUPABASE_SERVICE_ROLE_KEY is not set. The anon key cannot ' +
    'write to jobs/hr_contacts under the secure RLS policy — publishing will fail. ' +
    'Add SUPABASE_SERVICE_ROLE_KEY to your GitHub Actions secrets.'
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log('===========================================================');
  console.log('🚀 JOBMAXXER — CLOUD SCRAPER & SUPABASE PUBLISHER');
  console.log(`Connecting to: ${SUPABASE_URL}`);
  console.log('===========================================================');

  try {
    // 1. Run all high-throughput scraper engines (500+ sources)
    console.log('\n[1/4] Running Scraper Engines...');
    const started = new Date();
    const report = await runAllScrapersWithReport();
    const jobs = report.jobs;
    console.log(`Scraped & deduplicated: ${jobs.length} total unique positions.`);

    // 2. Publish (upsert + expire stale)
    if (jobs.length > 0) {
      console.log('\n[2/4] Publishing jobs to Supabase...');
      const result = await publishJobs(supabase, jobs, started);
      await recordScrapeRun(supabase, report, result, started);
      console.log(`Total jobs published: ${result.upserted}, expired: ${result.expired}`);
    }

    // 3. Scrape & Publish Recruiter Leads
    console.log('\n[3/4] Scraping Verified Recruiter & Hiring Manager Leads...');
    const targetCompanies = Array.from(new Set(jobs.slice(0, 30).map(j => j.company)));
    const recruiterLeads = await scrapeRecruiterLeads(targetCompanies, 'Software Engineer');

    if (recruiterLeads.length > 0) {
      const hrPayload = recruiterLeads.map(r => ({
        company: r.company,
        name: r.name,
        email: r.email,
        role: r.role,
        department: r.department,
        verification_status: 'valid',
      }));

      const { error: hrError } = await supabase
        .from('hr_contacts')
        .upsert(hrPayload, { onConflict: 'email', ignoreDuplicates: true });

      if (hrError) {
        console.warn('[Recruiter Leads] Note:', hrError.message);
      } else {
        console.log(`Published ${recruiterLeads.length} verified hiring manager contacts.`);
      }
    }

    // 4. Run Automated Lifecycle Maintenance (2-week inactivation & 1-month purge)
    console.log('\n[4/4] Executing Database Lifecycle Cleanup Maintenance...');
    const { data: maintData, error: maintError } = await supabase.rpc('maintain_jobs_lifecycle');
    if (maintError) {
      console.log('[Lifecycle Maintenance] Note:', maintError.message);
    } else {
      console.log('[Lifecycle Maintenance] Completed successfully:', maintData);
    }

    console.log('\n✅ Scraper & Cloud Publisher Pipeline Complete!');
  } catch (err: any) {
    console.error('Fatal Pipeline Error:', err.message);
    process.exit(1);
  }
}

main();

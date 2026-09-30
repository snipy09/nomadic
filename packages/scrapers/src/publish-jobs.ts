import { runAllScrapersWithReport } from './index.ts';
import { getScraperEnv, getScraperSupabase } from './env-helper.ts';
import { publishJobs, recordScrapeRun } from './publisher.ts';

/**
 * Single job-publishing entry point: scrape (tiered sources) -> validate/dedupe -> upsert -> expire stale.
 *   npm run scrapers:jobs            tier 1+2 sources
 *   npm run scrapers:jobs -- --tier3 also run the fragile sources
 */
async function main() {
  const started = new Date();
  const env = getScraperEnv();
  const supabase = getScraperSupabase();
  console.log(`[Nomadic] Publishing jobs to ${env.SUPABASE_URL} (${env.isServiceRole ? 'service role' : 'anon key: writes will be rejected by RLS'})`);

  const report = await runAllScrapersWithReport(undefined, { includeTier3: process.argv.includes('--tier3') });
  if (report.jobs.length === 0) {
    console.warn('[Nomadic] Scrapers returned 0 jobs. Check network connectivity. Nothing published, nothing expired.');
    process.exit(1);
  }

  const result = await publishJobs(supabase, report.jobs, started);
  await recordScrapeRun(supabase, report, result, started);

  console.log(`\n[Nomadic] Done in ${((Date.now() - started.getTime()) / 1000).toFixed(1)}s: ${report.jobs.length} scraped, ${result.upserted} upserted, ${result.expired} expired, ${result.failedBatches} failed batches`);
  if (report.alerts.length) console.warn(`[Nomadic] ${report.alerts.length} source alert(s): ${report.alerts.map((a) => a.message).join(' | ')}`);
  process.exit(result.failedBatches > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[Nomadic] Fatal:', err?.message || err);
  process.exit(1);
});

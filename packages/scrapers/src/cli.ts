#!/usr/bin/env node
/**
 * Single entry point for the job pipeline.
 *
 *   scrape run   [--sources a,b] [--tiers 1,2] [--include-tier3] [--publish]
 *                [--no-link-check] [--limit-per-source N] [--json report.json] [--fail-on-alert]
 *   scrape bench [--sources a,b] [--include-tier3] [--out results/baseline.md]
 *   scrape runs  [--limit 20] [--source greenhouse]
 *   scrape sources
 *
 * Publishing needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
 */
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';
import { createClient } from '@supabase/supabase-js';
import { formatBenchMarkdown, formatRunTable } from './pipeline/report.js';
import { runPipeline } from './pipeline/run.js';
import { SupabaseJobStore, getRecentScrapeRuns } from './pipeline/store.js';
import { SOURCES, selectSources, type Tier } from './sources/registry.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Operators keep credentials in the repo-root .env; real env vars win. */
function loadRootEnv() {
  const envPath = resolve(HERE, '..', '..', '..', '.env');
  if (existsSync(envPath) && typeof process.loadEnvFile === 'function') process.loadEnvFile(envPath);
}

function list(value: string | undefined): string[] | undefined {
  return value
    ? value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
    : undefined;
}

export function serviceClientFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (service role is required to write jobs and scrape_runs).'
    );
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function annotate(level: 'warning' | 'error', message: string) {
  // GitHub Actions turns these into annotations; elsewhere they are plain log lines.
  console.log(process.env.GITHUB_ACTIONS ? `::${level}::${message}` : `[${level}] ${message}`);
}

async function main(argv: string[]): Promise<number> {
  const [command = 'run', ...rest] = argv;
  const { values } = parseArgs({
    args: rest,
    allowPositionals: false,
    options: {
      sources: { type: 'string' },
      tiers: { type: 'string' },
      'include-tier3': { type: 'boolean', default: false },
      publish: { type: 'boolean', default: false },
      'no-link-check': { type: 'boolean', default: false },
      'limit-per-source': { type: 'string' },
      json: { type: 'string' },
      out: { type: 'string' },
      'fail-on-alert': { type: 'boolean', default: false },
      limit: { type: 'string' },
      source: { type: 'string' },
    },
  });

  if (command === 'sources') {
    for (const s of SOURCES) {
      console.log(`${s.id.padEnd(12)} tier ${s.tier}${s.tier === 3 ? ' (opt-in)' : ''}  ${s.label}`);
    }
    return 0;
  }

  if (command === 'runs') {
    const runs = await getRecentScrapeRuns(serviceClientFromEnv(), {
      limit: values.limit ? Number(values.limit) : 20,
      source: values.source,
    });
    console.table(
      runs.map((r) => ({
        started: r.started_at,
        source: r.source,
        status: r.status,
        fetched: r.fetched,
        upserted: r.upserted,
        expired: r.expired,
        alert: r.alert ?? '',
      }))
    );
    return 0;
  }

  if (command !== 'run' && command !== 'bench') {
    console.error(`Unknown command "${command}". Use run, bench, runs or sources.`);
    return 2;
  }

  const sources = selectSources({
    sources: list(values.sources),
    tiers: list(values.tiers)?.map(Number) as Tier[] | undefined,
    includeTier3: values['include-tier3'],
  });
  if (sources.length === 0) {
    console.error('No sources selected.');
    return 2;
  }

  const isBench = command === 'bench';
  const publish = !isBench && values.publish;
  const client = publish ? serviceClientFromEnv() : undefined;
  const store = client ? new SupabaseJobStore(client) : undefined;

  console.log(
    `[scrape ${command}] sources: ${sources.map((s) => `${s.id}(t${s.tier})`).join(', ')}${publish ? ' — publishing' : ' — dry run'}`
  );

  const report = await runPipeline({
    sources,
    publish,
    store,
    linkCheck: isBench ? true : !values['no-link-check'],
    checkOfficialLinks: isBench,
    limitPerSource: values['limit-per-source'] ? Number(values['limit-per-source']) : undefined,
    log: (message) => console.log(message),
  });

  console.log('\n' + formatRunTable(report));
  const t = report.totals;
  console.log(
    `\nunique live jobs: ${t.unique} | duplicates: ${t.duplicates} | failed links: ${t.linkFailed} | upserted: ${t.upserted} | expired: ${t.expired} | legacy rows expired: ${t.legacyExpired}`
  );
  if (client) {
    // Expire jobs no source has listed for 14 days; delete rows expired for 30 days.
    const { data, error } = await client.rpc('maintain_jobs_lifecycle');
    if (error) annotate('warning', `maintain_jobs_lifecycle failed: ${error.message}`);
    else console.log(`lifecycle maintenance: ${JSON.stringify(data)}`);
  }
  for (const s of report.sources) for (const w of s.warnings) annotate('warning', `${s.source}: ${w}`);
  for (const alert of report.alerts) annotate('warning', `scrape alert — ${alert}`);

  if (values.json) {
    const path = resolve(values.json);
    mkdirSync(dirname(path), { recursive: true });
    const { jobs, ...summary } = report;
    writeFileSync(path, JSON.stringify({ ...summary, sampleJobs: jobs.slice(0, 20) }, null, 2));
    console.log(`report written to ${path}`);
  }

  if (isBench) {
    const out = resolve(values.out ?? resolve(HERE, '..', 'results', 'baseline.md'));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, formatBenchMarkdown(report));
    console.log(`benchmark written to ${out}`);
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, formatBenchMarkdown(report, `Scrape ${command}`), { flag: 'a' });
  }

  return values['fail-on-alert'] && report.alerts.length > 0 ? 1 : 0;
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  loadRootEnv();
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(`[scrape] fatal: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  );
}

export { main };

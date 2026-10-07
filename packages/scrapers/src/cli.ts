#!/usr/bin/env node
/**
 * Single entry point for the job pipeline.
 *
 *   scrape run   [--sources a,b] [--tiers 1,2] [--include-tier3] [--publish]
 *                [--no-link-check] [--limit-per-source N] [--json report.json] [--fail-on-alert]
 *                [--region india|all]   (default india, or SCRAPER_REGION)
 *                [--max-new N]          at most N jobs not yet published per run (known jobs are still refreshed)
 *                [--max-age-days 30]    skip jobs the source says were posted longer ago (0 = keep all)
 *                [--summary-dir DIR]    write a plain-text summary per run plus history.csv to DIR
 *   scrape bench [--sources a,b] [--include-tier3] [--out results/baseline.md]
 *   scrape runs  [--limit 20] [--source greenhouse]
 *   scrape sources
 *   scrape contacts [--sources hn,jobs,pages] [--publish] [--months 2] [--region india|all]
 *                   [--max-pages 40] [--summary-dir DIR] [--json report.json]
 *                Public hiring contacts (recruiters, managers, founders, employees, team inboxes)
 *                from HN "Who is hiring?" posts, published job descriptions and company sites.
 *   scrape feed  [--sources companies,hackathons] [--companies google,amazon] [--hackathon-sources devfolio,unstop]
 *                [--publish] [--region india|all] [--max-pages 10] [--summary-dir DIR] [--json report.json]
 *                Home feed sources: openings at famous companies (full time + internships) with a daily
 *                hiring snapshot per company, and upcoming hackathons (Devfolio, Unstop, Devpost, HackerEarth).
 *
 *   scrape news  [--publish] [--max-age-days 30] [--summary-dir DIR] [--json report.json]
 *                Hiring news from Indian business and jobs desks (news/feeds.ts): hiring plans, campus drives,
 *                layoffs, funding and expansion, with the company, roles, headcount and period read from the text.
 *                SCRAPER_NEWS_FEEDS_OFF=id,id skips feeds.
 *   scrape discover [--out state/boards.json] [--summary-dir DIR]
 *                Finds Greenhouse/Lever/Ashby/SmartRecruiters boards with India-open jobs for the companies in
 *                sources/india-companies.ts (and famous ones without a readable listing). The job board and the
 *                company snapshots read the file named by SCRAPER_BOARDS_FILE.
 *
 *   scrape auto  [--home DIR] [--force jobs,news|all] [--dry-run]
 *                Desktop scraper folder: runs every scraper whose interval in DIR/settings.ini has passed (Windows
 *                Task Scheduler starts it every 30 minutes), reads DIR/.env, writes DIR/reports and DIR/logs.
 *   scrape status [--home DIR]   last run, result and next run of each scraper in the folder.
 *
 * Publishing needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
 */
import { appendFileSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';
import { createClient } from '@supabase/supabase-js';
import {
  SUMMARY_CSV_HEADER,
  formatBenchMarkdown,
  formatRunSummary,
  formatRunTable,
  formatSummaryCsvRow,
} from './pipeline/report.js';
import { supabaseJobReader } from './contacts/job-descriptions.js';
import { CONTACT_SOURCE_IDS, formatContactSummary, runContactScrape, type ContactSourceId } from './contacts/run.js';
import { SupabaseContactStore } from './contacts/store.js';
import { FEED_SOURCE_IDS, formatFeedSummary, runFeedScrape, type FeedSourceId } from './feed/run.js';
import { HACKATHON_SOURCES, type HackathonSource } from './feed/schema.js';
import { SupabaseFeedStore } from './feed/store.js';
import { getScraperSupabase } from './env-helper.js';
import { parseRegion, type Region } from './pipeline/region.js';
import { runPipeline } from './pipeline/run.js';
import { SupabaseJobStore, getRecentScrapeRuns } from './pipeline/store.js';
import { SOURCES, selectSources, type Tier } from './sources/registry.js';
import { discoverBoards, formatDiscoverySummary, loadDiscoveredBoards } from './sources/boards.js';
import { PoliteFetcher } from './feed/http.js';
import { formatNewsSummary, runNewsScrape } from './news/run.js';
import { formatStatus, runAuto } from './auto/runner.js';
import { TASK_IDS, type TaskId } from './auto/settings.js';
import { SupabaseNewsStore } from './news/store.js';

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
      region: { type: 'string' },
      'max-new': { type: 'string' },
      'max-age-days': { type: 'string' },
      'summary-dir': { type: 'string' },
      json: { type: 'string' },
      out: { type: 'string' },
      'fail-on-alert': { type: 'boolean', default: false },
      limit: { type: 'string' },
      source: { type: 'string' },
      months: { type: 'string' },
      'max-pages': { type: 'string' },
      companies: { type: 'string' },
      'hackathon-sources': { type: 'string' },
      home: { type: 'string' },
      force: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  });

  if (command === 'contacts') {
    return runContacts({
      sources: list(values.sources),
      publish: values.publish,
      months: values.months,
      maxPages: values['max-pages'],
      region: parseRegion(values.region ?? process.env.SCRAPER_REGION),
      summaryDir: values['summary-dir'],
      json: values.json,
    });
  }

  if (command === 'feed') {
    return runFeed({
      sources: list(values.sources),
      companies: list(values.companies),
      hackathonSources: list(values['hackathon-sources']),
      publish: values.publish,
      maxPages: values['max-pages'],
      region: parseRegion(values.region ?? process.env.SCRAPER_REGION),
      summaryDir: values['summary-dir'],
      json: values.json,
    });
  }

  if (command === 'auto' || command === 'status') {
    const home = folderHome(values.home);
    if (command === 'status') {
      console.log(formatStatus(home, new Date()));
      return 0;
    }
    return runAutoCommand(home, values.force, values['dry-run']);
  }

  if (command === 'news') {
    return runNews({ publish: values.publish, maxAgeDays: values['max-age-days'], summaryDir: values['summary-dir'], json: values.json });
  }

  if (command === 'discover') {
    return runDiscover({ out: values.out ?? process.env.SCRAPER_BOARDS_FILE, summaryDir: values['summary-dir'] });
  }

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
    console.error(`Unknown command "${command}". Use run, bench, runs, sources, contacts, feed, news, discover, auto or status.`);
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
  const region = parseRegion(values.region ?? process.env.SCRAPER_REGION);
  const client = publish ? serviceClientFromEnv() : undefined;
  const store = client ? new SupabaseJobStore(client) : undefined;

  console.log(
    `[scrape ${command}] sources: ${sources.map((s) => `${s.id}(t${s.tier})`).join(', ')}${publish ? ' — publishing' : ' — dry run'} — region ${region}`
  );

  const maxNew = values['max-new'] ? Number(values['max-new']) : undefined;
  if (maxNew !== undefined && (!Number.isInteger(maxNew) || maxNew < 1)) {
    console.error('--max-new must be a positive whole number.');
    return 2;
  }
  if (maxNew && !publish) console.log('note: --max-new only applies when publishing (it compares against Supabase).');

  const maxAgeDays = values['max-age-days'] ? Number(values['max-age-days']) : 30;
  if (!Number.isInteger(maxAgeDays) || maxAgeDays < 0) {
    console.error('--max-age-days must be a whole number (0 keeps every job).');
    return 2;
  }

  const report = await runPipeline({
    sources,
    maxNew,
    maxAgeDays,
    publish,
    store,
    linkCheck: isBench ? true : !values['no-link-check'],
    checkOfficialLinks: isBench,
    limitPerSource: values['limit-per-source'] ? Number(values['limit-per-source']) : undefined,
    region,
    log: (message) => console.log(message),
  });

  console.log('\n' + formatRunTable(report));
  const t = report.totals;
  console.log(
    `\nnew jobs: ${t.newJobs} | updated: ${t.refreshed} | left for next run: ${t.deferred}` +
      `\nunique live jobs: ${t.unique} | outside region: ${report.sources.reduce((n, s) => n + s.outOfRegion, 0)} | duplicates: ${t.duplicates} | failed links: ${t.linkFailed} | upserted: ${t.upserted} | expired: ${t.expired} | legacy rows expired: ${t.legacyExpired}`
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
    const { jobs, newJobs, ...summary } = report;
    writeFileSync(
      path,
      JSON.stringify(
        { ...summary, sampleJobs: jobs.slice(0, 20), newJobIds: newJobs.map((j) => `${j.source}:${j.sourceJobId}`) },
        null,
        2
      )
    );
    console.log(`report written to ${path}`);
  }

  if (values['summary-dir'] && !isBench) {
    const dir = resolve(values['summary-dir']);
    mkdirSync(dir, { recursive: true });
    const stamp = report.startedAt.slice(0, 19).replace(/[:T]/g, '-');
    const summary = formatRunSummary(report, { maxNew, region, maxAgeDays });
    writeFileSync(resolve(dir, `scrape-${stamp}.txt`), summary);
    writeFileSync(resolve(dir, 'latest-summary.txt'), summary);
    const history = resolve(dir, 'history.csv');
    if (!existsSync(history)) writeFileSync(history, SUMMARY_CSV_HEADER + '\n');
    appendFileSync(history, formatSummaryCsvRow(report) + '\n');
    console.log(`summary written to ${resolve(dir, `scrape-${stamp}.txt`)}`);
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

interface ContactsArgs {
  sources?: string[];
  publish: boolean;
  months?: string;
  maxPages?: string;
  region: Region;
  summaryDir?: string;
  json?: string;
}

function positiveInt(value: string | undefined, name: string): number | undefined | null {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    console.error(`--${name} must be a positive whole number.`);
    return null;
  }
  return n;
}

async function runContacts(args: ContactsArgs): Promise<number> {
  const sources = (args.sources ?? [...CONTACT_SOURCE_IDS]) as ContactSourceId[];
  const unknown = sources.filter((s) => !(CONTACT_SOURCE_IDS as readonly string[]).includes(s));
  if (unknown.length > 0) {
    console.error(`Unknown contact source(s): ${unknown.join(', ')}. Use ${CONTACT_SOURCE_IDS.join(', ')}.`);
    return 2;
  }
  const months = positiveInt(args.months, 'months');
  const maxPages = positiveInt(args.maxPages, 'max-pages');
  if (months === null || maxPages === null) return 2;

  // Publishing writes with the service role; a dry run only reads public active jobs.
  const client = args.publish ? serviceClientFromEnv() : getScraperSupabase();
  console.log(`[scrape contacts] sources: ${sources.join(', ')}${args.publish ? ' — publishing' : ' — dry run'} — region ${args.region}`);
  const report = await runContactScrape({
    sources,
    region: args.region,
    publish: args.publish,
    store: args.publish ? new SupabaseContactStore(client) : undefined,
    readJobs: supabaseJobReader(client),
    months,
    maxPages,
    log: (message) => console.log(message),
  });

  const summary = formatContactSummary(report);
  console.log('\n' + summary);
  if (!args.publish && report.contacts.length > 0) {
    console.table(
      report.contacts.slice(0, 15).map((c) => ({ kind: c.contactKind, name: c.name ?? '', company: c.company, email: c.email, source: c.source }))
    );
  }
  for (const s of report.sources) if (!s.ok) annotate('warning', `contacts ${s.source} failed: ${s.error}`);

  if (args.json) {
    const path = resolve(args.json);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(report, null, 2));
    console.log(`report written to ${path}`);
  }
  if (args.summaryDir) {
    const dir = resolve(args.summaryDir);
    mkdirSync(dir, { recursive: true });
    const stamp = report.startedAt.slice(0, 19).replace(/[:T]/g, '-');
    writeFileSync(resolve(dir, `contacts-${stamp}.txt`), summary);
    writeFileSync(resolve(dir, 'latest-contacts.txt'), summary);
    console.log(`summary written to ${resolve(dir, `contacts-${stamp}.txt`)}`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + summary + '```\n', { flag: 'a' });
  return report.sources.every((s) => !s.ok) ? 1 : 0;
}

interface FeedArgs {
  sources?: string[];
  companies?: string[];
  hackathonSources?: string[];
  publish: boolean;
  maxPages?: string;
  region: Region;
  summaryDir?: string;
  json?: string;
}

async function runFeed(args: FeedArgs): Promise<number> {
  const sources = (args.sources ?? [...FEED_SOURCE_IDS]) as FeedSourceId[];
  const badSources = sources.filter((s) => !(FEED_SOURCE_IDS as readonly string[]).includes(s));
  if (badSources.length > 0) {
    console.error(`Unknown feed source(s): ${badSources.join(', ')}. Use ${FEED_SOURCE_IDS.join(', ')}.`);
    return 2;
  }
  const hackathonSources = args.hackathonSources as HackathonSource[] | undefined;
  const badHack = (hackathonSources ?? []).filter((s) => !(HACKATHON_SOURCES as readonly string[]).includes(s));
  if (badHack.length > 0) {
    console.error(`Unknown hackathon source(s): ${badHack.join(', ')}. Use ${HACKATHON_SOURCES.join(', ')}.`);
    return 2;
  }
  const maxPages = positiveInt(args.maxPages, 'max-pages');
  if (maxPages === null) return 2;

  console.log(`[scrape feed] ${sources.join(', ')}${args.publish ? ' — publishing' : ' — dry run'} — region ${args.region}`);
  const report = await runFeedScrape({
    sources,
    companies: args.companies,
    hackathonSources,
    region: args.region,
    publish: args.publish,
    store: args.publish ? new SupabaseFeedStore(serviceClientFromEnv()) : undefined,
    maxPages,
    log: (message) => console.log(message),
  });

  const summary = formatFeedSummary(report);
  console.log('\n' + summary);
  if (!args.publish) {
    if (report.openings.length > 0) {
      console.table(report.openings.slice(0, 15).map((o) => ({ company: o.companySlug, title: o.title, kind: o.kind, level: o.level, location: o.location })));
    }
    if (report.hackathons.length > 0) {
      console.table(report.hackathons.slice(0, 15).map((h) => ({ source: h.source, title: h.title, mode: h.mode, city: h.city ?? '', starts: h.startsAt?.slice(0, 10) ?? '' })));
    }
  }
  for (const c of report.companies) if (!c.ok) annotate('warning', `feed company ${c.slug} failed: ${c.error}`);
  for (const s of report.hackathonSources) if (!s.ok) annotate('warning', `feed hackathons ${s.source} failed: ${s.error}`);

  if (args.json) {
    const path = resolve(args.json);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(report, null, 2));
    console.log(`report written to ${path}`);
  }
  if (args.summaryDir) {
    const dir = resolve(args.summaryDir);
    mkdirSync(dir, { recursive: true });
    const stamp = report.startedAt.slice(0, 19).replace(/[:T]/g, '-');
    writeFileSync(resolve(dir, `feed-${stamp}.txt`), summary);
    writeFileSync(resolve(dir, 'latest-feed.txt'), summary);
    console.log(`summary written to ${resolve(dir, `feed-${stamp}.txt`)}`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + summary + '```\n', { flag: 'a' });
  const all = [...report.companies.map((c) => c.ok), ...report.hackathonSources.map((s) => s.ok)];
  return all.length > 0 && all.every((ok) => !ok) ? 1 : 0;
}

/** The scraper folder: --home, NOMADIC_SCRAPER_HOME, the folder above bin\ when run from the bundle, else the cwd. */
function folderHome(flag: string | undefined): string {
  if (flag) return resolve(flag);
  if (process.env.NOMADIC_SCRAPER_HOME) return resolve(process.env.NOMADIC_SCRAPER_HOME);
  return basename(HERE) === 'bin' ? resolve(HERE, '..') : process.cwd();
}

/** Mirrors console output into logs/auto-<yyyy-mm>.log (scheduled runs have no window to show it). */
function teeConsole(file: string): () => void {
  mkdirSync(dirname(file), { recursive: true });
  const original = { log: console.log, warn: console.warn, error: console.error };
  const write = (args: unknown[]) => {
    try {
      appendFileSync(file, `${new Date().toISOString()} ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`);
    } catch {
      /* logging must never stop a scrape */
    }
  };
  for (const level of ['log', 'warn', 'error'] as const) {
    console[level] = (...args: unknown[]) => {
      original[level](...args);
      write(args);
    };
  }
  return () => Object.assign(console, original);
}

async function runAutoCommand(home: string, force: string | undefined, dryRun: boolean): Promise<number> {
  const envFile = join(home, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const forced = force === 'all' ? 'all' : (list(force) as TaskId[] | undefined);
  const unknown = Array.isArray(forced) ? forced.filter((t) => !(TASK_IDS as readonly string[]).includes(t)) : [];
  if (unknown.length) {
    console.error(`Unknown scraper(s): ${unknown.join(', ')}. Use ${TASK_IDS.join(', ')} or all.`);
    return 2;
  }
  if (!dryRun && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(`No SUPABASE_SERVICE_ROLE_KEY in ${envFile}. Run Setup.cmd first (or add --dry-run).`);
    return 2;
  }
  process.env.SUPABASE_URL ||= 'https://grqkiddfwoyicktpgdea.supabase.co';
  const stop = teeConsole(join(home, 'logs', `auto-${new Date().toISOString().slice(0, 7)}.log`));
  try {
    const result = await runAuto({ home, force: forced, dryRun, exec: (args) => main(args) });
    if (result.locked) return 0;
    return result.ran.some((r) => !r.ok) ? 1 : 0;
  } finally {
    stop();
  }
}

async function runNews(args: { publish: boolean; maxAgeDays?: string; summaryDir?: string; json?: string }): Promise<number> {
  const maxAgeDays = positiveInt(args.maxAgeDays, 'max-age-days');
  if (maxAgeDays === null) return 2;
  console.log(`[scrape news]${args.publish ? ' publishing' : ' dry run'}`);
  const report = await runNewsScrape({
    publish: args.publish,
    store: args.publish ? new SupabaseNewsStore(serviceClientFromEnv()) : undefined,
    feedsOff: list(process.env.SCRAPER_NEWS_FEEDS_OFF),
    maxAgeDays,
    log: (message) => console.log(message),
  });
  const summary = formatNewsSummary(report);
  console.log('\n' + summary);
  for (const f of report.feeds) if (!f.ok) annotate('warning', `news feed ${f.id} failed: ${f.error}`);
  if (args.json) {
    const path = resolve(args.json);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(report, null, 2));
  }
  if (args.summaryDir) {
    const dir = resolve(args.summaryDir);
    mkdirSync(dir, { recursive: true });
    const stamp = report.startedAt.slice(0, 19).replace(/[:T]/g, '-');
    writeFileSync(resolve(dir, `news-${stamp}.txt`), summary);
    writeFileSync(resolve(dir, 'latest-news.txt'), summary);
    console.log(`summary written to ${resolve(dir, `news-${stamp}.txt`)}`);
  }
  return report.feeds.length > 0 && report.feeds.every((f) => !f.ok) ? 1 : 0;
}

async function runDiscover(args: { out?: string; summaryDir?: string }): Promise<number> {
  if (!args.out) {
    console.error('discover needs --out FILE (or SCRAPER_BOARDS_FILE).');
    return 2;
  }
  const out = resolve(args.out);
  const previous = loadDiscoveredBoards(out);
  console.log(`[discover] probing company boards (${previous.length} known) — results go to ${out}`);
  const report = await discoverBoards({
    http: new PoliteFetcher({ minDelayMs: 500 }),
    now: new Date(),
    previous,
    log: (message) => console.log(message),
  });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(`${out}.tmp`, JSON.stringify(report.file, null, 2));
  renameSync(`${out}.tmp`, out);
  const summary = formatDiscoverySummary(report);
  console.log('\n' + summary);
  if (args.summaryDir) {
    const dir = resolve(args.summaryDir);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'latest-discover.txt'), summary);
  }
  return report.found === 0 && report.errors.length > 0 ? 1 : 0;
}

const samePath = (a: string, b: string) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
const isDirectRun = process.argv[1] && samePath(resolve(process.argv[1]), fileURLToPath(import.meta.url));
if (isDirectRun) {
  // The bundled folder (bin/) reads its own .env in `auto`; only a repo checkout uses the repo-root .env.
  if (basename(HERE) !== 'bin') loadRootEnv();
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(`[scrape] fatal: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  );
}

export { main };

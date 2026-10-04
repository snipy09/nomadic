import { checkMx, emailDomain, type MxOptions, type MxResult } from '@job-automator/email-verifier';
import type { Region } from '../pipeline/region.js';
import type { FetchLike } from '../sources/ats.js';
import { pageSeeds, scrapeCompanyPages } from './company-pages.js';
import { scrapeHnContacts, type HnCompanySite } from './hn.js';
import { contactsFromJobs, type JobDescriptionRow, type JobReader } from './job-descriptions.js';
import { CONTACT_KINDS, parseContact, type Contact, type ContactCandidate, type ContactKind } from './schema.js';
import { emailHash, toContactRow, type ContactStore } from './store.js';

/**
 * One contact-scraper run: read every source, validate, merge duplicates, drop domains that
 * take no mail, drop people who asked not to be listed, publish, hide rows not seen for 90 days.
 */

export const CONTACT_SOURCE_IDS = ['hn', 'jobs', 'pages'] as const;
export type ContactSourceId = (typeof CONTACT_SOURCE_IDS)[number];

export const STALE_AFTER_DAYS = 90;

export interface ContactRunOptions {
  sources: ContactSourceId[];
  region: Region;
  publish: boolean;
  store?: ContactStore;
  /** Needed by the jobs and pages sources. */
  readJobs?: JobReader;
  fetchImpl?: FetchLike;
  months?: number;
  maxPages?: number;
  /** Company-page politeness, for tests. */
  pageDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  mx?: Omit<MxOptions, 'cache'>;
  clock?: () => Date;
  log?: (message: string) => void;
}

export interface ContactSourceStats {
  source: ContactSourceId;
  ok: boolean;
  error: string | null;
  /** Posts, jobs or pages read. */
  read: number;
  found: number;
  outOfRegion: number;
  invalid: number;
  warnings: string[];
  durationMs: number;
}

export interface ContactRunReport {
  startedAt: string;
  finishedAt: string;
  region: Region;
  published: boolean;
  sources: ContactSourceStats[];
  totals: {
    found: number;
    invalid: number;
    duplicates: number;
    noMailServer: number;
    mxUnknown: number;
    suppressed: number;
    kept: number;
    upserted: number;
    expired: number;
    byKind: Record<ContactKind, number>;
    named: number;
  };
  contacts: Contact[];
}

const stat = (source: ContactSourceId): ContactSourceStats => ({
  source,
  ok: true,
  error: null,
  read: 0,
  found: 0,
  outOfRegion: 0,
  invalid: 0,
  warnings: [],
  durationMs: 0,
});

/** Higher is better when two sources list the same address. */
function richness(c: Contact): number {
  return (c.name ? 4 : 0) + (c.roleTitle ? 2 : 0) + (c.contactKind !== 'unknown' ? 1 : 0);
}

export function mergeDuplicates(contacts: Contact[]): { unique: Contact[]; duplicates: number } {
  const byEmail = new Map<string, Contact>();
  for (const c of contacts) {
    const prev = byEmail.get(c.email);
    if (!prev) {
      byEmail.set(c.email, c);
      continue;
    }
    const better =
      richness(c) > richness(prev) || (richness(c) === richness(prev) && (c.postedAt ?? '') > (prev.postedAt ?? ''));
    byEmail.set(c.email, better ? c : prev);
  }
  return { unique: [...byEmail.values()], duplicates: contacts.length - byEmail.size };
}

export async function runContactScrape(options: ContactRunOptions): Promise<ContactRunReport> {
  const clock = options.clock ?? (() => new Date());
  const log = options.log ?? (() => undefined);
  const startedAt = clock().toISOString();
  const stats: ContactSourceStats[] = [];
  const candidates: { source: ContactSourceStats; candidate: ContactCandidate }[] = [];
  const want = new Set(options.sources);

  let jobs: JobDescriptionRow[] | null = null;
  const loadJobs = async () => {
    if (jobs) return jobs;
    if (!options.readJobs) throw new Error('no job reader configured');
    jobs = await options.readJobs();
    return jobs;
  };

  const timed = async (id: ContactSourceId, work: (s: ContactSourceStats) => Promise<ContactCandidate[]>) => {
    const s = stat(id);
    const t0 = Date.now();
    try {
      for (const candidate of await work(s)) candidates.push({ source: s, candidate });
    } catch (err) {
      s.ok = false;
      s.error = err instanceof Error ? err.message : String(err);
    }
    s.durationMs = Date.now() - t0;
    stats.push(s);
    log(`[contacts] ${id}: ${s.ok ? `read ${s.read}, found ${s.found}` : `failed: ${s.error}`}`);
  };

  let sites: HnCompanySite[] = [];
  if (want.has('hn')) {
    await timed('hn', async (s) => {
      const r = await scrapeHnContacts({ fetchImpl: options.fetchImpl, months: options.months, region: options.region });
      s.read = r.posts;
      s.found = r.contacts.length;
      s.outOfRegion = r.outOfRegion;
      s.warnings.push(...r.warnings);
      sites = r.sites;
      return r.contacts;
    });
  }
  if (want.has('jobs')) {
    await timed('jobs', async (s) => {
      const r = contactsFromJobs(await loadJobs(), options.region);
      s.read = r.jobsRead;
      s.found = r.contacts.length;
      s.outOfRegion = r.outOfRegion;
      return r.contacts;
    });
  }
  if (want.has('pages')) {
    await timed('pages', async (s) => {
      let rows: JobDescriptionRow[] = [];
      try {
        rows = await loadJobs();
      } catch (err) {
        // Pages can still start from the HN sites.
        s.warnings.push(`jobs not read: ${err instanceof Error ? err.message : String(err)}`);
      }
      const r = await scrapeCompanyPages(pageSeeds(rows, sites, options.region), {
        fetchImpl: options.fetchImpl,
        maxPages: options.maxPages,
        delayMs: options.pageDelayMs,
        sleep: options.sleep,
      });
      s.read = r.pagesFetched;
      s.found = r.contacts.length;
      s.warnings.push(...r.warnings);
      if (r.blockedByRobots > 0) s.warnings.push(`${r.blockedByRobots} pages skipped by robots.txt`);
      return r.contacts;
    });
  }

  // Validate.
  const valid: Contact[] = [];
  for (const { source, candidate } of candidates) {
    const parsed = parseContact(candidate);
    if (parsed.ok) valid.push(parsed.contact);
    else {
      source.invalid++;
      if (source.invalid <= 3) source.warnings.push(`invalid contact ${candidate.email}: ${parsed.issues.join('; ')}`);
    }
  }

  const { unique, duplicates } = mergeDuplicates(valid);

  // Domains that take no mail are dropped; unsure answers keep the contact with mx_ok null.
  const cache = new Map<string, Promise<MxResult>>();
  let noMailServer = 0;
  let mxUnknown = 0;
  const withMx: Contact[] = [];
  const results = await mapLimit(unique, 8, (c) => checkMx(emailDomain(c.email), { ...options.mx, cache }));
  unique.forEach((c, i) => {
    const mx = results[i];
    if (mx === false) noMailServer++;
    else {
      if (mx === null) mxUnknown++;
      withMx.push({ ...c, mxOk: mx });
    }
  });

  let kept = withMx;
  let suppressed = 0;
  let upserted = 0;
  let expired = 0;
  if (options.publish) {
    if (!options.store) throw new Error('publishing needs a contact store');
    const hashes = withMx.map((c) => emailHash(c.email));
    const blocked = await options.store.suppressedHashes(hashes);
    kept = withMx.filter((_, i) => !blocked.has(hashes[i]));
    suppressed = withMx.length - kept.length;
    const seenAt = clock().toISOString();
    upserted = await options.store.upsert(kept.map((c) => toContactRow(c, seenAt)));
    // Only hide old rows when every source worked, so one failing source does not hide its contacts.
    if (stats.every((s) => s.ok)) {
      const cutoff = new Date(clock().getTime() - STALE_AFTER_DAYS * 86_400_000).toISOString();
      expired = await options.store.expireStale(cutoff);
    }
  }

  const byKind = Object.fromEntries(CONTACT_KINDS.map((k) => [k, 0])) as Record<ContactKind, number>;
  for (const c of kept) byKind[c.contactKind]++;

  return {
    startedAt,
    finishedAt: clock().toISOString(),
    region: options.region,
    published: options.publish,
    sources: stats,
    totals: {
      found: candidates.length,
      invalid: stats.reduce((n, s) => n + s.invalid, 0),
      duplicates,
      noMailServer,
      mxUnknown,
      suppressed,
      kept: kept.length,
      upserted,
      expired,
      byKind,
      named: kept.filter((c) => c.name).length,
    },
    contacts: kept,
  };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

const KIND_LABEL: Record<ContactKind, string> = {
  recruiter: 'recruiters / HR',
  hiring_manager: 'hiring managers',
  founder: 'founders',
  employee: 'employees',
  alumni: 'alumni',
  team_inbox: 'team inboxes',
  unknown: 'not stated',
};

export function formatContactSummary(report: ContactRunReport): string {
  const t = report.totals;
  const lines = [
    `Nomadic contact scrape — ${report.startedAt}`,
    `${report.published ? 'Published' : 'Dry run (nothing written)'} — region ${report.region}`,
    '',
    'Sources:',
    ...report.sources.map(
      (s) =>
        `  ${s.source.padEnd(6)} ${s.ok ? 'ok    ' : 'FAILED'} read ${String(s.read).padStart(4)}  found ${String(s.found).padStart(4)}  outside region ${String(s.outOfRegion).padStart(4)}  invalid ${s.invalid}  (${Math.round(s.durationMs / 1000)}s)${s.error ? `  — ${s.error}` : ''}`
    ),
    '',
    `Found ${t.found} addresses: ${t.duplicates} duplicates, ${t.invalid} invalid, ${t.noMailServer} on domains that take no mail, ${t.suppressed} opted out.`,
    `Kept ${t.kept} contacts (${t.named} with a name; mail server unknown for ${t.mxUnknown}).`,
    'Who they are:',
    ...CONTACT_KINDS.filter((k) => t.byKind[k] > 0).map((k) => `  ${KIND_LABEL[k].padEnd(16)} ${t.byKind[k]}`),
  ];
  if (report.published) lines.push('', `Written: ${t.upserted}. Hidden (not seen for ${STALE_AFTER_DAYS} days): ${t.expired}.`);
  const warnings = report.sources.flatMap((s) => s.warnings.map((w) => `  ${s.source}: ${w}`));
  if (warnings.length) lines.push('', 'Warnings:', ...warnings.slice(0, 30));
  return lines.join('\n') + '\n';
}

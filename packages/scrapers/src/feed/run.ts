import { isIndiaEligible, type Region } from '../pipeline/region.js';
import type { FetchLike } from '../sources/ats.js';
import { fetchCompanyOpenings, type RawOpening } from './careers.js';
import { feedCompanies } from '../sources/boards.js';
import type { CompanyDef } from './companies.js';
import { HACKATHON_FETCHERS, hackathonKey } from './hackathons.js';
import { BlockedByRobotsError, PoliteFetcher } from './http.js';
import {
  HACKATHON_SOURCES,
  ROLE_FAMILIES,
  classifyKind,
  classifyLevel,
  classifyRoleFamily,
  parseHackathon,
  parseOpening,
  type Hackathon,
  type HackathonSource,
  type Opening,
  type RoleFamily,
} from './schema.js';
import { toCompanyRow, toHackathonRow, toOpeningRow, type FeedStore, type SnapshotRow } from './store.js';

/**
 * One feed-scraper run: openings at famous companies (full time and internships, India-open by default) with a
 * daily hiring snapshot per company, and upcoming hackathons (online or in India by default). A company or
 * source that fails is reported and leaves its stored rows untouched.
 */

export const FEED_SOURCE_IDS = ['companies', 'hackathons'] as const;
export type FeedSourceId = (typeof FEED_SOURCE_IDS)[number];

export interface FeedRunOptions {
  sources: FeedSourceId[];
  /** Company slugs to read; all companies with a careers listing when unset. */
  companies?: string[];
  /** The company directory; default: the famous companies plus boards found by `discover` (state/boards.json). */
  directory?: CompanyDef[];
  hackathonSources?: HackathonSource[];
  region: Region;
  publish: boolean;
  store?: FeedStore;
  fetchImpl?: FetchLike;
  maxPages?: number;
  minDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  clock?: () => Date;
  log?: (message: string) => void;
}

export interface CompanyStats {
  slug: string;
  ok: boolean;
  error: string | null;
  blockedByRobots: boolean;
  fetched: number;
  outOfRegion: number;
  invalid: number;
  kept: number;
  internships: number;
  entryLevel: number;
  newOpenings: number | null;
  truncated: boolean;
}

export interface HackathonStats {
  source: HackathonSource;
  ok: boolean;
  error: string | null;
  blockedByRobots: boolean;
  fetched: number;
  outOfRegion: number;
  ended: number;
  invalid: number;
  kept: number;
  truncated: boolean;
}

export interface FeedRunReport {
  startedAt: string;
  finishedAt: string;
  region: Region;
  published: boolean;
  /** Companies with no readable listing (followable; hiring windows curated). */
  curatedOnly: string[];
  companies: CompanyStats[];
  hackathonSources: HackathonStats[];
  snapshots: SnapshotRow[];
  openings: Opening[];
  hackathons: Hackathon[];
  totals: {
    openings: number;
    internships: number;
    entryLevel: number;
    hackathons: number;
    hackathonDuplicates: number;
    written: { companies: number; openings: number; snapshots: number; hackathons: number };
    expired: { openings: number; hackathons: number };
  };
  warnings: string[];
}

/** Calendar day in India (snapshots are per IST day). */
export function istDate(d: Date): string {
  return new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

export function toOpeningCandidate(company: CompanyDef, raw: RawOpening) {
  return {
    companySlug: company.slug,
    source: company.careers!.kind,
    sourceJobId: raw.sourceJobId,
    title: raw.title,
    kind: classifyKind(raw.title, raw.typeHint),
    level: classifyLevel(raw.title, raw.levelHint),
    roleFamily: classifyRoleFamily(raw.title),
    location: raw.location,
    remote: raw.remote,
    url: raw.url,
    postedAt: raw.postedAt,
  };
}

export function buildSnapshot(
  slug: string,
  openings: Opening[],
  known: Set<string> | null,
  takenOn: string,
  at: string
): SnapshotRow {
  const baseline = !known || known.size === 0;
  const fresh = baseline ? openings : openings.filter((o) => !known!.has(o.sourceJobId));
  const families: Partial<Record<RoleFamily, number>> = {};
  for (const o of openings) families[o.roleFamily] = (families[o.roleFamily] ?? 0) + 1;
  const newest = [...fresh].sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''));
  return {
    company_slug: slug,
    taken_on: takenOn,
    open_total: openings.length,
    internships: openings.filter((o) => o.kind === 'internship').length,
    full_time: openings.filter((o) => o.kind === 'full_time').length,
    entry_level: openings.filter((o) => o.level === 'entry').length,
    new_openings: fresh.length,
    baseline,
    role_families: Object.fromEntries(ROLE_FAMILIES.filter((f) => families[f]).map((f) => [f, families[f]!])),
    sample_titles: [...new Set(newest.map((o) => o.title))].slice(0, 5),
    updated_at: at,
  };
}

/** More stated fields wins when two sites list the same hackathon. */
function richness(h: Hackathon): number {
  return [h.organiser, h.city, h.startsAt, h.endsAt, h.registrationEndsAt, h.prizeText].filter(Boolean).length + h.themes.length / 10;
}

export function mergeHackathons(list: Hackathon[]): { unique: Hackathon[]; duplicates: number } {
  const byKey = new Map<string, Hackathon>();
  for (const h of list) {
    const key = hackathonKey(h);
    const prev = byKey.get(key);
    if (!prev || richness(h) > richness(prev)) byKey.set(key, h);
  }
  return { unique: [...byKey.values()], duplicates: list.length - byKey.size };
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    })
  );
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export async function runFeedScrape(options: FeedRunOptions): Promise<FeedRunReport> {
  const clock = options.clock ?? (() => new Date());
  const log = options.log ?? (() => undefined);
  const started = clock();
  const startedAt = started.toISOString();
  const maxPages = options.maxPages ?? 10;
  const http = new PoliteFetcher({ fetchImpl: options.fetchImpl, minDelayMs: options.minDelayMs, sleep: options.sleep });
  const want = new Set(options.sources);
  const warnings: string[] = [];
  if (options.publish && !options.store) throw new Error('publishing needs a feed store');

  const report: FeedRunReport = {
    startedAt,
    finishedAt: startedAt,
    region: options.region,
    published: options.publish,
    curatedOnly: [],
    companies: [],
    hackathonSources: [],
    snapshots: [],
    openings: [],
    hackathons: [],
    totals: {
      openings: 0,
      internships: 0,
      entryLevel: 0,
      hackathons: 0,
      hackathonDuplicates: 0,
      written: { companies: 0, openings: 0, snapshots: 0, hackathons: 0 },
      expired: { openings: 0, hackathons: 0 },
    },
    warnings,
  };

  // ── Companies ──────────────────────────────────────────────────────────────
  if (want.has('companies')) {
    const directory = options.directory ?? feedCompanies();
    const picked = options.companies?.length ? directory.filter((c) => options.companies!.includes(c.slug)) : directory;
    const unknown = (options.companies ?? []).filter((s) => !directory.some((c) => c.slug === s));
    if (unknown.length) warnings.push(`unknown company slug(s): ${unknown.join(', ')}`);
    report.curatedOnly = picked.filter((c) => !c.careers).map((c) => c.slug);
    const readable = picked.filter((c) => c.careers);

    if (options.publish) report.totals.written.companies = await options.store!.upsertCompanies(directory.map((c) => toCompanyRow(c, startedAt)));
    const known = options.store ? await options.store.knownOpeningIds(readable.map((c) => c.slug)) : null;

    const kept = new Map<string, Opening[]>();
    await mapLimit(readable, 4, async (company) => {
      const s: CompanyStats = {
        slug: company.slug,
        ok: true,
        error: null,
        blockedByRobots: false,
        fetched: 0,
        outOfRegion: 0,
        invalid: 0,
        kept: 0,
        internships: 0,
        entryLevel: 0,
        newOpenings: null,
        truncated: false,
      };
      try {
        const result = await fetchCompanyOpenings(company, { http, maxPages, now: started });
        s.fetched = result.openings.length;
        s.truncated = result.truncated;
        const seen = new Set<string>();
        const list: Opening[] = [];
        for (const raw of result.openings) {
          if (seen.has(raw.sourceJobId)) continue;
          seen.add(raw.sourceJobId);
          if (options.region === 'india' && !isIndiaEligible({ location: raw.location, remote: raw.remote })) {
            s.outOfRegion++;
            continue;
          }
          const parsed = parseOpening(toOpeningCandidate(company, raw));
          if (parsed.ok) list.push(parsed.value);
          else {
            s.invalid++;
            if (s.invalid <= 2) warnings.push(`${company.slug}: invalid opening "${raw.title}": ${parsed.issues.join('; ')}`);
          }
        }
        kept.set(company.slug, list);
        s.kept = list.length;
        s.internships = list.filter((o) => o.kind === 'internship').length;
        s.entryLevel = list.filter((o) => o.level === 'entry').length;
      } catch (err) {
        s.ok = false;
        s.blockedByRobots = err instanceof BlockedByRobotsError && err.reason === null;
        s.error = errorText(err);
      }
      report.companies.push(s);
      log(`[feed] ${company.slug}: ${s.ok ? `${s.kept} India-open of ${s.fetched}${s.truncated ? ' (more not read)' : ''}` : `failed: ${s.error}`}`);
    });
    report.companies.sort((a, b) => a.slug.localeCompare(b.slug));

    const takenOn = istDate(started);
    for (const s of report.companies) {
      if (!s.ok) continue;
      const list = kept.get(s.slug)!;
      const snap = buildSnapshot(s.slug, list, known?.get(s.slug) ?? null, takenOn, startedAt);
      s.newOpenings = known ? snap.new_openings : null;
      report.snapshots.push(snap);
      report.openings.push(...list);
      if (options.publish) {
        report.totals.written.openings += await options.store!.upsertOpenings(list.map((o) => toOpeningRow(o, startedAt)));
        // A truncated read did not see every posting: closing the rest would close live ones.
        if (!s.truncated) report.totals.expired.openings += await options.store!.expireOpenings(s.slug, startedAt);
      }
    }
    if (options.publish) report.totals.written.snapshots = await options.store!.upsertSnapshots(report.snapshots);
    report.totals.openings = report.openings.length;
    report.totals.internships = report.openings.filter((o) => o.kind === 'internship').length;
    report.totals.entryLevel = report.openings.filter((o) => o.level === 'entry').length;
  }

  // ── Hackathons ─────────────────────────────────────────────────────────────
  if (want.has('hackathons')) {
    const sources = options.hackathonSources?.length ? options.hackathonSources : [...HACKATHON_SOURCES];
    const all: Hackathon[] = [];
    for (const source of sources) {
      const s: HackathonStats = { source, ok: true, error: null, blockedByRobots: false, fetched: 0, outOfRegion: 0, ended: 0, invalid: 0, kept: 0, truncated: false };
      try {
        const result = await HACKATHON_FETCHERS[source]({ http, maxPages, now: started });
        s.fetched = result.hackathons.length;
        s.truncated = result.truncated;
        for (const candidate of result.hackathons) {
          const parsed = parseHackathon(candidate);
          if (!parsed.ok) {
            s.invalid++;
            if (s.invalid <= 2) warnings.push(`${source}: invalid hackathon "${candidate.title}": ${parsed.issues.join('; ')}`);
            continue;
          }
          const h = parsed.value;
          if (h.endsAt && h.endsAt < startedAt) {
            s.ended++;
            continue;
          }
          if (options.region === 'india' && !(h.inIndia || h.mode === 'online')) {
            s.outOfRegion++;
            continue;
          }
          all.push(h);
          s.kept++;
        }
      } catch (err) {
        s.ok = false;
        s.blockedByRobots = err instanceof BlockedByRobotsError && err.reason === null;
        s.error = errorText(err);
      }
      report.hackathonSources.push(s);
      log(`[feed] ${source}: ${s.ok ? `${s.kept} kept of ${s.fetched}` : `failed: ${s.error}`}`);
    }
    const { unique, duplicates } = mergeHackathons(all);
    report.hackathons = unique.sort((a, b) => (a.startsAt ?? '9999').localeCompare(b.startsAt ?? '9999'));
    report.totals.hackathons = unique.length;
    report.totals.hackathonDuplicates = duplicates;
    if (options.publish) {
      // Per source, so one source the database rejects (e.g. before migration 033 allows it) does not stop the rest.
      for (const s of report.hackathonSources) {
        if (!s.ok) continue;
        const rows = unique.filter((h) => h.source === s.source).map((h) => toHackathonRow(h, startedAt));
        try {
          report.totals.written.hackathons += await options.store!.upsertHackathons(rows);
          if (!s.truncated) report.totals.expired.hackathons += await options.store!.expireHackathons(s.source, startedAt);
        } catch (err) {
          s.ok = false;
          s.error = `publishing failed: ${errorText(err)}`;
          log(`[feed] ${s.source}: ${s.error}`);
        }
      }
    }
  }

  report.finishedAt = clock().toISOString();
  return report;
}

export function formatFeedSummary(report: FeedRunReport): string {
  const t = report.totals;
  const lines = [
    `Nomadic feed scrape — ${report.startedAt}`,
    `${report.published ? 'Published' : 'Dry run (nothing written)'} — region ${report.region}`,
  ];
  if (report.companies.length || report.curatedOnly.length) {
    lines.push('', 'Companies (India-open / read, internships, entry level, new):');
    for (const c of report.companies) {
      lines.push(
        c.ok
          ? `  ${c.slug.padEnd(18)} ${String(c.kept).padStart(4)} / ${String(c.fetched).padEnd(5)} intern ${String(c.internships).padStart(3)}  entry ${String(c.entryLevel).padStart(3)}  new ${c.newOpenings === null ? '  -' : String(c.newOpenings).padStart(3)}${c.truncated ? '  (more not read)' : ''}`
          : `  ${c.slug.padEnd(18)} FAILED${c.blockedByRobots ? ' (robots.txt)' : ''}: ${c.error}`
      );
    }
    const failed = report.companies.filter((c) => !c.ok).length;
    lines.push(
      `Openings: ${t.openings} (${t.internships} internships, ${t.entryLevel} entry level) from ${report.companies.length - failed} companies; ${failed} failed.`
    );
    if (report.curatedOnly.length) lines.push(`No readable listing (curated in Admin): ${report.curatedOnly.join(', ')}.`);
  }
  if (report.hackathonSources.length) {
    lines.push('', 'Hackathons:');
    for (const s of report.hackathonSources) {
      lines.push(
        s.ok
          ? `  ${s.source.padEnd(12)} kept ${String(s.kept).padStart(4)} of ${String(s.fetched).padStart(4)}  ended ${s.ended}  outside region ${s.outOfRegion}  invalid ${s.invalid}${s.truncated ? '  (more not read)' : ''}`
          : `  ${s.source.padEnd(12)} FAILED${s.blockedByRobots ? ' (robots.txt)' : ''}: ${s.error}`
      );
    }
    lines.push(`Hackathons: ${t.hackathons} after removing ${t.hackathonDuplicates} listed on two sites.`);
  }
  if (report.published) {
    lines.push(
      '',
      `Written: ${t.written.companies} companies, ${t.written.openings} openings, ${t.written.snapshots} snapshots, ${t.written.hackathons} hackathons.`,
      `Closed: ${t.expired.openings} openings, ${t.expired.hackathons} hackathons no longer listed.`
    );
  }
  if (report.warnings.length) lines.push('', 'Warnings:', ...report.warnings.slice(0, 30).map((w) => `  ${w}`));
  return lines.join('\n') + '\n';
}

import { existsSync, readFileSync } from 'fs';
import { z } from 'zod';
import { COMPANIES, type CareersAdapter, type CompanyCategory, type CompanyDef } from '../feed/companies.js';
import { BlockedByRobotsError, type PoliteFetcher } from '../feed/http.js';
import { cleanText } from '../pipeline/normalize.js';
import { isIndiaEligible } from '../pipeline/region.js';
import { fetchAshbyBoardPage, type BoardConfig } from './ats.js';
import { INDIA_COMPANIES, boardSlugsFor } from './india-companies.js';

/**
 * Company job boards found by `discover`: each candidate company's name is tried on Greenhouse, Lever, Ashby and
 * SmartRecruiters (their public posting APIs), and a board is kept only when it lists at least one India-open job.
 * The result is a JSON file (the scraper folder's state/boards.json, path in SCRAPER_BOARDS_FILE) that the job
 * sources and the company snapshots read on every run. Nothing here is guessed at run time: a board is either in
 * the file because its API answered with India jobs, or it is not used.
 */

export const DISCOVERY_ATS = ['greenhouse', 'lever', 'ashby', 'smartrecruiters'] as const;
export type DiscoveryAts = (typeof DISCOVERY_ATS)[number];

const BoardSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  name: z.string().min(1).max(120),
  category: z.enum(['big_tech', 'product', 'indian_product', 'fintech', 'finance', 'semiconductor', 'services']),
  ats: z.enum(DISCOVERY_ATS),
  board: z.string().min(1).max(120),
  indiaJobs: z.number().int().nonnegative(),
  totalJobs: z.number().int().nonnegative(),
  checkedAt: z.string(),
});
export type DiscoveredBoard = z.infer<typeof BoardSchema>;

const FileSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  boards: z.array(BoardSchema),
});
export type BoardsFile = z.infer<typeof FileSchema>;

/** The discovered boards, or none when the file is missing or unreadable (the run then uses the built-in lists). */
export function loadDiscoveredBoards(path: string | undefined = process.env.SCRAPER_BOARDS_FILE): DiscoveredBoard[] {
  if (!path || !existsSync(path)) return [];
  try {
    const parsed = FileSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
    return parsed.success ? parsed.data.boards : [];
  } catch {
    return [];
  }
}

/** Built-in boards plus discovered ones for one ATS, one entry per board id. */
export function mergeBoards(builtIn: BoardConfig[], discovered: DiscoveredBoard[], ats: DiscoveryAts): BoardConfig[] {
  const out = new Map<string, BoardConfig>();
  for (const b of builtIn) out.set(b.boardId.toLowerCase(), b);
  for (const d of discovered) if (d.ats === ats && !out.has(d.board.toLowerCase())) out.set(d.board.toLowerCase(), { name: d.name, boardId: d.board });
  return [...out.values()];
}

export function boardUrl(ats: DiscoveryAts, board: string): string {
  const b = encodeURIComponent(board);
  switch (ats) {
    case 'greenhouse':
      return `https://job-boards.greenhouse.io/${b}`;
    case 'lever':
      return `https://jobs.lever.co/${b}`;
    case 'ashby':
      return `https://jobs.ashbyhq.com/${b}`;
    case 'smartrecruiters':
      return `https://jobs.smartrecruiters.com/${b}`;
  }
}

const adapterFor = (d: DiscoveredBoard): CareersAdapter =>
  d.ats === 'smartrecruiters' ? { kind: 'smartrecruiters', company: d.board } : { kind: d.ats, board: d.board };

/**
 * Companies the feed reads: the famous ones (a discovered board fills in for one without a readable listing), then
 * every other company with a discovered board. One board per company (the one with the most India jobs).
 */
export function feedCompanies(discovered: DiscoveredBoard[] = loadDiscoveredBoards()): CompanyDef[] {
  const best = new Map<string, DiscoveredBoard>();
  for (const d of discovered) {
    const prev = best.get(d.slug);
    if (!prev || d.indiaJobs > prev.indiaJobs) best.set(d.slug, d);
  }
  const out: CompanyDef[] = COMPANIES.map((c) => {
    const d = best.get(c.slug);
    return !c.careers && d ? { ...c, careers: adapterFor(d) } : c;
  });
  const known = new Set(out.map((c) => c.slug));
  for (const d of best.values()) {
    if (known.has(d.slug)) continue;
    out.push({ slug: d.slug, name: d.name, domain: '', careersUrl: boardUrl(d.ats, d.board), category: d.category, careers: adapterFor(d) });
  }
  return out;
}

// ── Discovery ────────────────────────────────────────────────────────────────

export interface Candidate {
  slug: string;
  name: string;
  category: CompanyCategory;
  boardHints?: string[];
}

/** Every company worth probing: famous ones without a readable listing, then the India list. */
export function discoveryCandidates(): Candidate[] {
  const famous = COMPANIES.filter((c) => !c.careers).map((c) => ({ slug: c.slug, name: c.name, category: c.category }));
  return [...famous, ...INDIA_COMPANIES];
}

interface ProbeResult {
  total: number;
  india: number;
}

class NotFound extends Error {}

async function getJson(http: PoliteFetcher, url: string): Promise<any> {
  try {
    return await http.json(url);
  } catch (err) {
    if (err instanceof Error && /HTTP (404|410)\b/.test(err.message)) throw new NotFound(url);
    throw err;
  }
}

const count = (jobs: { location: string; remote: boolean }[]): ProbeResult => ({
  total: jobs.length,
  india: jobs.filter((j) => isIndiaEligible(j)).length,
});

/** Reads one board through its public API. null = no such board (404, or SmartRecruiters naming another company). */
export async function probeBoard(http: PoliteFetcher, ats: DiscoveryAts, board: string): Promise<ProbeResult | null> {
  const b = encodeURIComponent(board);
  try {
    if (ats === 'greenhouse') {
      const data = await getJson(http, `https://boards-api.greenhouse.io/v1/boards/${b}/jobs`);
      const jobs: any[] = Array.isArray(data?.jobs) ? data.jobs : [];
      return count(jobs.map((j) => ({ location: cleanText(j?.location?.name), remote: /remote/i.test(String(j?.location?.name ?? '')) })));
    }
    if (ats === 'lever') {
      const data = await getJson(http, `https://api.lever.co/v0/postings/${b}?mode=json`);
      const jobs: any[] = Array.isArray(data) ? data : [];
      return count(
        jobs.map((j) => {
          const location = cleanText(j?.categories?.location ?? (j?.categories?.allLocations ?? []).join(', '));
          return { location, remote: /remote/i.test(`${j?.workplaceType ?? ''} ${location}`) };
        })
      );
    }
    if (ats === 'ashby') {
      let data: any;
      try {
        data = await getJson(http, `https://api.ashbyhq.com/posting-api/job-board/${b}`);
      } catch (err) {
        if (err instanceof NotFound) throw err;
        // The API's robots.txt is unreadable for us (401): read the hosted board page instead.
        const postings = await fetchAshbyBoardPage(http.asFetch(), board);
        if (!postings) return null;
        return count(
          postings.map((p) => {
            const places = [p?.locationName, ...(Array.isArray(p?.secondaryLocations) ? p.secondaryLocations.map((s: any) => s?.locationName) : [])];
            return { location: cleanText(places.filter((x) => typeof x === 'string').join(', ')), remote: /remote/i.test(String(p?.workplaceType ?? '')) };
          })
        );
      }
      const jobs: any[] = (Array.isArray(data?.jobs) ? data.jobs : []).filter((j: any) => j?.isListed !== false);
      return count(
        jobs.map((j) => {
          const places = [j?.location, ...(Array.isArray(j?.secondaryLocations) ? j.secondaryLocations.map((s: any) => s?.location) : [])];
          return { location: cleanText(places.filter((p) => typeof p === 'string').join(', ')), remote: j?.isRemote === true };
        })
      );
    }
    // SmartRecruiters answers 200 with nothing for any name: the postings must belong to this exact company.
    const data = await getJson(http, `https://api.smartrecruiters.com/v1/companies/${b}/postings?country=in&limit=100`);
    const jobs: any[] = Array.isArray(data?.content) ? data.content : [];
    if (!jobs.length || String(jobs[0]?.company?.identifier ?? '').toLowerCase() !== board.toLowerCase()) return null;
    const total = Number(data?.totalFound);
    return { total: Number.isFinite(total) ? total : jobs.length, india: Number.isFinite(total) ? total : jobs.length };
  } catch (err) {
    if (err instanceof NotFound) return null;
    throw err;
  }
}

export interface DiscoveryOptions {
  http: PoliteFetcher;
  now: Date;
  candidates?: Candidate[];
  /** Keep boards already in the file that this run could not re-check (network error). */
  previous?: DiscoveredBoard[];
  concurrency?: number;
  log?: (message: string) => void;
}

export interface DiscoveryReport {
  file: BoardsFile;
  probed: number;
  found: number;
  errors: string[];
  /** Platforms whose robots.txt disallows their API: probed once, then skipped for the rest of the run. */
  blocked: DiscoveryAts[];
}

export async function discoverBoards(options: DiscoveryOptions): Promise<DiscoveryReport> {
  const candidates = options.candidates ?? discoveryCandidates();
  const log = options.log ?? (() => undefined);
  const at = options.now.toISOString();
  const boards: DiscoveredBoard[] = [];
  const errors: string[] = [];
  const failed = new Set<string>();
  const blocked = new Set<DiscoveryAts>();
  let probed = 0;
  let next = 0;
  const worker = async () => {
    while (next < candidates.length) {
      const c = candidates[next++];
      for (const ats of DISCOVERY_ATS) {
        for (const board of boardSlugsFor(c)) {
          // robots.txt is the same for every company on a platform: once it says no, asking again is wasted.
          if (blocked.has(ats)) break;
          probed++;
          try {
            const r = await probeBoard(options.http, ats, board);
            if (!r) continue;
            if (r.india > 0) {
              boards.push({ slug: c.slug, name: c.name, category: c.category, ats, board, indiaJobs: r.india, totalJobs: r.total, checkedAt: at });
              log(`[discover] ${c.name}: ${ats}/${board} — ${r.india} India-open of ${r.total}`);
            }
            break;
          } catch (err) {
            if (err instanceof BlockedByRobotsError && err.reason === null) {
              if (!blocked.has(ats)) log(`[discover] ${ats}: robots.txt disallows its API; skipped for the rest of this run`);
              blocked.add(ats);
              break;
            }
            failed.add(`${c.slug}|${ats}`);
            if (errors.length < 50) errors.push(`${c.name} ${ats}/${board}: ${err instanceof Error ? err.message : String(err)}`);
            break;
          }
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, options.concurrency ?? 4) }, worker));
  // A board we found before but could not reach now stays; one that answered without India jobs is dropped, and so
  // is one on a platform whose robots.txt now disallows it (the job sources could not read it either).
  for (const p of options.previous ?? []) {
    if (failed.has(`${p.slug}|${p.ats}`) && !blocked.has(p.ats) && !boards.some((b) => b.slug === p.slug && b.ats === p.ats)) boards.push(p);
  }
  boards.sort((a, b) => a.name.localeCompare(b.name) || a.ats.localeCompare(b.ats));
  return { file: { version: 1, generatedAt: at, boards }, probed, found: boards.length, errors, blocked: [...blocked] };
}

export function formatDiscoverySummary(report: DiscoveryReport): string {
  const byAts = DISCOVERY_ATS.map((a) => `${a} ${report.file.boards.filter((b) => b.ats === a).length}`).join(', ');
  const lines = [
    `Nomadic board discovery — ${report.file.generatedAt}`,
    `Boards with India-open jobs: ${report.found} (${byAts}) from ${report.probed} probes.`,
    '',
    ...report.file.boards.map((b) => `  ${b.name.padEnd(34)} ${b.ats.padEnd(16)} ${b.board.padEnd(24)} ${b.indiaJobs} India of ${b.totalJobs}`),
  ];
  if (report.blocked.length) lines.push('', `Skipped (robots.txt disallows the API): ${report.blocked.join(', ')}.`);
  if (report.errors.length) lines.push('', 'Could not check (kept from the last run if found before):', ...report.errors.map((e) => `  ${e}`));
  return lines.join('\n') + '\n';
}

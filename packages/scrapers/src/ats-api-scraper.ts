import { computeJobHash } from './hasher.js';

export interface RawJob {
  company: string;
  title: string;
  location: string;
  description: string;
  applyUrl: string;
  source: string;
  jobHash: string;
  salary?: string;
  employmentType?: 'job' | 'internship';
  workplaceType?: 'remote' | 'hybrid' | 'onsite';
  experienceLevel?: 'entry' | 'mid' | 'senior';
  createdAt?: string;
  /** Real posting date from the source when it provides one (ISO string). Never fabricated. */
  postedAt?: string;
}

export interface AtsBoardConfig {
  name: string;
  type: 'greenhouse' | 'lever' | 'ashby';
  boardId: string;
}

export interface BoardResult {
  board: string;
  type: AtsBoardConfig['type'];
  ok: boolean;
  count: number;
  ms: number;
  error?: string;
}

export const DEFAULT_TOP_TECH_BOARDS: AtsBoardConfig[] = [
  // Ashby (public posting API, direct application forms)
  { name: 'OpenAI', type: 'ashby', boardId: 'openai' },
  { name: 'Perplexity', type: 'ashby', boardId: 'perplexity' },
  { name: 'ElevenLabs', type: 'ashby', boardId: 'elevenlabs' },
  { name: 'Cursor', type: 'ashby', boardId: 'cursor' },
  { name: 'Supabase', type: 'ashby', boardId: 'supabase' },
  { name: 'Cohere', type: 'ashby', boardId: 'cohere' },
  { name: 'Cognition', type: 'ashby', boardId: 'cognition' },
  { name: 'Ramp', type: 'ashby', boardId: 'ramp' },
  { name: 'LangChain', type: 'ashby', boardId: 'langchain' },
  { name: 'Linear', type: 'ashby', boardId: 'linear' },
  { name: 'Replit', type: 'ashby', boardId: 'replit' },
  { name: 'Modal', type: 'ashby', boardId: 'modal' },
  { name: 'SigNoz', type: 'ashby', boardId: 'signoz' },
  { name: 'Braintrust', type: 'ashby', boardId: 'braintrust' },
  { name: 'Anyscale', type: 'ashby', boardId: 'anyscale' },
  { name: 'Midjourney', type: 'ashby', boardId: 'midjourney' },
  { name: 'PostHog', type: 'ashby', boardId: 'posthog' },
  { name: 'Resend', type: 'ashby', boardId: 'resend' },
  { name: 'LlamaIndex', type: 'ashby', boardId: 'llamaindex' },
  { name: 'CharacterAI', type: 'ashby', boardId: 'character' },
  { name: 'Pinecone', type: 'ashby', boardId: 'pinecone' },

  // Lever (public postings API)
  { name: 'Palantir', type: 'lever', boardId: 'palantir' },
  { name: 'Spotify', type: 'lever', boardId: 'spotify' },
  { name: 'Meesho', type: 'lever', boardId: 'meesho' },

  // Greenhouse (public boards API). Dead/renamed boards show up in the health report instead of failing silently.
  { name: 'Postman', type: 'greenhouse', boardId: 'postman' },
  { name: 'Groww', type: 'greenhouse', boardId: 'groww' },
  { name: 'InMobi', type: 'greenhouse', boardId: 'inmobi' },
  { name: 'Twilio', type: 'greenhouse', boardId: 'twilio' },
  { name: 'MongoDB', type: 'greenhouse', boardId: 'mongodb' },
  { name: 'Okta', type: 'greenhouse', boardId: 'okta' },
  { name: 'Canonical', type: 'greenhouse', boardId: 'canonical' },
  { name: 'Stripe', type: 'greenhouse', boardId: 'stripe' },
  { name: 'Databricks', type: 'greenhouse', boardId: 'databricks' },
  { name: 'Cloudflare', type: 'greenhouse', boardId: 'cloudflare' },
  { name: 'Figma', type: 'greenhouse', boardId: 'figma' },
  { name: 'Datadog', type: 'greenhouse', boardId: 'datadog' },
  { name: 'Airbnb', type: 'greenhouse', boardId: 'airbnb' },
  { name: 'Coinbase', type: 'greenhouse', boardId: 'coinbase' },
];

export interface AtsScrapeOptions {
  /** Boards fetched in parallel. */
  concurrency?: number;
  timeoutMs?: number;
  /** Retries on network errors, 429 and 5xx only (a 404 means the board is gone; retrying won't help). */
  retries?: number;
  retryDelayMs?: number;
}

const isoOrUndefined = (v: unknown): string | undefined => {
  if (v == null || v === '') return undefined;
  const d = new Date(typeof v === 'number' ? v : String(v));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};

function classify(title: string, location: string) {
  const t = title.toLowerCase();
  const l = location.toLowerCase();
  const isIntern = /\b(intern|internship|trainee)\b/.test(t);
  const isRemote = l.includes('remote') || t.includes('remote');
  return {
    employmentType: (isIntern ? 'internship' : 'job') as 'job' | 'internship',
    workplaceType: (isRemote ? 'remote' : 'hybrid') as 'remote' | 'hybrid',
  };
}

async function fetchJson(url: string, opts: Required<AtsScrapeOptions>): Promise<any> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
      let res: Response;
      try {
        res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
      } finally {
        clearTimeout(timer);
      }
      if (res.ok) return await res.json();
      const retryable = res.status === 429 || res.status >= 500;
      lastErr = new Error(`HTTP ${res.status}`);
      if (!retryable) break;
    } catch (e) {
      lastErr = e;
    }
    if (attempt < opts.retries) await new Promise((r) => setTimeout(r, opts.retryDelayMs * (attempt + 1)));
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function parseBoard(board: AtsBoardConfig, data: any): RawJob[] {
  const jobs: RawJob[] = [];
  if (board.type === 'greenhouse') {
    for (const item of Array.isArray(data?.jobs) ? data.jobs : []) {
      const applyUrl = item.absolute_url;
      if (!applyUrl || typeof applyUrl !== 'string' || !item.title) continue;
      const loc = item.location?.name || 'Remote / Unspecified';
      jobs.push({
        company: board.name,
        title: item.title,
        location: loc,
        description: item.content || '',
        applyUrl,
        source: 'Greenhouse API',
        jobHash: computeJobHash(board.name, item.title, applyUrl),
        postedAt: isoOrUndefined(item.first_published ?? item.updated_at),
        ...classify(item.title, loc),
      });
    }
  } else if (board.type === 'lever') {
    for (const item of Array.isArray(data) ? data : []) {
      const applyUrl = item.applyUrl || item.hostedUrl;
      if (!applyUrl || typeof applyUrl !== 'string' || !item.text) continue;
      const loc = item.categories?.location || 'Remote / Unspecified';
      jobs.push({
        company: board.name,
        title: item.text,
        location: loc,
        description: item.descriptionPlain || item.description || '',
        applyUrl,
        source: 'Lever API',
        jobHash: computeJobHash(board.name, item.text, applyUrl),
        postedAt: isoOrUndefined(item.createdAt),
        ...classify(item.text, loc),
      });
    }
  } else if (board.type === 'ashby') {
    for (const item of Array.isArray(data?.jobs) ? data.jobs : []) {
      if (item.isListed === false || !item.title) continue;
      const applyUrl = item.jobUrl || item.applyUrl || (item.id ? `https://jobs.ashbyhq.com/${board.boardId}/${item.id}` : '');
      if (!applyUrl || typeof applyUrl !== 'string') continue;
      const loc = typeof item.location === 'string' ? item.location : item.location?.name || 'Remote / Unspecified';
      jobs.push({
        company: board.name,
        title: item.title,
        location: loc,
        description: item.descriptionPlain || '',
        applyUrl,
        source: 'Ashby API',
        jobHash: computeJobHash(board.name, item.title, applyUrl),
        postedAt: isoOrUndefined(item.publishedAt ?? item.publishedDate),
        ...classify(item.title, String(loc)),
      });
    }
  }
  return jobs;
}

const BOARD_URL: Record<AtsBoardConfig['type'], (id: string) => string> = {
  greenhouse: (id) => `https://boards-api.greenhouse.io/v1/boards/${id}/jobs?content=true`,
  lever: (id) => `https://api.lever.co/v0/postings/${id}?mode=json`,
  ashby: (id) => `https://api.ashbyhq.com/posting-api/job-board/${id}`,
};

/** Scrape every board in parallel (bounded), keeping board order in the output and reporting per-board health. */
export async function scrapeAtsApisDetailed(
  companyBoards: AtsBoardConfig[] = DEFAULT_TOP_TECH_BOARDS,
  options: AtsScrapeOptions = {},
): Promise<{ jobs: RawJob[]; boards: BoardResult[] }> {
  const opts: Required<AtsScrapeOptions> = {
    concurrency: options.concurrency ?? 8,
    timeoutMs: options.timeoutMs ?? 12000,
    retries: options.retries ?? 1,
    retryDelayMs: options.retryDelayMs ?? 250,
  };
  const perBoard: RawJob[][] = companyBoards.map(() => []);
  const results: BoardResult[] = new Array(companyBoards.length);
  let next = 0;

  const worker = async () => {
    while (next < companyBoards.length) {
      const i = next++;
      const board = companyBoards[i];
      const t0 = Date.now();
      try {
        const data = await fetchJson(BOARD_URL[board.type](board.boardId), opts);
        perBoard[i] = parseBoard(board, data);
        results[i] = { board: board.name, type: board.type, ok: true, count: perBoard[i].length, ms: Date.now() - t0 };
      } catch (err: any) {
        results[i] = { board: board.name, type: board.type, ok: false, count: 0, ms: Date.now() - t0, error: String(err?.message || err) };
        console.warn(`[ATS Scraper] ${board.name} (${board.type}) failed: ${err?.message || err}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency, companyBoards.length) }, worker));
  return { jobs: perBoard.flat(), boards: results };
}

export async function scrapeAtsApis(
  companyBoards: AtsBoardConfig[] = DEFAULT_TOP_TECH_BOARDS,
  options: AtsScrapeOptions = {},
): Promise<RawJob[]> {
  return (await scrapeAtsApisDetailed(companyBoards, options)).jobs;
}

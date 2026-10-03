import type { JobInput, SourceTier } from '../pipeline/schema.ts';
import type { ScraperConfig } from '../config.ts';

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export const consoleLogger: Logger = {
  info: m => console.log(m),
  warn: m => console.warn(m),
  error: m => console.error(m),
};

export const silentLogger: Logger = { info: () => {}, warn: () => {}, error: () => {} };

export interface SourceContext {
  fetch: typeof fetch;
  config: ScraperConfig;
  log: Logger;
  now: Date;
}

export interface SourceFetchResult<R = unknown> {
  records: R[];
  /** Non-fatal errors (one board failing, a feed timing out, ...). */
  errors: string[];
  /**
   * Companies / boards that failed this run. Jobs belonging to them are NOT
   * expired, so a transient outage on one board does not wipe its listings.
   */
  failedScopes: string[];
  /** Records the source itself reported as closed/expired (e.g. detail page 404). */
  closedSignals: number;
}

export interface SourceAdapter<R = any> {
  /** Stable key stored in `jobs.source_key` and `scrape_run_sources.source_key`. */
  key: string;
  /** Display label stored in `jobs.source` (kept compatible with the desktop feed filters). */
  label: string;
  tier: SourceTier;
  description: string;
  /** False when the source has nothing to fetch with the current config (e.g. no boards listed). */
  isConfigured(config: ScraperConfig): boolean;
  fetchRaw(ctx: SourceContext): Promise<SourceFetchResult<R>>;
  /** Maps one raw record to a `JobInput`; return null to drop it (counted as invalid). */
  normalize(record: R, ctx: SourceContext): JobInput | null;
  /** Scope (company) a normalized job belongs to, matched against `failedScopes`. */
  scopeOf?(job: { company: string }): string;
}

export function emptyResult<R>(): SourceFetchResult<R> {
  return { records: [], errors: [], failedScopes: [], closedSignals: 0 };
}

export class HttpError extends Error {
  constructor(public status: number, public url: string) {
    super(`HTTP ${status} for ${url}`);
  }
}

const JSON_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'NomadicJobBot/2.0',
};

export async function getJson<T = any>(ctx: SourceContext, url: string, init: RequestInit = {}): Promise<T> {
  const res = await ctx.fetch(url, {
    ...init,
    headers: { ...JSON_HEADERS, ...(init.headers as Record<string, string> | undefined) },
    signal: init.signal ?? AbortSignal.timeout(ctx.config.requestTimeoutMs),
  });
  if (!res.ok) throw new HttpError(res.status, url);
  return (await res.json()) as T;
}

export async function getText(ctx: SourceContext, url: string, init: RequestInit = {}): Promise<string> {
  const res = await ctx.fetch(url, {
    ...init,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...(init.headers as Record<string, string> | undefined),
    },
    signal: init.signal ?? AbortSignal.timeout(ctx.config.requestTimeoutMs),
  });
  if (!res.ok) throw new HttpError(res.status, url);
  return res.text();
}

/** Runs `task` over `items` with bounded concurrency, preserving order. */
export async function mapLimit<T, U>(items: T[], limit: number, task: (item: T, index: number) => Promise<U>): Promise<U[]> {
  const out: U[] = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await task(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

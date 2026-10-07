import { isAllowed, parseRobots, type Robots } from '../contacts/robots.js';
import type { FetchLike } from '../sources/ats.js';

/**
 * Polite HTTP for the feed scraper: robots.txt is read once per host and obeyed (for our agent, else "*"),
 * requests to one host are spaced by at least `minDelayMs` (or the site's Crawl-delay, capped at 10 s),
 * and every request has a timeout. A robots.txt we cannot read (401/403/429/5xx/network) blocks the host.
 */

export const FEED_BOT_AGENT = 'NomadicFeedBot';
export const FEED_USER_AGENT = `${FEED_BOT_AGENT}/1.0 (+https://github.com/snipy09/nomadic)`;

export class BlockedByRobotsError extends Error {
  /** `reason` is set when robots.txt itself could not be read (network error, 401/403/429/5xx). */
  constructor(
    readonly url: string,
    readonly reason: string | null = null
  ) {
    super(reason ? `robots.txt could not be read (${reason}), so ${new URL(url).host} is skipped` : `robots.txt does not allow ${url}`);
  }
}

export interface PoliteOptions {
  fetchImpl?: FetchLike;
  minDelayMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface JsonRequest {
  method?: 'GET' | 'POST';
  body?: unknown;
  headers?: Record<string, string>;
}

export class PoliteFetcher {
  private readonly fetchImpl: FetchLike;
  private readonly minDelayMs: number;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly robots = new Map<string, Promise<Robots>>();
  private readonly robotsErrors = new Map<string, string>();
  private readonly nextAt = new Map<string, number>();
  requests = 0;

  constructor(options: PoliteOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.minDelayMs = options.minDelayMs ?? 1000;
    this.timeoutMs = options.timeoutMs ?? 20000;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = options.now ?? (() => Date.now());
  }

  private robotsFor(origin: string): Promise<Robots> {
    let cached = this.robots.get(origin);
    if (!cached) {
      cached = (async () => {
        try {
          const res = await this.fetchImpl(`${origin}/robots.txt`, {
            headers: { 'User-Agent': FEED_USER_AGENT },
            signal: AbortSignal.timeout(this.timeoutMs),
          });
          const body = res.ok ? await res.text() : '';
          if (res.ok) return parseRobots(body, FEED_BOT_AGENT);
          if (res.status >= 400 && res.status < 500 && ![401, 403, 429].includes(res.status)) {
            return { rules: [], crawlDelay: null, denyAll: false };
          }
          this.robotsErrors.set(origin, `HTTP ${res.status}`);
          return { rules: [], crawlDelay: null, denyAll: true };
        } catch (err) {
          this.robotsErrors.set(origin, err instanceof Error ? err.message : String(err));
          return { rules: [], crawlDelay: null, denyAll: true };
        }
      })();
      this.robots.set(origin, cached);
    }
    return cached;
  }

  private async wait(origin: string, robots: Robots) {
    const gap = Math.max(this.minDelayMs, Math.min((robots.crawlDelay ?? 0) * 1000, 10000));
    const at = this.nextAt.get(origin) ?? 0;
    const now = this.now();
    this.nextAt.set(origin, Math.max(now, at) + gap);
    if (at > now) await this.sleep(at - now);
  }

  /** A FetchLike with the same robots, spacing and timeout rules, for adapters that take one. */
  asFetch(): FetchLike {
    return async (input, init) => {
      const u = new URL(input);
      const robots = await this.robotsFor(u.origin);
      if (!isAllowed(robots, u.pathname + u.search)) throw new BlockedByRobotsError(input, this.robotsErrors.get(u.origin) ?? null);
      await this.wait(u.origin, robots);
      this.requests++;
      return this.fetchImpl(input, {
        ...init,
        headers: { ...(init?.headers as Record<string, string> | undefined), 'User-Agent': FEED_USER_AGENT },
        signal: init?.signal ?? AbortSignal.timeout(this.timeoutMs),
      });
    };
  }

  async json(url: string, request: JsonRequest = {}): Promise<any> {
    const u = new URL(url);
    const robots = await this.robotsFor(u.origin);
    if (!isAllowed(robots, u.pathname + u.search)) throw new BlockedByRobotsError(url, this.robotsErrors.get(u.origin) ?? null);
    await this.wait(u.origin, robots);
    this.requests++;
    const method = request.method ?? 'GET';
    const res = await this.fetchImpl(url, {
      method,
      headers: {
        Accept: 'application/json',
        'User-Agent': FEED_USER_AGENT,
        ...(request.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...request.headers,
      },
      body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${method} ${url}`);
    return res.json();
  }
}

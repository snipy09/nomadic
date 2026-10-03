/**
 * Fixture-backed `fetch` replacement.
 *
 * Used by the hermetic unit tests and by the benchmark / CLI `--fixtures` mode so
 * that every scraper (legacy and pipeline) can be exercised against recorded or
 * synthetic HTTP responses without touching the network.
 */

export type FixtureBody = string | object | null;

export interface FixtureRoute {
  /** Exact URL, URL prefix (ending in `*`), RegExp, or predicate. */
  match: string | RegExp | ((url: string, method: string) => boolean);
  method?: string;
  status?: number;
  headers?: Record<string, string>;
  body?: FixtureBody | ((url: string) => FixtureBody);
  /** Simulate a network failure (fetch rejects with this message). */
  error?: string;
}

export interface FixtureFetch {
  (input: string | URL | Request, init?: RequestInit): Promise<Response>;
  calls: Array<{ url: string; method: string }>;
  misses: string[];
}

export interface FixtureFetchOptions {
  /** What to do when no route matches. Default: reject like a DNS failure. */
  onMiss?: 'error' | '404';
}

function routeMatches(route: FixtureRoute, url: string, method: string): boolean {
  if (route.method && route.method.toUpperCase() !== method) return false;
  const m = route.match;
  if (typeof m === 'function') return m(url, method);
  if (m instanceof RegExp) return m.test(url);
  if (m.endsWith('*')) return url.startsWith(m.slice(0, -1));
  return url === m;
}

export function makeResponse(url: string, status: number, body: FixtureBody, headers: Record<string, string> = {}): Response {
  let text: string;
  const finalHeaders: Record<string, string> = { ...headers };
  if (body === null || body === undefined) {
    text = '';
  } else if (typeof body === 'string') {
    text = body;
    if (!finalHeaders['content-type']) {
      finalHeaders['content-type'] = body.trimStart().startsWith('<') ? 'text/html; charset=utf-8' : 'text/plain';
    }
  } else {
    text = JSON.stringify(body);
    if (!finalHeaders['content-type']) finalHeaders['content-type'] = 'application/json';
  }
  // Response bodies are not allowed for 204/304; keep it simple.
  const res = new Response(status === 204 || status === 304 ? null : text, { status, headers: finalHeaders });
  Object.defineProperty(res, 'url', { value: url });
  return res;
}

export function createFixtureFetch(routes: FixtureRoute[], options: FixtureFetchOptions = {}): FixtureFetch {
  const calls: FixtureFetch['calls'] = [];
  const misses: string[] = [];

  const fn = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET') || 'GET').toUpperCase();
    calls.push({ url, method });

    const route = routes.find(r => routeMatches(r, url, method));
    if (!route) {
      misses.push(`${method} ${url}`);
      if (options.onMiss === '404') return makeResponse(url, 404, 'Not Found');
      throw new TypeError(`fetch failed (no fixture for ${method} ${url})`);
    }
    if (route.error) throw new TypeError(route.error);
    const body = typeof route.body === 'function' ? route.body(url) : route.body ?? '';
    return makeResponse(url, route.status ?? 200, method === 'HEAD' ? null : body, route.headers);
  }) as FixtureFetch;

  fn.calls = calls;
  fn.misses = misses;
  return fn;
}

/**
 * Temporarily replaces `globalThis.fetch` while `task` runs. Legacy scrapers call
 * the global directly, so this is how they are run against fixtures.
 */
export async function withGlobalFetch<T>(impl: typeof fetch, task: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await task();
  } finally {
    globalThis.fetch = original;
  }
}

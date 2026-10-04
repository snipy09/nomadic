/**
 * Learn v2 project repo check (level L1): reads a PUBLIC GitHub repository with
 * the REST API (no token, 60 requests an hour per IP): the repo, commits since the
 * stage started, the recursive file tree and the README. Every request has a 10 s
 * timeout; results are cached for 5 minutes per repo and stage start. Nothing is
 * written anywhere; the rules come from the project catalogue.
 */
import { evaluateRepoRules, parseGithubRepo, type RepoCheck, type RepoRules } from '@job-automator/learning';

export const GITHUB_TIMEOUT_MS = 10_000;
export const GITHUB_CACHE_MS = 5 * 60_000;
const API = 'https://api.github.com';

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export interface RepoCheckOutcome {
  ok: boolean;
  passed?: boolean;
  checks?: RepoCheck[];
  commits?: number;
  rateLimited?: boolean;
  error?: string;
  checkedAt?: string;
}

class GithubError extends Error {
  constructor(message: string, readonly rateLimited = false) {
    super(message);
  }
}

const cache = new Map<string, { at: number; value: RepoCheckOutcome }>();

export function clearRepoCheckCache(): void {
  cache.clear();
}

async function getJson(fetchImpl: FetchFn, url: string, accept = 'application/vnd.github+json'): Promise<{ status: number; body: unknown; text: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GITHUB_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      headers: { Accept: accept, 'User-Agent': 'Nomadic-Desktop', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: ctrl.signal,
    });
    const remaining = res.headers.get('x-ratelimit-remaining');
    if ((res.status === 403 || res.status === 429) && (remaining === '0' || res.status === 429)) {
      const reset = Number(res.headers.get('x-ratelimit-reset'));
      const mins = Number.isFinite(reset) && reset > 0 ? Math.max(1, Math.ceil((reset * 1000 - Date.now()) / 60_000)) : null;
      throw new GithubError(
        `GitHub allows 60 checks an hour from one network and that limit is used up. Try again${mins ? ` in about ${mins} min` : ' later'}.`,
        true
      );
    }
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    return { status: res.status, body, text };
  } catch (err) {
    if (err instanceof GithubError) throw err;
    throw new GithubError(ctrl.signal.aborted ? 'GitHub took too long to answer. Try again.' : 'Could not reach GitHub. Check your connection.');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Checks a repo against a stage's rules. `since` is when the stage started
 * (commits after it count). Never throws.
 */
export async function checkRepo(
  repoUrl: string,
  rules: RepoRules,
  since: string | null,
  opts: { fetchImpl?: FetchFn; now?: () => number } = {}
): Promise<RepoCheckOutcome> {
  const parsed = parseGithubRepo(repoUrl);
  if (!parsed) return { ok: false, error: 'Enter a public GitHub repository link, like https://github.com/you/project.' };
  const now = opts.now ?? Date.now;
  const key = `${parsed.owner}/${parsed.repo}`.toLowerCase() + `|${since ?? ''}|${JSON.stringify(rules)}`;
  const hit = cache.get(key);
  if (hit && now() - hit.at < GITHUB_CACHE_MS) return hit.value;

  const fetchImpl: FetchFn = opts.fetchImpl ?? ((u, init) => fetch(u, init));
  const base = `${API}/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
  try {
    const repo = await getJson(fetchImpl, base);
    if (repo.status === 404) return { ok: false, error: 'That repository was not found. It must exist and be public.' };
    if (repo.status !== 200 || !repo.body || typeof repo.body !== 'object') return { ok: false, error: `GitHub answered with an error (${repo.status}). Try again later.` };
    const r = repo.body as { default_branch?: string; private?: boolean };
    if (r.private) return { ok: false, error: 'That repository is private. Make it public to check it.' };
    const branch = r.default_branch || 'main';

    let commits = 0;
    if (rules.min_commits > 0) {
      const q = new URLSearchParams({ sha: branch, per_page: '100' });
      if (since) q.set('since', since);
      const c = await getJson(fetchImpl, `${base}/commits?${q}`);
      commits = c.status === 200 && Array.isArray(c.body) ? c.body.length : 0;
    }

    let paths: string[] = [];
    if (rules.paths.length) {
      const t = await getJson(fetchImpl, `${base}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
      const tree = t.status === 200 && t.body && typeof t.body === 'object' ? (t.body as { tree?: Array<{ path?: string }> }).tree : [];
      paths = (tree ?? []).map((x) => x.path).filter((p): p is string => typeof p === 'string');
    }

    let readme: string | null = null;
    if (rules.readme_sections.length) {
      const rd = await getJson(fetchImpl, `${base}/readme`, 'application/vnd.github.raw+json');
      readme = rd.status === 200 ? rd.text : null;
    }

    const result = evaluateRepoRules(rules, { paths, readme, commits_since_stage_start: commits });
    const value: RepoCheckOutcome = { ok: true, passed: result.ok, checks: result.checks, commits, checkedAt: new Date(now()).toISOString() };
    cache.set(key, { at: now(), value });
    return value;
  } catch (err) {
    if (err instanceof GithubError) return { ok: false, error: err.message, rateLimited: err.rateLimited };
    return { ok: false, error: 'The repository could not be checked. Try again.' };
  }
}

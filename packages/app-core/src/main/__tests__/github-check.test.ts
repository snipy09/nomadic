import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkRepo, clearRepoCheckCache } from '../services/github-check';

const rules = { paths: ['src/**/*.ts', 'README.md'], readme_sections: ['Setup'], min_commits: 2 };

function gh(routes: Record<string, { status: number; body?: unknown; text?: string; headers?: Record<string, string> }>) {
  return vi.fn(async (url: string) => {
    const key = Object.keys(routes).find((k) => url.includes(k));
    const r = key ? routes[key] : { status: 404, body: {} };
    return new Response(r.text ?? JSON.stringify(r.body ?? null), { status: r.status, headers: r.headers });
  });
}

const okRoutes = {
  '/commits?': { status: 200, body: [{ sha: 'a' }, { sha: 'b' }] },
  '/git/trees/': { status: 200, body: { tree: [{ path: 'src' }, { path: 'src/index.ts' }, { path: 'README.md' }] } },
  '/readme': { status: 200, text: '# App\n\n## Setup\nnpm i' },
  'repos/me/app': { status: 200, body: { default_branch: 'main', private: false } },
};

beforeEach(() => clearRepoCheckCache());

describe('GitHub repo check', () => {
  it('passes when paths, README sections and commits are there', async () => {
    const f = gh(okRoutes);
    const res = await checkRepo('https://github.com/me/app', rules, '2026-10-01T00:00:00Z', { fetchImpl: f });
    expect(res).toMatchObject({ ok: true, passed: true, commits: 2 });
    expect(res.checks).toHaveLength(4);
    expect(String(f.mock.calls.find((c) => String(c[0]).includes('/commits'))![0])).toContain('since=2026-10-01');
  });

  it('fails a missing README section', async () => {
    const res = await checkRepo('https://github.com/me/app', rules, null, { fetchImpl: gh({ ...okRoutes, '/readme': { status: 200, text: '# App' } }) });
    expect(res).toMatchObject({ ok: true, passed: false });
  });

  it('reports a missing or private repository', async () => {
    expect(await checkRepo('https://github.com/me/app', rules, null, { fetchImpl: gh({}) })).toMatchObject({ ok: false, error: expect.stringMatching(/not found/) });
    const priv = gh({ 'repos/me/app': { status: 200, body: { private: true } } });
    expect(await checkRepo('https://github.com/me/app', rules, null, { fetchImpl: priv })).toMatchObject({ ok: false, error: expect.stringMatching(/private/) });
  });

  it('explains the rate limit in plain words', async () => {
    const f = gh({ 'repos/me/app': { status: 403, body: {}, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 600) } } });
    const res = await checkRepo('https://github.com/me/app', rules, null, { fetchImpl: f });
    expect(res).toMatchObject({ ok: false, rateLimited: true });
    expect(res.error).toMatch(/60 checks an hour/);
  });

  it('rejects links that are not GitHub repositories', async () => {
    const f = gh(okRoutes);
    expect(await checkRepo('https://gitlab.com/me/app', rules, null, { fetchImpl: f })).toMatchObject({ ok: false });
    expect(f).not.toHaveBeenCalled();
  });

  it('caches a result for 5 minutes', async () => {
    const f = gh(okRoutes);
    let t = 1_000_000;
    await checkRepo('https://github.com/me/app', rules, null, { fetchImpl: f, now: () => t });
    const calls = f.mock.calls.length;
    t += 60_000;
    await checkRepo('https://github.com/me/app', rules, null, { fetchImpl: f, now: () => t });
    expect(f.mock.calls.length).toBe(calls);
    t += 5 * 60_000;
    await checkRepo('https://github.com/me/app', rules, null, { fetchImpl: f, now: () => t });
    expect(f.mock.calls.length).toBeGreaterThan(calls);
  });

  it('turns network errors into a friendly message', async () => {
    const f = vi.fn(async () => { throw new TypeError('fetch failed'); });
    expect(await checkRepo('https://github.com/me/app', rules, null, { fetchImpl: f })).toMatchObject({ ok: false, error: expect.stringMatching(/Could not reach GitHub/) });
  });
});

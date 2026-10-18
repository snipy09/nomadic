import { describe, expect, it, vi } from 'vitest';
import { checkLink, findClosedSignal, isFailedLink, validateLinks } from '../pipeline/link-validate.js';

function res(status: number, body = '<html>Apply now</html>', contentType = 'text/html') {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? contentType : null) },
    text: async () => body,
  } as unknown as Response;
}

const POSTING = 'https://jobs.lever.co/acme/123';

describe('checkLink', () => {
  it('rejects directory roots without any request', async () => {
    const fetch = vi.fn();
    const result = await checkLink('https://jobs.lever.co/acme', fetch);
    expect(result.status).toBe('invalid');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('marks 404/410 on HEAD as dead without a GET', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(res(404));
    expect(await checkLink(POSTING, fetch)).toMatchObject({ status: 'dead', httpStatus: 404 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to GET when HEAD is refused and finds closed-job phrases', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(res(405))
      .mockResolvedValueOnce(res(200, '<h1>This position is closed</h1>'));
    const result = await checkLink(POSTING, fetch);
    expect(result.status).toBe('closed');
    expect(result.reason).toContain('this position is closed');
    expect(fetch.mock.calls[1][1].method).toBe('GET');
  });

  it('returns ok for a live page', async () => {
    const fetch = vi.fn().mockResolvedValue(res(200));
    expect((await checkLink(POSTING, fetch)).status).toBe('ok');
  });

  it.each([429, 503])('treats HTTP %i as unknown (not expired)', async (code) => {
    const fetch = vi.fn().mockResolvedValueOnce(res(200)).mockResolvedValueOnce(res(code));
    expect((await checkLink(POSTING, fetch)).status).toBe('unknown');
  });

  it('treats network errors as unknown', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    expect((await checkLink(POSTING, fetch)).status).toBe('unknown');
  });

  it('ignores closed phrases inside scripts and styles (theme translation tables)', () => {
    const page =
      '<script>var i18n={"This position has been filled":"Sorry, position has been filled"}</script>' +
      '<style>.filled:after{content:"position has been filled"}</style><h1>Senior Engineer</h1>';
    expect(findClosedSignal(page)).toBeNull();
    expect(findClosedSignal(`${page}<p>This position has been filled</p>`)).toBe('position has been filled');
  });

  it('does not scan non-text bodies', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(res(200))
      .mockResolvedValueOnce(res(200, 'page not found', 'application/pdf'));
    expect((await checkLink(POSTING, fetch)).status).toBe('ok');
  });
});

describe('validateLinks', () => {
  it('skips HTTP for trusted urls and when http=false', async () => {
    const fetch = vi.fn().mockResolvedValue(res(200));
    const trusted = await validateLinks([POSTING], { fetch, http: true, trusted: () => true });
    expect(trusted.get(POSTING)).toEqual({ status: 'ok', reason: 'listed_by_official_api' });
    const offline = await validateLinks([POSTING, 'https://jobs.lever.co/acme'], { fetch, http: false });
    expect(offline.get(POSTING)?.status).toBe('unchecked');
    expect(offline.get('https://jobs.lever.co/acme')?.status).toBe('invalid');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('checks each distinct url once, with bounded concurrency', async () => {
    let inFlight = 0;
    let peak = 0;
    const fetch = vi.fn(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
      return res(200);
    });
    const urls = Array.from({ length: 12 }, (_, i) => `https://jobs.lever.co/acme/${i}`);
    const results = await validateLinks([...urls, ...urls], { fetch, http: true, concurrency: 3 });
    expect(results.size).toBe(12);
    expect(fetch).toHaveBeenCalledTimes(24); // HEAD + GET per url
    expect(peak).toBeLessThanOrEqual(3);
  });
});

describe('helpers', () => {
  it('findClosedSignal / isFailedLink', () => {
    expect(findClosedSignal('<p>No longer accepting applications</p>')).toBe('no longer accepting applications');
    expect(findClosedSignal('<p>Apply</p>')).toBeNull();
    expect(isFailedLink('dead')).toBe(true);
    expect(isFailedLink('closed')).toBe(true);
    expect(isFailedLink('invalid')).toBe(true);
    expect(isFailedLink('unknown')).toBe(false);
    expect(isFailedLink('ok')).toBe(false);
  });
});

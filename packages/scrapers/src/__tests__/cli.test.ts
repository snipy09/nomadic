import { afterEach, describe, expect, it, vi } from 'vitest';
import { main, serviceClientFromEnv } from '../cli.js';

describe('scrape CLI', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lists sources with their tiers', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await main(['sources'])).toBe(0);
    const out = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toMatch(/greenhouse\s+tier 1/);
    expect(out).toMatch(/naukri\s+tier 3 \(opt-in\)/);
  });

  it('rejects unknown commands and unknown sources', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await main(['bogus'])).toBe(2);
    await expect(main(['run', '--sources', 'linkedin'])).rejects.toThrow(/Unknown source/);
  });

  it('requires service-role credentials to publish', () => {
    expect(() => serviceClientFromEnv({ SUPABASE_URL: 'https://x.supabase.co' })).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(() => serviceClientFromEnv({})).toThrow(/SUPABASE_URL/);
  });
});

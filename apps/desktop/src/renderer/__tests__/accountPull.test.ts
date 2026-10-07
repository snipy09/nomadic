import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_PULL_MIN_MS, pullAccountJobs, resetAccountPullThrottle } from '../features/feed/useFeed';

describe('pulling saved jobs from the account (desktop + phone)', () => {
  afterEach(() => {
    resetAccountPullThrottle();
    vi.unstubAllGlobals();
  });

  it('pulls at most once per interval', async () => {
    const syncCloudData = vi.fn().mockResolvedValue({ success: true, pulled: true });
    vi.stubGlobal('window', { api: { syncCloudData } });
    await expect(pullAccountJobs(1_000_000)).resolves.toBe(true);
    await expect(pullAccountJobs(1_000_000 + ACCOUNT_PULL_MIN_MS - 1)).resolves.toBe(false);
    await expect(pullAccountJobs(1_000_000 + ACCOUNT_PULL_MIN_MS)).resolves.toBe(true);
    expect(syncCloudData).toHaveBeenCalledTimes(2);
  });

  it('reports a failed or signed-out pull as not pulled', async () => {
    vi.stubGlobal('window', { api: { syncCloudData: vi.fn().mockResolvedValue({ success: false, error: 'No active online session to sync.' }) } });
    await expect(pullAccountJobs(5)).resolves.toBe(false);
    resetAccountPullThrottle();
    vi.stubGlobal('window', { api: { syncCloudData: vi.fn().mockRejectedValue(new Error('offline')) } });
    await expect(pullAccountJobs(10)).resolves.toBe(false);
  });
});

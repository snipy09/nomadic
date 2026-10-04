import { beforeEach, describe, expect, it, vi } from 'vitest';

// F9: reviewed applications are counted by the server (consume_apply_quota)
// right before each one is sent; a refusal stops the run and nothing further is submitted.

const { submitApplication, submitReviewed, consumeApplyQuota, getEntitlements } = vi.hoisted(() => ({
  submitApplication: vi.fn(),
  submitReviewed: vi.fn(),
  consumeApplyQuota: vi.fn(),
  getEntitlements: vi.fn(),
}));

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/nomadic-test' } }));
vi.mock('@job-automator/automation', () => ({
  AutoApplyEngine: { submitApplication, submitReviewed, prefillParallelTabs: vi.fn() },
  outcomeKey: (o: unknown) => String(o),
}));
vi.mock('../db.js', () => ({ getDb: () => ({ exec: () => [], run: vi.fn() }), persistDb: vi.fn(), saveCachedFormAnswerDb: vi.fn() }));
vi.mock('../services/app-context.js', () => ({ log: vi.fn(), getMainWindow: () => null }));
vi.mock('../services/cloud-sync.js', () => ({ logAndSyncApplication: vi.fn() }));
vi.mock('../services/profile.js', () => ({
  buildAutomationProfile: () => ({ email: 'a@b.co', firstName: 'A' }),
  getMasterProfileRow: () => ({}),
}));
vi.mock('../services/entitlements.js', () => ({ consumeApplyQuota, getEntitlements }));

import { launchAutonomous, startBatchCopilot, submitAllBatchCopilot } from '../services/apply';

const targets = [1, 2, 3].map((n) => ({ url: `https://jobs.example/${n}`, company: `Co ${n}`, title: 'Dev' }));

async function holdThree() {
  submitApplication.mockImplementation(async (_url: string, _p: unknown, _cb: unknown, opts: { onReadyForReview?: (h: unknown) => void }) => {
    opts.onReadyForReview?.({ id: Math.random() });
    return { prefilled: true, fieldsFilledCount: 3, report: undefined };
  });
  const res = await startBatchCopilot(targets);
  return res.snapshots!.map((s) => s.id);
}

beforeEach(() => {
  submitApplication.mockReset();
  submitReviewed.mockReset().mockResolvedValue({ submitted: true });
  consumeApplyQuota.mockReset();
  getEntitlements.mockReset();
});

describe('submitAllBatchCopilot quota', () => {
  it('counts each application before sending and stops at the limit', async () => {
    const ids = await holdThree();
    consumeApplyQuota
      .mockResolvedValueOnce({ ok: true, appliesRemaining: 1 })
      .mockResolvedValueOnce({ ok: true, appliesRemaining: 0 })
      .mockResolvedValueOnce({ ok: false, limitReached: true, error: 'Daily apply limit reached (3 of 3 used today).' });
    const res = await submitAllBatchCopilot({}, ids);
    expect(consumeApplyQuota).toHaveBeenCalledTimes(3);
    expect(submitReviewed).toHaveBeenCalledTimes(2);
    expect(res).toMatchObject({ success: true, applied: 2, failed: 1, limitReached: true, appliesRemaining: 0 });
    expect(res.results![2]).toMatchObject({ submitted: false, error: expect.stringMatching(/daily apply limit/i) });
  });

  it('submits nothing when the quota cannot be checked', async () => {
    const ids = await holdThree();
    consumeApplyQuota.mockResolvedValue({ ok: false, error: 'Could not reach Nomadic to check your apply limit. Nothing was submitted.' });
    const res = await submitAllBatchCopilot({}, ids);
    expect(submitReviewed).not.toHaveBeenCalled();
    expect(consumeApplyQuota).toHaveBeenCalledTimes(1);
    expect(res.applied).toBe(0);
    expect(res.results!.every((r) => !r.submitted && /nothing was submitted/i.test(r.error ?? ''))).toBe(true);
  });
});

describe('launchAutonomous gate', () => {
  const ent = (over: Record<string, unknown> = {}) => ({
    success: true,
    entitlements: { plan: 'pro', accountStatus: 'active', limits: { autonomousApply: false, appliesPerDay: 10 }, usage: { appliesToday: 0 }, ...over },
  });

  it('refuses without the autonomous entitlement and never opens a form', async () => {
    getEntitlements.mockResolvedValue(ent());
    const res = await launchAutonomous(['https://jobs.example/1']);
    expect(res).toMatchObject({ success: false, limitReached: true });
    expect(res.error).toMatch(/max plan/i);
    expect(submitApplication).not.toHaveBeenCalled();
  });

  it('refuses when entitlements are unavailable (fail closed)', async () => {
    getEntitlements.mockResolvedValue({ success: false, code: 'offline', error: 'Could not reach Nomadic.' });
    const res = await launchAutonomous(['https://jobs.example/1']);
    expect(res.success).toBe(false);
    expect(submitApplication).not.toHaveBeenCalled();
  });

  it('counts each job and stops when the quota is refused', async () => {
    getEntitlements.mockResolvedValue(ent({ plan: 'max', limits: { autonomousApply: true, appliesPerDay: null } }));
    submitApplication.mockResolvedValue({ submitted: true });
    consumeApplyQuota.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, error: 'Account suspended' });
    const res = await launchAutonomous(['https://jobs.example/1', 'https://jobs.example/2', 'https://jobs.example/3']);
    expect(submitApplication).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ applied: 1, error: 'Account suspended' });
  });
});

describe('cancel while a form is being filled', () => {
  it('aborts the running fill through its signal and stops the batch', async () => {
    const { cancelAutonomousApply } = await import('../services/apply');
    const seen: AbortSignal[] = [];
    submitApplication.mockImplementation(async (url: string, _p: unknown, _cb: unknown, opts: { signal: AbortSignal; onReadyForReview?: (h: unknown) => void }) => {
      seen.push(opts.signal);
      if (url.endsWith('/2')) {
        // The user presses Cancel while form 2 is open; the engine reports a cancelled run.
        cancelAutonomousApply();
        expect(opts.signal.aborted).toBe(true);
        return { url, cancelled: true, success: false, submitted: false, prefilled: false, captchaDetected: false };
      }
      opts.onReadyForReview?.({});
      return { url, prefilled: true, fieldsFilledCount: 2 };
    });
    const res = await startBatchCopilot(targets);
    expect(res.cancelled).toBe(true);
    expect(res.snapshots!.map((s) => s.applyUrl)).toEqual(['https://jobs.example/1']);
    expect(submitApplication).toHaveBeenCalledTimes(2);
    expect(seen.every((s) => s === seen[0])).toBe(true);
  });

  it('a new run gets a fresh, unaborted signal', async () => {
    const { cancelAutonomousApply } = await import('../services/apply');
    cancelAutonomousApply();
    let signal: AbortSignal | undefined;
    submitApplication.mockImplementation(async (_u: string, _p: unknown, _cb: unknown, opts: { signal: AbortSignal }) => { signal = opts.signal; return { prefilled: false }; });
    await startBatchCopilot([targets[0]]);
    expect(signal?.aborted).toBe(false);
  });
});

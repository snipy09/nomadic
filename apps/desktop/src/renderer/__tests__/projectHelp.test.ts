// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ask, cancel, formatWait, getThread, resetHelpForTests, retryAt, threadKey, RESET_GRACE_MS } from '../features/projects/projectHelp';

const req = { projectId: 'g.expense-tracker.react.b', stageId: 'model', question: 'Why is my list empty?' };
const key = threadKey(req.projectId, req.stageId);
const ok = { success: true, answer: 'The state starts empty.', nextSteps: ['Load the sample data'], code: null, quota: { plan: 'free', limit: 5, used: 1, remaining: 4, resetsAt: null } };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-05T12:00:00Z'));
});
afterEach(() => {
  resetHelpForTests();
  vi.useRealTimers();
  delete (window as any).api;
});

describe('project help', () => {
  it('waits until just after the reset, never less than 5 s or more than a day', () => {
    const now = Date.parse('2026-10-05T12:00:00Z');
    expect(retryAt('2026-10-05T18:30:00Z', now)).toBe(Date.parse('2026-10-05T18:30:00Z') + RESET_GRACE_MS);
    expect(retryAt('2026-10-05T11:00:00Z', now)).toBe(now + 5_000);
    expect(retryAt('2026-10-09T00:00:00Z', now)).toBe(now + 24 * 3600_000);
    expect(retryAt(null, now)).toBe(now + 3600_000);
    expect(retryAt('not a date', now)).toBe(now + 3600_000);
  });

  it('formats the wait', () => {
    expect(formatWait(30_000)).toBe('less than a minute');
    expect(formatWait(4 * 60_000)).toBe('4 min');
    expect(formatWait(3 * 3600_000 + 12 * 60_000)).toBe('3 h 12 min');
    expect(formatWait(2 * 3600_000)).toBe('2 h');
  });

  it('keeps answers per stage with the remaining allowance', async () => {
    (window as any).api = { learnProjectHelp: vi.fn().mockResolvedValue(ok) };
    await ask(req);
    const t = getThread(key);
    expect(t.state.status).toBe('idle');
    expect(t.answers).toEqual([expect.objectContaining({ question: req.question, answer: 'The state starts empty.' })]);
    expect(t.remaining).toBe(4);
    expect(getThread(threadKey(req.projectId, 'other')).answers).toEqual([]);
  });

  it('parks a question when the daily limit is hit and asks it again after the reset', async () => {
    const resetsAt = '2026-10-05T18:30:00Z';
    const learnProjectHelp = vi
      .fn()
      .mockResolvedValueOnce({ success: false, code: 'quota_exceeded', error: "You have used today's 5 project help requests.", quota: { limit: 5, used: 5, remaining: 0, resetsAt, plan: 'free' } })
      .mockResolvedValueOnce(ok);
    (window as any).api = { learnProjectHelp };
    await ask(req);
    const waiting = getThread(key).state;
    expect(waiting).toMatchObject({ status: 'waiting', retryAt: Date.parse(resetsAt) + RESET_GRACE_MS });
    expect(getThread(key).remaining).toBe(0);
    await vi.advanceTimersByTimeAsync(Date.parse(resetsAt) - Date.now());
    expect(learnProjectHelp).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(RESET_GRACE_MS + 10);
    expect(learnProjectHelp).toHaveBeenCalledTimes(2);
    expect(learnProjectHelp.mock.calls[1][0]).toEqual(req);
    expect(getThread(key).state.status).toBe('idle');
    expect(getThread(key).answers).toHaveLength(1);
  });

  it('cancelling a waiting question stops the retry', async () => {
    const learnProjectHelp = vi.fn().mockResolvedValue({ success: false, code: 'quota_exceeded', error: 'limit', quota: { resetsAt: '2026-10-05T12:10:00Z' } });
    (window as any).api = { learnProjectHelp };
    await ask(req);
    cancel(key);
    expect(getThread(key).state.status).toBe('idle');
    await vi.advanceTimersByTimeAsync(3600_000);
    expect(learnProjectHelp).toHaveBeenCalledTimes(1);
  });

  it('shows other refusals and network errors so the student can retry', async () => {
    (window as any).api = { learnProjectHelp: vi.fn().mockResolvedValue({ success: false, code: 'not_signed_in', error: 'Sign in to use project help.' }) };
    await ask(req);
    expect(getThread(key).state).toMatchObject({ status: 'error', message: 'Sign in to use project help.' });
    (window as any).api = { learnProjectHelp: vi.fn().mockRejectedValue(new Error('down')) };
    await ask(req);
    expect(getThread(key).state).toMatchObject({ status: 'error', message: expect.stringMatching(/could not reach/i) });
  });
});

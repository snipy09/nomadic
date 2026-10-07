import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The desktop's only path to a model: the ai-proxy Edge Function. No user key is read;
// the anon key is the bearer and the device session travels in the body.

const session = { userId: 'u-1' as string | null, sessionToken: 'tok' as string | null, deviceFingerprint: 'fp' as string | null };
const logs: string[] = [];

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, app: { getPath: () => '/tmp/nomadic-test' } }));
vi.mock('../services/app-context.js', () => ({ log: (m: string) => logs.push(m) }));
vi.mock('../services/session.js', () => ({
  getActiveSyncSession: () =>
    session.userId && session.sessionToken && session.deviceFingerprint
      ? { userId: session.userId, sessionToken: session.sessionToken, deviceFingerprint: session.deviceFingerprint }
      : null,
}));

import { aiErrorMessage, aiProxyUrl, callAiProxy, createProxyFormAnswerClient, requestRubricFeedback } from '../services/ai-proxy';
import { validateArgs } from '../ipc/handle';
import { aiRubricFeedbackArgs } from '../ipc/schemas';

const RUBRIC = [
  { id: 'correctness', label: 'Correctness', description: 'Right.' },
  { id: 'depth', label: 'Depth', description: 'Trade-offs.' },
];
const req = { entryId: 'roleq:x', question: 'Explain X', answer: 'X is a thing that does Y.', rubric: RUBRIC };

function reply(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

const env = { ...process.env };
beforeEach(() => {
  process.env.SUPABASE_URL = 'https://proj.supabase.co/';
  process.env.SUPABASE_ANON_KEY = 'anon-public-key';
  session.userId = 'u-1';
  session.sessionToken = 'tok';
  session.deviceFingerprint = 'fp';
  logs.length = 0;
});
afterEach(() => {
  process.env = { ...env };
});

describe('AI proxy client (main)', () => {
  it('posts to the ai-proxy function with the anon key and the device session', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(200, {
      ok: true,
      result: { items: [{ criterion_id: 'correctness', score: 3, quote: 'a thing', comment: 'Good.' }, { criterion_id: 'depth', score: 1, quote: '', comment: 'More.' }], summary: 'OK' },
      quota: { plan: 'pro', limit: 30, used: 2, remaining: 28, resets_at: '2026-10-03T18:30:00Z' },
    }));
    const res = await requestRubricFeedback(req, { fetchImpl });
    expect(res).toEqual({
      success: true,
      feedback: { summary: 'OK', items: [{ criterionId: 'correctness', score: 3, quote: 'a thing', comment: 'Good.' }, { criterionId: 'depth', score: 1, quote: '', comment: 'More.' }] },
      quota: { plan: 'pro', limit: 30, used: 2, remaining: 28, resetsAt: '2026-10-03T18:30:00Z' },
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://proj.supabase.co/functions/v1/ai-proxy');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer anon-public-key', apikey: 'anon-public-key' });
    expect(JSON.parse(init.body)).toEqual({
      kind: 'rubric_feedback', user_id: 'u-1', session_token: 'tok', device_fingerprint: 'fp',
      payload: { entry_id: 'roleq:x', question: 'Explain X', answer: req.answer, rubric: RUBRIC },
    });
    expect(logs.join('\n')).not.toContain(req.answer);
  });

  it('refuses without a session or a configured backend, without calling the network', async () => {
    const fetchImpl = vi.fn();
    session.sessionToken = null;
    expect(await requestRubricFeedback(req, { fetchImpl })).toMatchObject({ success: false, code: 'not_signed_in' });
    session.sessionToken = 'tok';
    delete process.env.SUPABASE_ANON_KEY;
    expect(aiProxyUrl()).toBeNull();
    expect(await requestRubricFeedback(req, { fetchImpl })).toMatchObject({ success: false, code: 'unavailable' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [402, 'plan_required', 'plan_required', /Pro and Max plans/],
    [429, 'quota_exceeded', 'quota_exceeded', /used today's 30 AI feedback requests/],
    [401, 'unauthorized', 'unauthorized', /session has ended/],
    [403, 'account_suspended', 'account_suspended', /suspended/],
    [503, 'ai_unavailable', 'unavailable', /not available right now/],
    [502, 'ai_failed', 'failed', /usable answer/],
  ])('maps HTTP %i %s to %s', async (status, error, code, message) => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(status, { ok: false, error, message: 'server text', quota: { limit: 30, used: 30, remaining: 0 } }));
    const res = await requestRubricFeedback(req, { fetchImpl });
    expect(res).toMatchObject({ success: false, code });
    expect(!res.success && res.error).toMatch(message);
  });

  it('treats a gateway 401 without our error body as the service being unavailable', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => { throw new Error('not json'); } });
    expect(await callAiProxy('rubric_feedback', {}, 'AI feedback', { fetchImpl })).toMatchObject({ ok: false, code: 'unavailable' });
  });

  it('times out and reports network errors', async () => {
    const hang = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_r, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
    expect(await callAiProxy('rubric_feedback', {}, 'AI feedback', { fetchImpl: hang, timeoutMs: 10 })).toMatchObject({ ok: false, code: 'network', error: expect.stringMatching(/too long/) });
    const down = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    expect(await callAiProxy('rubric_feedback', {}, 'AI feedback', { fetchImpl: down })).toMatchObject({ ok: false, code: 'network' });
  });

  it('rejects a malformed success reply', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(200, { ok: true, result: { items: [{ criterion_id: 'x', score: 9 }] } }));
    expect(await requestRubricFeedback(req, { fetchImpl })).toMatchObject({ success: false, code: 'failed' });
  });

  it('form answers: one call, only asked ids, null on any refusal', async () => {
    const formReq = {
      candidate: { name: 'A' },
      job: { title: 'SRE' },
      questions: [{ id: 'q1', question: 'Why us?', type: 'open_ended' as const, max_chars: 700 }, { id: 'q2', question: 'Cover', type: 'cover_letter' as const, max_chars: 1200 }],
    };
    const ok = vi.fn().mockResolvedValue(reply(200, { ok: true, result: { answers: { q1: 'Because.', q2: null, q3: 'extra' } } }));
    expect(await createProxyFormAnswerClient({ fetchImpl: ok }).answerForm(formReq)).toEqual({ q1: 'Because.', q2: null });
    expect(ok).toHaveBeenCalledTimes(1);
    expect(JSON.parse(ok.mock.calls[0][1].body)).toMatchObject({ kind: 'form_answers', payload: formReq });
    const refused = vi.fn().mockResolvedValue(reply(429, { ok: false, error: 'quota_exceeded' }));
    expect(await createProxyFormAnswerClient({ fetchImpl: refused }).answerForm(formReq)).toBeNull();
  });

  it('builds user-facing messages for each refusal', () => {
    expect(aiErrorMessage('plan_required', 'AI feedback')).toBe('AI feedback is part of the Pro and Max plans.');
    expect(aiErrorMessage('quota_exceeded', 'AI feedback', null)).toMatch(/allowance/);
  });
});

describe('ai-rubric-feedback IPC schema', () => {
  it('accepts a valid request and strips unknown keys', () => {
    const [parsed] = validateArgs('ai-rubric-feedback', aiRubricFeedbackArgs, [{ ...req, extra: 'x' }]);
    expect(parsed).toEqual(req);
  });

  it.each([
    ['an empty answer', { ...req, answer: '  ' }],
    ['an answer over 8000 characters', { ...req, answer: 'a'.repeat(8001) }],
    ['no rubric', { ...req, rubric: [] }],
    ['duplicate criteria', { ...req, rubric: [RUBRIC[0], RUBRIC[0]] }],
    ['a bad criterion id', { ...req, rubric: [{ ...RUBRIC[0], id: 'has space' }] }],
  ])('rejects %s', (_n, bad) => {
    expect(() => validateArgs('ai-rubric-feedback', aiRubricFeedbackArgs, [bad])).toThrow();
  });
});

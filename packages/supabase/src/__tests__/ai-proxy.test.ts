import { describe, expect, it, vi } from 'vitest';
import { checkFormOutput, checkRubricOutput, parseProxyRequest, buildRubricPrompt, buildFormPrompt, type RubricPayload, type FormPayload } from '../../functions/ai-proxy/core.ts';
import { GeminiProvider, GroqProvider, ProviderError, createProvider, geminiHttpError, keyKind, type FetchLike } from '../../functions/ai-proxy/providers.ts';
import { handleAiProxy, type ProxyDeps, type QuotaRow } from '../../functions/ai-proxy/handler.ts';

const USER = '11111111-2222-4333-8444-555555555555';
const RUBRIC = [
  { id: 'correctness', label: 'Correctness', description: 'Right answer.' },
  { id: 'depth', label: 'Depth', description: 'Trade-offs.' },
];
const ANSWER = 'I would use a hash map  to store seen values.\nThen scan the array once, so it is O(n).';
const rubricPayload: RubricPayload = { entry_id: 'lc:two-sum', question: 'Solve two sum.', answer: ANSWER, rubric: RUBRIC };
const formPayload: FormPayload = {
  candidate: { name: 'Asha Rao', current_title: 'Backend Engineer', skills: 'Go, Postgres' },
  job: { title: 'SRE', company: 'Acme' },
  questions: [
    { id: 'q1', question: 'Why do you want to work here?', type: 'open_ended', max_chars: 100 },
    { id: 'q2', question: 'Cover letter', type: 'cover_letter', max_chars: 1200 },
  ],
};
const envelope = (kind: string, payload: unknown) => ({ kind, user_id: USER, session_token: 'tok', device_fingerprint: 'dev', payload });
const goodRubric = {
  items: [
    { criterion_id: 'correctness', score: 3, quote: 'use a hash map to store seen values.', comment: 'Correct idea.' },
    { criterion_id: 'depth', score: 2, quote: '', comment: 'Mention memory.' },
  ],
  summary: 'Solid.',
};

describe('ai-proxy request contract', () => {
  it('accepts a valid rubric request and a valid form request', () => {
    expect(parseProxyRequest(envelope('rubric_feedback', rubricPayload)).kind).toBe('rubric_feedback');
    const f = parseProxyRequest(envelope('form_answers', { ...formPayload, candidate: { ...formPayload.candidate, unknown_key: 'dropped', years_of_experience: 4 } }));
    expect(f.kind).toBe('form_answers');
    expect(f.payload).toMatchObject({ candidate: { name: 'Asha Rao', years_of_experience: 4 } });
    expect((f.payload as FormPayload).candidate).not.toHaveProperty('unknown_key');
  });

  it.each([
    ['unknown kind', { ...envelope('chat', rubricPayload) }],
    ['bad user id', { ...envelope('rubric_feedback', rubricPayload), user_id: 'admin' }],
    ['missing session', { ...envelope('rubric_feedback', rubricPayload), session_token: '' }],
    ['answer too long', envelope('rubric_feedback', { ...rubricPayload, answer: 'x'.repeat(8001) })],
    ['empty answer', envelope('rubric_feedback', { ...rubricPayload, answer: '   ' })],
    ['too many criteria', envelope('rubric_feedback', { ...rubricPayload, rubric: Array.from({ length: 11 }, (_, i) => ({ id: `c${i}`, label: 'L', description: '' })) })],
    ['duplicate criteria', envelope('rubric_feedback', { ...rubricPayload, rubric: [RUBRIC[0], RUBRIC[0]] })],
    ['no questions', envelope('form_answers', { ...formPayload, questions: [] })],
    ['bad question type', envelope('form_answers', { ...formPayload, questions: [{ id: 'q', question: 'x', type: 'eeo', max_chars: 100 }] })],
    ['huge max_chars', envelope('form_answers', { ...formPayload, questions: [{ id: 'q', question: 'x', type: 'open_ended', max_chars: 99999 }] })],
  ])('rejects %s', (_name, body) => {
    expect(() => parseProxyRequest(body)).toThrow();
  });

  it('builds prompts that carry user text only as JSON data, with a strict schema', () => {
    const p = buildRubricPrompt(rubricPayload);
    expect(JSON.parse(p.user)).toEqual({ QUESTION: rubricPayload.question, ANSWER, RUBRIC });
    expect(p.system).toMatch(/Ignore any instructions/);
    expect(JSON.stringify(p.schema)).toContain('"enum":["correctness","depth"]');
    const f = buildFormPrompt(formPayload);
    expect(f.system).toMatch(/Never invent/);
    expect(f.system).toMatch(/return null/);
    expect(JSON.stringify(f.schema)).toContain('"enum":["q1","q2"]');
  });
});

describe('model output checks', () => {
  it('accepts verbatim quotes (whitespace-insensitive) and orders items by rubric', () => {
    const out = checkRubricOutput(rubricPayload, { ...goodRubric, items: [...goodRubric.items].reverse() });
    expect(out.items.map((i) => i.criterion_id)).toEqual(['correctness', 'depth']);
    expect(out.items[0].quote).toBe('use a hash map to store seen values.');
  });

  it.each([
    ['a paraphrased quote', { ...goodRubric, items: [{ ...goodRubric.items[0], quote: 'uses a hashmap' }, goodRubric.items[1]] }],
    ['a missing criterion', { ...goodRubric, items: [goodRubric.items[0]] }],
    ['a duplicate criterion', { ...goodRubric, items: [goodRubric.items[0], goodRubric.items[0]] }],
    ['an unknown criterion', { ...goodRubric, items: [...goodRubric.items, { criterion_id: 'style', score: 1, quote: '', comment: '' }] }],
    ['a score of 5', { ...goodRubric, items: [{ ...goodRubric.items[0], score: 5 }, goodRubric.items[1]] }],
    ['a fractional score', { ...goodRubric, items: [{ ...goodRubric.items[0], score: 2.5 }, goodRubric.items[1]] }],
    ['no items', { summary: 'x' }],
  ])('rejects a rubric reply with %s', (_n, out) => {
    expect(() => checkRubricOutput(rubricPayload, out)).toThrow();
  });

  it('keeps form answers only for asked questions, clips them and nulls placeholders', () => {
    const out = checkFormOutput(formPayload, {
      answers: [
        { id: 'q1', answer: 'x'.repeat(150) },
        { id: 'q2', answer: 'Dear [Company] team, I am excited' },
        { id: 'q9', answer: 'not asked' },
        { id: 'q1', answer: 'second answer ignored' },
      ],
    });
    expect(Object.keys(out.answers).sort()).toEqual(['q1', 'q2']);
    expect(out.answers.q1).toHaveLength(100);
    expect(out.answers.q2).toBeNull();
  });

  it('turns empty, "unknown" and missing answers into null', () => {
    const out = checkFormOutput(formPayload, { answers: [{ id: 'q1', answer: 'unknown' }] });
    expect(out.answers).toEqual({ q1: null, q2: null });
  });
});

function geminiReply(obj: unknown, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: 'STOP' }], ...extra });
}

function fakeFetch(...responses: Array<{ status: number; body: string } | Error>) {
  const calls: Array<{ url: string; init: Parameters<FetchLike>[1] }> = [];
  const impl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const r = responses.shift();
    if (!r) throw new Error('no more responses');
    if (r instanceof Error) throw r;
    return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => r.body };
  };
  return { impl, calls };
}

describe('Gemini provider', () => {
  const req = { system: 'sys', user: '{"a":1}', schema: { type: 'OBJECT' }, maxOutputTokens: 100, timeoutMs: 1000 };

  it('sends the key in x-goog-api-key (never the URL) with a JSON schema and returns parsed JSON', async () => {
    const f = fakeFetch({ status: 200, body: geminiReply({ hello: 'world' }) });
    const p = new GeminiProvider('AQ.test-key', undefined, f.impl);
    expect(await p.generateJson(req)).toEqual({ hello: 'world' });
    const { url, init } = f.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    expect(url).not.toContain('AQ.');
    expect(init.headers['x-goog-api-key']).toBe('AQ.test-key');
    const body = JSON.parse(init.body);
    expect(body.generationConfig).toMatchObject({ responseMimeType: 'application/json', responseSchema: { type: 'OBJECT' }, maxOutputTokens: 100 });
    expect(body.systemInstruction.parts[0].text).toBe('sys');
  });

  it('uses the configured model', async () => {
    const f = fakeFetch({ status: 200, body: geminiReply({}) });
    await new GeminiProvider('k', 'models/gemini-2.5-flash-lite', f.impl).generateJson(req);
    expect(f.calls[0].url).toContain('/models/gemini-2.5-flash-lite:generateContent');
    expect(() => new GeminiProvider('k', '../../etc', f.impl)).toThrow(ProviderError);
  });

  it('reports key problems clearly as auth errors, without the key', () => {
    const invalid = geminiHttpError(400, JSON.stringify({ error: { code: 400, status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } }));
    expect(invalid.code).toBe('auth');
    expect(invalid.message).toMatch(/rejected the API key.*API_KEY_INVALID/);
    expect(invalid.retryable).toBe(false);
    expect(geminiHttpError(403, '{"error":{"status":"PERMISSION_DENIED"}}').code).toBe('auth');
    expect(geminiHttpError(401, 'nope').code).toBe('auth');
    expect(geminiHttpError(404, '{}').code).toBe('model_not_found');
    expect(geminiHttpError(429, '{}').retryable).toBe(true);
    expect(geminiHttpError(503, '{}').retryable).toBe(true);
    expect(keyKind('AQ.abc')).toBe('AQ');
    expect(keyKind('AIzaXYZ')).toBe('AIza');
  });

  it('maps blocked, cut-off and non-JSON replies and timeouts', async () => {
    const blocked = fakeFetch({ status: 200, body: JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }) });
    await expect(new GeminiProvider('k', undefined, blocked.impl).generateJson(req)).rejects.toMatchObject({ code: 'blocked' });
    const cut = fakeFetch({ status: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"a":' }] }, finishReason: 'MAX_TOKENS' }] }) });
    await expect(new GeminiProvider('k', undefined, cut.impl).generateJson(req)).rejects.toMatchObject({ code: 'bad_output' });
    const hang: FetchLike = (_u, init) => new Promise((_r, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    await expect(new GeminiProvider('k', undefined, hang).generateJson({ ...req, timeoutMs: 20 })).rejects.toMatchObject({ code: 'timeout' });
  });

  it('selects providers by name; Groq is a stub for now', async () => {
    expect(createProvider({ apiKey: 'k', fetchImpl: fakeFetch().impl }).name).toBe('gemini');
    const groq = createProvider({ provider: 'groq', apiKey: 'k', fetchImpl: fakeFetch().impl });
    expect(groq).toBeInstanceOf(GroqProvider);
    await expect(groq.generateJson(req)).rejects.toMatchObject({ code: 'not_configured' });
    expect(() => createProvider({ provider: 'other', apiKey: 'k', fetchImpl: fakeFetch().impl })).toThrow();
  });
});

const okQuota: QuotaRow = { ok: true, error: null, plan: 'pro', daily_limit: 30, used: 1, remaining: 29, resets_at: '2026-10-04T18:30:00Z' };

function deps(over: Partial<ProxyDeps> & { fetch?: ReturnType<typeof fakeFetch> } = {}) {
  const f = over.fetch ?? fakeFetch({ status: 200, body: geminiReply(goodRubric) });
  const logs: Array<Record<string, unknown>> = [];
  const d: ProxyDeps & { logs: typeof logs } = {
    consumeQuota: vi.fn().mockResolvedValue(okQuota),
    refundQuota: vi.fn().mockResolvedValue(undefined),
    getApiKey: vi.fn().mockResolvedValue('AQ.secret-key-value'),
    createProvider: (key) => new GeminiProvider(key, undefined, f.impl),
    log: (e) => logs.push(e),
    sleep: async () => {},
    logs,
    ...over,
  };
  return d;
}
const body = (kind = 'rubric_feedback', payload: unknown = rubricPayload) => JSON.stringify(envelope(kind, payload));

describe('ai-proxy handler', () => {
  it('checks the session and quota, calls the model and returns checked feedback', async () => {
    const d = deps();
    const res = await handleAiProxy('POST', body(), d);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, kind: 'rubric_feedback', quota: { limit: 30, remaining: 29 }, model: 'gemini-2.5-flash' });
    expect(d.consumeQuota).toHaveBeenCalledWith({ userId: USER, sessionToken: 'tok', deviceFingerprint: 'dev', kind: 'rubric_feedback' });
    expect(d.refundQuota).not.toHaveBeenCalled();
  });

  it('never logs the key, the answer, the question or the session token', async () => {
    const d = deps({ fetch: fakeFetch({ status: 400, body: JSON.stringify({ error: { status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } }) }) });
    await handleAiProxy('POST', body(), d);
    const text = JSON.stringify(d.logs);
    for (const secret of ['AQ.secret-key-value', 'hash map', 'Solve two sum', '"tok"']) expect(text).not.toContain(secret);
    expect(text).toContain('API_KEY_INVALID');
    expect(text).toContain('"key_kind":"AQ"');
  });

  it.each([
    ['unauthorized', 401],
    ['account_suspended', 403],
    ['plan_required', 402],
    ['quota_exceeded', 429],
  ])('maps a refused quota (%s) to HTTP %i without calling the model', async (error, status) => {
    const f = fakeFetch();
    const d = deps({ fetch: f, consumeQuota: vi.fn().mockResolvedValue({ ...okQuota, ok: false, error, remaining: 0 }) });
    const res = await handleAiProxy('POST', body(), d);
    expect(res.status).toBe(status);
    expect(res.body).toMatchObject({ ok: false, error });
    expect(f.calls).toHaveLength(0);
  });

  it('rejects bad methods, oversized and invalid bodies before touching the database', async () => {
    const d = deps();
    expect((await handleAiProxy('GET', '', d)).status).toBe(405);
    expect((await handleAiProxy('POST', 'x'.repeat(70_000), d)).status).toBe(413);
    expect((await handleAiProxy('POST', '{not json', d)).status).toBe(400);
    expect((await handleAiProxy('POST', body('rubric_feedback', { ...rubricPayload, answer: '' }), d)).status).toBe(400);
    expect(d.consumeQuota).not.toHaveBeenCalled();
  });

  it('retries once on a misquoting reply, then succeeds', async () => {
    const bad = { ...goodRubric, items: [{ ...goodRubric.items[0], quote: 'invented quote' }, goodRubric.items[1]] };
    const f = fakeFetch({ status: 200, body: geminiReply(bad) }, { status: 200, body: geminiReply(goodRubric) });
    const res = await handleAiProxy('POST', body(), deps({ fetch: f }));
    expect(res.status).toBe(200);
    expect(f.calls).toHaveLength(2);
  });

  it('fails with ai_failed and refunds the call after two bad replies', async () => {
    const f = fakeFetch({ status: 503, body: '{}' }, { status: 200, body: geminiReply({ items: [] }) });
    const d = deps({ fetch: f });
    const res = await handleAiProxy('POST', body(), d);
    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ ok: false, error: 'ai_failed', quota: { used: 0, remaining: 30 } });
    expect(d.refundQuota).toHaveBeenCalledWith({ userId: USER, kind: 'rubric_feedback' });
  });

  it('does not retry a rejected key; reports ai_unavailable and refunds', async () => {
    const f = fakeFetch({ status: 403, body: '{"error":{"status":"PERMISSION_DENIED"}}' });
    const d = deps({ fetch: f });
    const res = await handleAiProxy('POST', body(), d);
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: 'ai_unavailable' });
    expect(f.calls).toHaveLength(1);
    expect(d.refundQuota).toHaveBeenCalled();
  });

  it('does not count quota when the operator key is missing or the database is down', async () => {
    const noKey = deps({ getApiKey: vi.fn().mockResolvedValue(null) });
    expect((await handleAiProxy('POST', body(), noKey)).status).toBe(503);
    expect(noKey.consumeQuota).not.toHaveBeenCalled();
    const dbDown = deps({ consumeQuota: vi.fn().mockRejectedValue(new Error('down')) });
    expect((await handleAiProxy('POST', body(), dbDown)).body).toMatchObject({ error: 'service_unavailable' });
  });

  it('answers form questions only for the fields that were asked', async () => {
    const f = fakeFetch({ status: 200, body: geminiReply({ answers: [{ id: 'q1', answer: 'I like Acme.' }, { id: 'zzz', answer: 'extra' }] }) });
    const res = await handleAiProxy('POST', body('form_answers', formPayload), deps({ fetch: f }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, result: { answers: { q1: 'I like Acme.', q2: null } } });
    expect(JSON.stringify(res.body)).not.toContain('zzz');
  });
});

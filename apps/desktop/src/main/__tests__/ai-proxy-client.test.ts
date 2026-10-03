import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const { session, logUserActivityDb } = vi.hoisted(() => ({
  session: { userId: null as string | null, sessionToken: null as string | null, deviceFingerprint: null as string | null },
  logUserActivityDb: vi.fn(),
}));

vi.mock('../services/app-context.js', () => ({ log: vi.fn() }));
vi.mock('../services/session.js', () => ({ session }));
vi.mock('../db.js', () => ({
  getLearnerProgressDb: vi.fn(), saveLearnerProgressDb: vi.fn(), getCuratedLearningResourcesDb: vi.fn(() => []), logUserActivityDb,
}));

import { aiProxy, formAnswersOutput, practiceFeedbackOutput, roadmapExplanationOutput } from '../services/ai-proxy';
import { proxyFormAnswerLlm, toFormAnswersRequest } from '../services/form-answer-llm';
import { evaluateInterviewAnswer } from '../services/learner';
import * as server from '../../../../../packages/supabase/functions/ai-proxy/tasks';

const USER_ID = '66666666-6666-6666-6666-666666666666';
const fetchMock = vi.fn();
const feedback = { score: 64, review: 'Clear situation, weak result.', strengths: ['Clear situation'], improvements: ['State the outcome'] };

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValue({ ok: status < 300, status, json: async () => body });
}

beforeEach(() => {
  fetchMock.mockReset();
  logUserActivityDb.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  process.env.SUPABASE_URL = 'https://proj.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
  Object.assign(session, { userId: USER_ID, sessionToken: 'tok', deviceFingerprint: 'fp' });
});

afterEach(() => vi.unstubAllGlobals());

describe('aiProxy client', () => {
  it('sends the task, input and device session to ai-proxy', async () => {
    respond(200, { ok: true, task: 'practice_feedback', data: feedback, used: 1, limit: 50 });
    const res = await aiProxy.practiceFeedback({ question: 'Tell me about a conflict', answer: 'I...' });
    expect(res).toEqual({ ok: true, data: feedback, used: 1, limit: 50 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://proj.supabase.co/functions/v1/ai-proxy');
    expect(JSON.parse(init.body)).toEqual({
      task: 'practice_feedback',
      input: { question: 'Tell me about a conflict', answer: 'I...' },
      session: { user_id: USER_ID, session_token: 'tok', device_fingerprint: 'fp' },
    });
    expect(init.headers.apikey).toBe('anon-key');
  });

  it('needs a session and never calls out without one', async () => {
    Object.assign(session, { userId: null, sessionToken: null, deviceFingerprint: null });
    expect(await aiProxy.practiceFeedback({ question: 'Q', answer: 'A' })).toEqual({
      ok: false, code: 'no_session', error: 'Sign in again to use AI features.',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes quota and plan refusals through with their code', async () => {
    respond(429, { ok: false, code: 'quota_exceeded', reason: "You have used today's AI limit for this feature." });
    expect(await aiProxy.practiceFeedback({ question: 'Q', answer: 'A' })).toEqual({
      ok: false, code: 'quota_exceeded', error: "You have used today's AI limit for this feature.",
    });
    respond(500, { ok: false, code: 'weird', reason: 'x' });
    expect((await aiProxy.practiceFeedback({ question: 'Q', answer: 'A' })) as { code?: string }).toMatchObject({ code: 'server_error' });
  });

  it('re-validates the output so a bad response never reaches the UI', async () => {
    respond(200, { ok: true, data: { ...feedback, score: 300 } });
    expect(await aiProxy.practiceFeedback({ question: 'Q', answer: 'A' })).toMatchObject({ ok: false, code: 'invalid_output' });
  });

  it('reports network failures', async () => {
    fetchMock.mockRejectedValue(new Error('ENOTFOUND'));
    expect(await aiProxy.explainRoadmap({ role: 'Data Analyst', milestones: [{ title: 'SQL' }] })).toMatchObject({ ok: false, code: 'network' });
  });
});

describe('desktop and server output schemas agree', () => {
  const pairs = [
    [formAnswersOutput, server.formAnswersOutput],
    [practiceFeedbackOutput, server.practiceFeedbackOutput],
    [roadmapExplanationOutput, server.roadmapExplanationOutput],
  ] as const;
  const fixtures: unknown[] = [
    { answers: { q1: 'Yes', q2: null } },
    { answers: { q1: 3 } },
    feedback,
    { ...feedback, score: 101 },
    { ...feedback, score: 10.5 },
    { ...feedback, improvements: [] },
    { ...feedback, strengths: ['a', 'b', 'c', 'd', 'e'] },
    { summary: 'S', milestones: [{ index: 0, why: 'W' }] },
    { summary: '', milestones: [] },
    { summary: 'S', milestones: [{ index: -1, why: 'W' }] },
    null,
  ];

  it('accept and reject the same fixtures', () => {
    for (const [desktop, srv] of pairs) {
      for (const f of fixtures) {
        expect(desktop.safeParse(f).success).toBe(srv.safeParse(f).success);
      }
    }
  });
});

describe('form answers adapter', () => {
  const userMessage = JSON.stringify({
    CANDIDATE: { name: 'Asha Rao', yearsOfExperience: 1, skills: 'React', summary: undefined },
    JOB: { title: 'Frontend Intern', company: 'Acme', description: 'Build UI' },
    QUESTIONS: [
      { id: 'f1', question: 'Why Acme?', type: 'open_ended', maxChars: 700 },
      { id: 'f2', question: 'Cover letter', type: 'cover_letter', maxChars: 1200 },
      { id: '', question: 'dropped' },
    ],
  });

  it('forwards only the data, in the server input shape', () => {
    const req = toFormAnswersRequest(userMessage);
    expect(req).toEqual({
      candidate: { name: 'Asha Rao', yearsOfExperience: '1', skills: 'React' },
      job: { title: 'Frontend Intern', company: 'Acme', description: 'Build UI' },
      questions: [
        { id: 'f1', question: 'Why Acme?', type: 'open_ended', maxChars: 700 },
        { id: 'f2', question: 'Cover letter', type: 'cover_letter', maxChars: 1200 },
      ],
    });
    expect(server.TASK_INPUTS.form_answers.safeParse(req).success).toBe(true);
    expect(toFormAnswersRequest('not json')).toBe(null);
    expect(toFormAnswersRequest(JSON.stringify({ QUESTIONS: [] }))).toBe(null);
  });

  it('returns the proxy answers, or null so the user answers the fields', async () => {
    respond(200, { ok: true, data: { answers: { f1: 'I like Acme', f2: null } } });
    expect(await proxyFormAnswerLlm.completeJson('ignored system prompt', userMessage)).toEqual({ answers: { f1: 'I like Acme', f2: null } });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).task).toBe('form_answers');
    expect(fetchMock.mock.calls[0][1].body).not.toContain('ignored system prompt');

    respond(429, { ok: false, code: 'quota_exceeded', reason: 'limit' });
    expect(await proxyFormAnswerLlm.completeJson('s', userMessage)).toBe(null);
  });
});

describe('practice feedback', () => {
  it('returns the proxy feedback unchanged', async () => {
    respond(200, { ok: true, data: feedback });
    expect(await evaluateInterviewAnswer({ questionId: 'q', questionTitle: 'Conflict', answerText: 'I did X', category: 'Behavioral' })).toEqual(feedback);
    expect(logUserActivityDb).toHaveBeenCalledTimes(1);
  });

  it('fails with the reason instead of inventing a score', async () => {
    respond(429, { ok: false, code: 'not_in_plan', reason: 'This AI feature is not included in your plan.' });
    await expect(evaluateInterviewAnswer({ questionId: 'q', questionTitle: 'Q', answerText: 'A' })).rejects.toThrow('not included in your plan');
    expect(logUserActivityDb).not.toHaveBeenCalled();
  });
});

describe('no direct LLM calls in the desktop app', () => {
  const root = path.resolve(__dirname, '..', '..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== '__tests__') walk(p); } else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
    }
  };
  walk(root);

  it('never references provider endpoints or the direct-call helpers', () => {
    const banned = /generativelanguage\.googleapis\.com|api\.groq\.com|api\.openai\.com|callGeminiFlash|callGeminiVision|generateStructuredAIContent|answerCustomQuestionWithGroq|GroqClient/;
    const offenders = files.filter((f) => banned.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(root, f));
    expect(offenders).toEqual([]);
  });
});

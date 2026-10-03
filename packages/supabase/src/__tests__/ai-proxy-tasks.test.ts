import { describe, it, expect } from 'vitest';
import {
  TASK_INPUTS, buildPrompt, containsUrl, geminiText, proxyRequest, validateOutput,
} from '../../functions/ai-proxy/tasks';

const formInput = TASK_INPUTS.form_answers.parse({
  candidate: { name: 'Asha Rao', skills: 'React, SQL' },
  job: { title: 'Frontend Intern', company: 'Acme' },
  questions: [
    { id: 'q1', question: 'Why this role?', type: 'open_ended', maxChars: 300 },
    { id: 'q2', question: 'Portfolio?', type: 'open_ended', maxChars: 300 },
    { id: 'q3', question: 'Cover letter', type: 'cover_letter', maxChars: 60 },
  ],
});

describe('request validation', () => {
  it('accepts only allow-listed tasks with a full session', () => {
    const session = { user_id: '55555555-5555-5555-5555-555555555555', session_token: 't', device_fingerprint: 'f' };
    expect(proxyRequest.safeParse({ task: 'practice_feedback', input: {}, session }).success).toBe(true);
    expect(proxyRequest.safeParse({ task: 'chat', input: {}, session }).success).toBe(false);
    expect(proxyRequest.safeParse({ task: 'practice_feedback', input: {}, session: { ...session, user_id: 'x' } }).success).toBe(false);
    expect(proxyRequest.safeParse({ task: 'practice_feedback', input: {} }).success).toBe(false);
  });

  it('bounds task inputs', () => {
    expect(TASK_INPUTS.practice_feedback.safeParse({ question: 'Q', answer: 'A' }).success).toBe(true);
    expect(TASK_INPUTS.practice_feedback.safeParse({ question: 'Q', answer: '' }).success).toBe(false);
    expect(TASK_INPUTS.practice_feedback.safeParse({ question: 'Q', answer: 'x'.repeat(8001) }).success).toBe(false);
    const tooMany = Array.from({ length: 21 }, (_, i) => ({ id: `q${i}`, question: 'Q', type: 'open_ended', maxChars: 100 }));
    expect(TASK_INPUTS.form_answers.safeParse({ candidate: {}, job: {}, questions: tooMany }).success).toBe(false);
    expect(TASK_INPUTS.roadmap_explanation.safeParse({ role: 'Data Analyst', milestones: [] }).success).toBe(false);
  });
});

describe('prompts', () => {
  it('are owned by the server and forbid links', () => {
    for (const task of ['form_answers', 'practice_feedback', 'roadmap_explanation'] as const) {
      const { system, user } = buildPrompt(task, { a: 1 });
      expect(system).toContain('Never include URLs');
      expect(user).toBe('{"a":1}');
    }
    expect(buildPrompt('form_answers', {}).system).toContain('Never invent');
    expect(buildPrompt('roadmap_explanation', {}).system).toContain('do not recommend resources');
  });
});

describe('containsUrl', () => {
  it('flags links and bare domains', () => {
    for (const s of ['see https://x.dev', 'www.example.org', 'visit leetcode.com/problems', 'mail a@b.com', 'ftp://host']) {
      expect(containsUrl(s)).toBe(true);
    }
  });

  it('does not flag ordinary technical prose', () => {
    for (const s of ['I used Node.js and Vue.js', 'Built an ASP.NET API', 'Socket.IO for realtime', 'e.g. a REST API', 'Version 2.0 shipped']) {
      expect(containsUrl(s)).toBe(false);
    }
  });
});

describe('validateOutput', () => {
  it('keeps form answers per question and drops links, unknown ids and over-long answers to null', () => {
    const raw = JSON.stringify({ answers: { q1: ' I like React. ', q2: 'See github.com/asha', q3: 'x'.repeat(61), extra: 'hi' } });
    expect(validateOutput('form_answers', formInput, raw)).toEqual({
      ok: true, data: { answers: { q1: 'I like React.', q2: null, q3: null } },
    });
  });

  it('rejects non-JSON and wrong shapes', () => {
    expect(validateOutput('form_answers', formInput, 'Sure! Here you go')).toEqual({ ok: false, error: 'Model output was not JSON.' });
    expect(validateOutput('form_answers', formInput, '{"answers": 3}')).toEqual({ ok: false, error: 'Model output did not match the schema.' });
  });

  it('validates practice feedback, rejecting out-of-range scores and links', () => {
    const good = { score: 72, review: 'Clear STAR structure.', strengths: ['Clear action'], improvements: ['Quantify the result'] };
    expect(validateOutput('practice_feedback', {}, JSON.stringify(good))).toEqual({ ok: true, data: good });
    expect(validateOutput('practice_feedback', {}, JSON.stringify({ ...good, score: 140 })).ok).toBe(false);
    expect(validateOutput('practice_feedback', {}, JSON.stringify({ ...good, score: 70.5 })).ok).toBe(false);
    expect(validateOutput('practice_feedback', {}, JSON.stringify({ ...good, improvements: [] })).ok).toBe(false);
    expect(validateOutput('practice_feedback', {}, JSON.stringify({ ...good, improvements: ['Read https://star.io'] }))).toEqual({
      ok: false, error: 'Model output contained a link.',
    });
  });

  it('validates roadmap explanations against the given milestones', () => {
    const input = TASK_INPUTS.roadmap_explanation.parse({ role: 'Data Analyst', milestones: [{ title: 'SQL' }, { title: 'Excel' }] });
    const good = { summary: 'SQL first, then Excel.', milestones: [{ index: 0, why: 'Queries.' }, { index: 1, why: 'Reporting.' }] };
    expect(validateOutput('roadmap_explanation', input, JSON.stringify(good))).toEqual({ ok: true, data: good });
    expect(validateOutput('roadmap_explanation', input, JSON.stringify({ ...good, milestones: [{ index: 5, why: 'x' }] }))).toEqual({
      ok: false, error: 'Model output referred to a milestone that does not exist.',
    });
    expect(validateOutput('roadmap_explanation', input, JSON.stringify({ ...good, summary: 'Try kaggle.com' })).ok).toBe(false);
  });
});

describe('geminiText', () => {
  it('joins text parts and skips thoughts', () => {
    const res = { candidates: [{ content: { parts: [{ text: 'thinking', thought: true }, { text: '{"a":' }, { text: '1}' }] } }] };
    expect(geminiText(res)).toBe('{"a":1}');
    expect(geminiText({})).toBe('');
    expect(geminiText(null)).toBe('');
  });
});

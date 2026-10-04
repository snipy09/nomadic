import fs from 'fs';
import os from 'os';
import { describe, it, expect, vi } from 'vitest';
import { MemoryAnswerCache, ProfileAnswerer, questionFingerprint, splitPhone } from '../answerer.js';
import { RuleClassifier } from '../classifier.js';
import type { Answer, FormField } from '../contracts.js';
import type { FormAnswerClient, FormAnswerRequest, LlmClient } from '../llm.js';
import { pickOption } from '../options.js';
import { DEFAULT_POLICY } from '../policy.js';
import { sampleProfile } from './helpers.js';

const mk = (label: string, extra: Partial<FormField> = {}): FormField => ({
  id: label, kind: 'text', label, required: false, selector: '#x', frameIndex: 0, visible: true, ...extra,
});
const yn = [{ label: 'Yes', value: 'Yes' }, { label: 'No', value: 'No' }];

async function answerAll(fields: FormField[], profile: any = sampleProfile(), opts: ConstructorParameters<typeof ProfileAnswerer>[0] = { llm: null }) {
  const classes = new RuleClassifier().classify(fields);
  return new ProfileAnswerer(opts).answer(fields, classes, profile);
}
const byId = (answers: Answer[], id: string) => answers.find((a) => a.fieldId === id)!;
const val = (a: Answer) => (a.status === 'answered' ? a.value : a.status);

describe('ProfileAnswerer', () => {
  it('answers profile facts from the profile only', async () => {
    const { answers, llmCalls } = await answerAll([mk('First Name'), mk('Email'), mk('Years of experience', { kind: 'select' }), mk('Current company')]);
    expect(val(byId(answers, 'First Name'))).toBe('Jordan');
    expect(val(byId(answers, 'Email'))).toBe('jordan@example.com');
    expect(byId(answers, 'Years of experience')).toMatchObject({ value: '5', numeric: true });
    // not in profile + optional -> skip, never invented
    expect(byId(answers, 'Current company').status).toBe('skip');
    expect(llmCalls).toBe(0);
  });

  it('reuses a common answer wherever a form asks the same open question in other words', async () => {
    const profile = { ...sampleProfile(), commonAnswers: { about_you: 'Final-year CSE student who builds web apps.' } };
    const { answers, llmCalls } = await answerAll([
      mk('Tell us a little about yourself *', { kind: 'textarea', required: true }),
      mk('Please introduce yourself', { kind: 'textarea' }),
      mk('About you', { kind: 'select', options: yn }),
    ], profile);
    expect(answers[0]).toMatchObject({ status: 'answered', value: 'Final-year CSE student who builds web apps.', source: 'custom' });
    expect(val(answers[1])).toBe('Final-year CSE student who builds web apps.');
    expect(answers[2].source).not.toBe('custom');
    expect(llmCalls).toBe(0);
  });

  it('uses the first name when a form asks for a preferred name the profile does not have', async () => {
    const { answers } = await answerAll([mk('What name would you prefer to be called?')], { ...sampleProfile(), preferredName: undefined });
    expect(answers[0]).toMatchObject({ status: 'answered', value: 'Jordan', source: 'derived' });
    const own = await answerAll([mk('Preferred name')], { ...sampleProfile(), preferredName: 'Jo' });
    expect(own.answers[0]).toMatchObject({ value: 'Jo', source: 'profile' });
  });

  it('never puts cover letter text into a cover letter upload slot', async () => {
    const field = mk('Cover Letter', { kind: 'file' });
    const { answers } = await answerAll([field], { ...sampleProfile(), coverLetter: 'Dear team' });
    expect(answers[0].status).toBe('skip');
    const req = await answerAll([{ ...field, required: true }], { ...sampleProfile(), coverLetter: 'Dear team' });
    expect(req.answers[0].status).toBe('needs_user');
  });

  it('returns needs_user for required questions the profile cannot answer', async () => {
    const { answers } = await answerAll([mk('Have you worked here before?', { kind: 'radio', options: yn, required: true }), mk('Who referred you?', { required: true })]);
    for (const a of answers) expect(a.status).toBe('needs_user');
  });

  it('prefers explicit custom / cached answers', async () => {
    const p = { ...sampleProfile(), customAnswers: { 'Who referred you?': 'Sam Lee' }, cachedAnswers: { 'how did you hear about us?': 'LinkedIn' } };
    const { answers } = await answerAll([mk('Who referred you?'), mk('How did you hear about this job?', { kind: 'select' })], p);
    expect(byId(answers, 'Who referred you?')).toMatchObject({ value: 'Sam Lee', source: 'custom' });
    expect(byId(answers, 'How did you hear about this job?')).toMatchObject({ value: 'LinkedIn' });
  });

  it('reuses an answer saved under a label regardless of case, punctuation and the required marker', async () => {
    const p = { ...sampleProfile(), cachedAnswers: { 'current company': 'Acme Labs', 'total years of experience': '3' } };
    const { answers } = await answerAll([mk('Current company*'), mk('Total Years of Experience: ✱')], p);
    expect(byId(answers, 'Current company*')).toMatchObject({ status: 'answered', value: 'Acme Labs', source: 'cache' });
    expect(byId(answers, 'Total Years of Experience: ✱')).toMatchObject({ value: '3', source: 'cache' });
  });

  it('prefers the answer saved for the exact question over a label match', async () => {
    const field = mk('Notice period', { kind: 'select', options: [{ label: '30 days' }, { label: '60 days' }] });
    const fp = questionFingerprint(field);
    const p = { ...sampleProfile(), cachedAnswers: { 'notice period': 'Immediately', [fp]: '30 days' } };
    const { answers } = await answerAll([field], p);
    expect(byId(answers, 'Notice period')).toMatchObject({ value: '30 days', source: 'cache' });
  });

  it('derives yes/no eligibility answers from typed profile fields', async () => {
    const { answers } = await answerAll([
      mk('Will you require visa sponsorship?', { kind: 'radio', options: yn }),
      mk('Are you legally authorized to work in the US?', { kind: 'radio', options: yn }),
      mk('Are you willing to relocate?', { kind: 'radio', options: yn }),
    ]);
    expect(val(byId(answers, 'Will you require visa sponsorship?'))).toBe('No');
    expect(val(byId(answers, 'Are you legally authorized to work in the US?'))).toBe('Yes');
    expect(val(byId(answers, 'Are you willing to relocate?'))).toBe('No');
  });

  it('answers legal / consent / EEO from policy, never the model', async () => {
    const llm: LlmClient = { completeJson: vi.fn(async () => ({ answers: {} })) };
    const fields = [
      mk('Arbitration Agreement', { kind: 'radio', options: [{ label: 'I acknowledge the arbitration agreement', value: 'a' }] }),
      mk('Certification', { kind: 'checkbox', options: [{ label: 'I certify the information is true and correct', value: 'on' }] }),
      mk('Privacy', { kind: 'checkbox', options: [{ label: 'I agree to the privacy notice', value: 'on' }] }),
      mk('Talent community', { kind: 'checkbox', options: [{ label: 'Send me job alerts', value: 'on' }] }),
      mk('Veteran Status', { kind: 'select' }),
    ];
    const { answers, llmCalls } = await answerAll(fields, sampleProfile(), { llm });
    expect(llmCalls).toBe(0);
    expect(llm.completeJson).not.toHaveBeenCalled();
    expect(byId(answers, 'Arbitration Agreement')).toMatchObject({ source: 'policy' });
    expect(val(byId(answers, 'Certification'))).toBe('true');
    expect(val(byId(answers, 'Privacy'))).toBe('true');
    expect(val(byId(answers, 'Talent community'))).toBe('false');
    const vet = byId(answers, 'Veteran Status') as Extract<Answer, { status: 'answered' }>;
    expect(pickOption(['I am a veteran', 'I am not a protected veteran', "I don't wish to answer"], vet)).toBe(2);
  });

  it('respects policy overrides and explicit EEO answers in the profile', async () => {
    const { answers } = await answerAll(
      [mk('Arbitration Agreement', { kind: 'checkbox', options: [{ label: 'I agree to arbitration', value: 'on' }], required: true }), mk('Gender', { kind: 'select' })],
      { ...sampleProfile(), eeo: { gender: 'Female' } },
      { llm: null, policy: { ...DEFAULT_POLICY, arbitration: 'needs_user' } },
    );
    expect(byId(answers, 'Arbitration Agreement').status).toBe('needs_user');
    expect(byId(answers, 'Gender')).toMatchObject({ value: 'Female', source: 'profile' });
  });

  it('batches all open-ended questions into exactly one LLM call and caches results', async () => {
    const llm: LlmClient = {
      completeJson: vi.fn(async (_s: string, user: string) => {
        const qs = JSON.parse(user).QUESTIONS as Array<{ id: string }>;
        return { answers: Object.fromEntries(qs.map((q, i) => [q.id, i === 2 ? null : `answer ${q.id}`])) };
      }),
    };
    const cache = new MemoryAnswerCache();
    const onAnswerResolved = vi.fn();
    const fields = [
      mk('Why do you want to work here?', { kind: 'textarea', required: true }),
      mk('Describe a hard bug you fixed.', { kind: 'textarea' }),
      mk('Anything about your hobbies?', { kind: 'textarea', required: true }),
      mk('Cover letter', { kind: 'textarea' }),
    ];
    const { answers, llmCalls } = await answerAll(fields, { ...sampleProfile(), onAnswerResolved }, { llm, cache });
    expect(llmCalls).toBe(1);
    expect(llm.completeJson).toHaveBeenCalledTimes(1);
    expect(byId(answers, 'Why do you want to work here?')).toMatchObject({ status: 'answered', source: 'llm' });
    expect(byId(answers, 'Anything about your hobbies?').status).toBe('needs_user');
    expect(onAnswerResolved).toHaveBeenCalledWith('Why do you want to work here?', 'answer Why do you want to work here?');
    expect(cache.get(questionFingerprint(fields[0]))).toBe('answer Why do you want to work here?');
    // the system prompt forbids invented facts and the payload carries no keys
    const [system, user] = (llm.completeJson as any).mock.calls[0];
    expect(system).toMatch(/Never invent/);
    expect(user).not.toMatch(/groq|gemini/i);
  });

  it('sends one structured request (facts + questions, no prompt) to a FormAnswerClient and never fills unasked or missing answers', async () => {
    const answerForm = vi.fn(async (req: FormAnswerRequest) => ({ [req.questions[0].id]: 'Because of the team.', [req.questions[1].id]: null, extra: 'not asked' }));
    const llm: FormAnswerClient = { answerForm };
    const fields = [
      mk('Why do you want to work here?', { kind: 'textarea', required: true }),
      mk('Anything about your hobbies?', { kind: 'textarea', required: true }),
      mk('Describe a hard bug you fixed.', { kind: 'textarea' }),
    ];
    const profile = { ...sampleProfile(), groqApiKey: 'gsk_should_not_be_sent' };
    const { answers, llmCalls } = await answerAll(fields, profile, { llm });
    expect(llmCalls).toBe(1);
    expect(answerForm).toHaveBeenCalledTimes(1);
    const req = answerForm.mock.calls[0][0];
    expect(req.questions.map((q) => q.id)).toEqual(fields.map((f) => f.id));
    expect(req.questions[0]).toMatchObject({ type: 'open_ended', max_chars: 700 });
    expect(JSON.stringify(req)).not.toMatch(/gsk_|groq|gemini|email|phone/i);
    expect(byId(answers, 'Why do you want to work here?')).toMatchObject({ status: 'answered', source: 'llm', value: 'Because of the team.' });
    expect(byId(answers, 'Anything about your hobbies?').status).toBe('needs_user');
    expect(byId(answers, 'Describe a hard bug you fixed.').status).toBe('skip');
    expect(answers.some((a) => a.fieldId === 'extra')).toBe(false);
  });

  it('treats a failed FormAnswerClient call as unknown (needs_user), never a made-up answer', async () => {
    const llm: FormAnswerClient = { answerForm: vi.fn(async () => null) };
    const { answers } = await answerAll([mk('Why us?', { kind: 'textarea', required: true })], sampleProfile(), { llm });
    expect(answers[0].status).toBe('needs_user');
    const throwing: FormAnswerClient = { answerForm: vi.fn(async () => { throw new Error('offline'); }) };
    expect((await answerAll([mk('Why us?', { kind: 'textarea', required: true })], sampleProfile(), { llm: throwing })).answers[0].status).toBe('needs_user');
  });

  it('uses the profile cover letter without calling the model, and needs_user without an LLM', async () => {
    const { answers, llmCalls } = await answerAll([mk('Cover letter', { kind: 'textarea' }), mk('Why us?', { kind: 'textarea', required: true })], { ...sampleProfile(), coverLetter: 'My letter' }, { llm: null });
    expect(val(byId(answers, 'Cover letter'))).toBe('My letter');
    expect(byId(answers, 'Why us?').status).toBe('needs_user');
    expect(llmCalls).toBe(0);
  });

  it('splits phone numbers when the form has a separate country code', async () => {
    expect(splitPhone('+1 512 555 0142')).toEqual({ code: '+1', national: '512 555 0142' });
    expect(splitPhone('+919876543210')).toEqual({ code: '+91', national: '9876543210' });
    const { answers } = await answerAll([mk('Country code', { kind: 'select', options: [{ label: '+44', value: '+44' }, { label: '+1', value: '+1' }] }), mk('Phone number', { inputType: 'tel' })]);
    expect(val(byId(answers, 'Phone number'))).toBe('512 555 0142');
    expect(val(byId(answers, 'Country code'))).toBe('+1');
  });

  it('selects only tech-stack options actually listed in the profile', async () => {
    const opts = ['TypeScript', 'Go', 'PostgreSQL'].map((l) => ({ label: l, value: l }));
    const { answers } = await answerAll([mk('Which technologies have you used?', { kind: 'checkbox', multiple: true, options: opts })]);
    expect(answers[0]).toMatchObject({ values: ['TypeScript', 'PostgreSQL'] });
  });

  it('only confirms immediate availability when the notice period is immediate', async () => {
    const f = mk('Confirm your availability', { kind: 'radio', required: true, options: [{ label: 'Yes, I am available to join immediately', value: 'y' }, { label: 'No (Please specify)', value: 'n' }] });
    expect((await answerAll([f])).answers[0].status).toBe('needs_user');
    expect(val((await answerAll([f], { ...sampleProfile(), noticePeriod: 'Immediately' })).answers[0])).toBe('Yes');
  });

  it('uses the resume file, or generates one from profile facts per policy', async () => {
    const dir = fs.mkdtempSync(`${os.tmpdir()}/fe-`);
    const own = `${dir}/mine.pdf`;
    fs.writeFileSync(own, '%PDF-1.4');
    expect(val((await answerAll([mk('Resume', { kind: 'file' })], { ...sampleProfile(), resumeFilePath: own })).answers[0])).toBe(own);
    const gen = (await answerAll([mk('Resume', { kind: 'file' })], sampleProfile(), { llm: null, resumeDir: dir })).answers[0];
    expect(gen.status).toBe('answered');
    const pdf = fs.readFileSync((gen as any).value, 'latin1');
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('Jordan Rivera');
    expect(pdf).not.toMatch(/Proven software engineer/);
    const none = (await answerAll([mk('Resume', { kind: 'file', required: true })], sampleProfile(), { llm: null, policy: { ...DEFAULT_POLICY, generateResumeWhenMissing: false } })).answers[0];
    expect(none.status).toBe('needs_user');
  });

  it('never fills passwords', async () => {
    const { answers } = await answerAll([mk('Password', { inputType: 'password', required: true })]);
    expect(answers[0].status).toBe('skip');
  });
});

describe('pickOption', () => {
  it('matches exact, patterns, numeric ranges and yes/no safely', () => {
    expect(pickOption(['Yes', 'No'], { value: 'No' })).toBe(1);
    expect(pickOption(['0-1 years', '2-4 years', '5-7 years', '8+ years'], { value: '5', numeric: true })).toBe(2);
    expect(pickOption(['0-2', '3-5', '6-10', '10+'], { value: '12', numeric: true })).toBe(3);
    expect(pickOption(['No (Please specify)', 'Yes, I am available'], { value: 'Yes' })).toBe(1);
    expect(pickOption(['Austin, Minnesota, United States', 'Austin, Texas, United States'], { value: 'Austin, TX, USA', match: ['Austin.*Texas', 'Austin'] })).toBe(1);
    expect(pickOption(['Red', 'Blue'], { value: 'Green' })).toBe(-1);
  });
});

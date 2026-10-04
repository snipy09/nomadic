import { describe, expect, it } from 'vitest';
import type { FieldOutcome, FormField } from '@job-automator/form-engine';
import { answerKey, rememberedAnswers } from '../services/form-answers';

const outcome = (label: string, extra: Partial<FormField> = {}): FieldOutcome => ({
  field: { id: label, kind: 'text', label, required: true, selector: '#x', frameIndex: 0, visible: true, ...extra },
  status: 'needs_user',
  attempts: 1,
});
const key = (o: FieldOutcome) => `fp:${o.field.id}`;

describe('answerKey', () => {
  it('keeps question fingerprints intact', () => {
    expect(answerKey('q_0123456789abcdef')).toBe('q_0123456789abcdef');
  });

  it('reduces labels to lower-case words', () => {
    expect(answerKey('  Current company* ')).toBe('current company');
    expect(answerKey('Total Years of Experience:')).toBe('total years of experience');
    expect(answerKey('***')).toBe('');
  });
});

describe('rememberedAnswers', () => {
  it('stores each typed answer under its fingerprint and its label', () => {
    const company = outcome('Current company*');
    const pairs = rememberedAnswers({ [key(company)]: 'Acme Labs' }, [company], key);
    expect(pairs).toEqual([[key(company), 'Acme Labs'], ['Current company*', 'Acme Labs']]);
  });

  it('skips blanks, files, long-form answers, secrets and over-long values', () => {
    const fields = [
      outcome('Blank'),
      outcome('Resume', { kind: 'file' }),
      outcome('Why do you want to join us?', { kind: 'textarea' }),
      outcome('Portal password', { inputType: 'password' }),
      outcome('Verification code'),
      outcome('Anything else'),
    ];
    const overrides: Record<string, string> = {};
    for (const o of fields) overrides[key(o)] = 'x';
    overrides[key(fields[0])] = '   ';
    overrides[key(fields[5])] = 'y'.repeat(201);
    expect(rememberedAnswers(overrides, fields, key)).toEqual([]);
  });

  it('ignores fields the candidate did not answer', () => {
    expect(rememberedAnswers(undefined, [outcome('Current company')], key)).toEqual([]);
    expect(rememberedAnswers({}, [outcome('Current company')], key)).toEqual([]);
  });
});

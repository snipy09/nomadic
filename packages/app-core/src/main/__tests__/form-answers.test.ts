import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import type { FieldOutcome, FormField } from '@job-automator/form-engine';
import { answerKey, clearRememberedAnswers, listRememberedAnswers, rememberedAnswers, updateRememberedAnswer } from '../services/form-answers';

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

describe('remembered answers on the Answers page', () => {
  let SQL: Awaited<ReturnType<typeof initSqlJs>>;
  beforeAll(async () => { SQL = await initSqlJs(); });
  const seed = () => {
    const db = new SQL.Database();
    db.run('CREATE TABLE cached_form_answers (id INTEGER PRIMARY KEY AUTOINCREMENT, question_key TEXT NOT NULL UNIQUE, answer_text TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
    for (const [k, v] of [['q_0123456789abcdef', 'Acme'], ['current company', 'Acme'], ['notice period', '30 days'], ['q_fedcba9876543210', '30 days']]) {
      db.run('INSERT INTO cached_form_answers (question_key, answer_text) VALUES (?, ?)', [k, v]);
    }
    return db;
  };
  const keys = (db: import('sql.js').Database) => db.exec('SELECT question_key FROM cached_form_answers ORDER BY question_key')[0]?.values.map((v) => v[0]) ?? [];

  it('lists label rows only', () => {
    expect(listRememberedAnswers(seed()).map((r) => [r.key, r.answer]).sort()).toEqual([['current company', 'Acme'], ['notice period', '30 days']]);
  });

  it('edits and forgets an answer together with the fingerprint rows holding it', () => {
    const db = seed();
    expect(updateRememberedAnswer(db, 'Current company', 'Beta Labs')).toBe(true);
    expect(keys(db)).toEqual(['current company', 'notice period', 'q_fedcba9876543210']);
    expect(listRememberedAnswers(db).find((r) => r.key === 'current company')?.answer).toBe('Beta Labs');
    expect(updateRememberedAnswer(db, 'notice period', null)).toBe(true);
    expect(keys(db)).toEqual(['current company']);
    expect(updateRememberedAnswer(db, 'missing', 'x')).toBe(false);
    expect(updateRememberedAnswer(db, 'q_0123456789abcdef', 'x')).toBe(false);
    clearRememberedAnswers(db);
    expect(keys(db)).toEqual([]);
  });
});

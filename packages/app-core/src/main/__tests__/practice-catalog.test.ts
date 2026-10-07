import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  buildPracticeCatalog,
  buildQuizEntries,
  buildRoleQuestionEntries,
  buildVaultEntries,
  loadPracticeCatalog,
  normalizeCompanyDataset,
} from '../services/practice-catalog';
import { VAULT_QUESTIONS } from '../../shared/data/resourceVault';

const DATA_FILE = path.join(__dirname, '../../../data/practice/leetcode-companies.json');
const raw = JSON.parse(readFileSync(DATA_FILE, 'utf-8')) as Record<string, { problems: Array<{ link: string; title: string }> }>;

describe('normalizeCompanyDataset', () => {
  it('merges a problem asked at several companies and keeps their frequencies', () => {
    const { entries, companies } = normalizeCompanyDataset({
      Acme: { company: 'Acme', problems: [{ title: 'Two Sum', difficulty: 'EASY', link: 'https://leetcode.com/problems/two-sum', frequency: '40.0', topics: ['Array'] }] },
      Beta: { company: 'Beta', problems: [{ title: 'Two Sum', difficulty: 'EASY', link: 'https://leetcode.com/problems/two-sum/', frequency: '90.5', topics: ['Array', 'Hash Table'] }] },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: 'lc:two-sum',
      kind: 'problem',
      difficulty: 'easy',
      topics: ['Array', 'Hash Table'],
      link: 'https://leetcode.com/problems/two-sum/',
      skillId: 'dsa',
      companies: [{ name: 'Beta', frequency: 90.5 }, { name: 'Acme', frequency: 40 }],
    });
    expect(companies).toEqual([{ name: 'Acme', problemCount: 1 }, { name: 'Beta', problemCount: 1 }]);
  });

  it('drops rows whose link is not a LeetCode problem URL (never repairs or invents one)', () => {
    const { entries } = normalizeCompanyDataset({
      X: { company: 'X', problems: [
        { title: 'Bad', link: 'http://leetcode.com/problems/bad' },
        { title: 'Other site', link: 'https://example.com/problems/x' },
        { title: '', link: 'https://leetcode.com/problems/no-title' },
      ] },
    });
    expect(entries).toEqual([]);
    expect(normalizeCompanyDataset(null)).toEqual({ entries: [], companies: [] });
  });

  it('keeps every problem of the shipped dataset and only its links', () => {
    const { entries, companies } = normalizeCompanyDataset(raw);
    const datasetLinks = new Set(Object.values(raw).flatMap((c) => c.problems.map((p) => p.link.replace(/\/$/, ''))));
    expect(companies.length).toBe(Object.keys(raw).length);
    expect(entries.length).toBe(datasetLinks.size);
    for (const e of entries) expect(datasetLinks.has(e.link!.replace(/\/$/, ''))).toBe(true);
  });
});

describe('written questions and quiz items', () => {
  it('builds role questions with a role family from the legacy roadmap id', () => {
    const entries = buildRoleQuestionEntries([
      { name: 'Frontend', roadmapId: 'frontend', salaryBaseIndia: 1, salaryBaseGlobal: 1, tracks: [{ name: 'T', skills: [], topics: [], interviewQuestions: ['What is the virtual DOM?'] }] },
      { name: 'Full stack', roadmapId: 'fullstack', salaryBaseIndia: 1, salaryBaseGlobal: 1, tracks: [{ name: 'T', skills: [], topics: [], interviewQuestions: ['What is the virtual DOM?'] }] },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: 'roleq:what-is-the-virtual-dom', kind: 'question', roles: ['frontend', 'fullstack'], topics: ['Frontend', 'Full stack'], link: null });
  });

  it('carries no unsourced company tags or placeholder links from the question bank', () => {
    const entries = buildVaultEntries(VAULT_QUESTIONS);
    expect(entries.length).toBe(VAULT_QUESTIONS.length);
    for (const e of entries) {
      expect(e.companies).toEqual([]);
      expect(e.link).toBeNull();
      expect(e.referenceAnswer).toBeTruthy();
    }
  });

  it('shows only published, locally gradable quiz items', () => {
    const base = { skill_id: 'sql', prompt: 'Pick one', explanation: 'Because', difficulty: 'easy', company_tags: [], ai_drafted: false, version: 1, lesson_id: null };
    const items = [
      { ...base, id: 'sql-q1', kind: 'mcq', options: ['a', 'b'], correct: [0], status: 'published' },
      { ...base, id: 'sql-q2', kind: 'mcq', options: ['a', 'b'], correct: [0], status: 'draft' },
      { ...base, id: 'sql-q3', kind: 'code', language: 'javascript', starter_code: '', entry_point: 'f', tests: [{ args: [], expected: 1 }], status: 'published' },
      { id: 'broken' },
    ];
    const entries = buildQuizEntries(items);
    expect(entries.map((e) => e.id)).toEqual(['sql-q1']);
    expect(entries[0]).toMatchObject({ kind: 'quiz', skillId: 'sql', referenceAnswer: 'Because' });
    expect(entries[0].quiz?.kind).toBe('mcq');
  });
});

describe('practice catalog', () => {
  it('combines every source with unique ids', () => {
    const catalog = buildPracticeCatalog(raw);
    const ids = catalog.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(catalog.entries.some((e) => e.kind === 'problem')).toBe(true);
    expect(catalog.entries.some((e) => e.id.startsWith('roleq:'))).toBe(true);
    expect(catalog.entries.some((e) => e.id.startsWith('vault:'))).toBe(true);
    // The seed bundle only has draft items today, so no quiz entries ship yet.
    expect(catalog.entries.filter((e) => e.kind === 'quiz').every((e) => e.quiz !== null)).toBe(true);
  });

  it('loads the dataset from the source tree and caches the result', async () => {
    const dir = path.join(__dirname, '../services');
    const a = await loadPracticeCatalog(dir);
    const b = await loadPracticeCatalog(dir);
    expect(a).toBe(b);
    expect(a.companies.length).toBeGreaterThan(100);
  });
});

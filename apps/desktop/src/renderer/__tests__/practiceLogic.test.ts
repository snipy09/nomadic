import { describe, expect, it } from 'vitest';
import type { PracticeEntry } from '../../shared/ipc';
import {
  EMPTY_FILTERS,
  buildAttempt,
  filterEntries,
  formatClock,
  isFiltered,
  latestByEntry,
  pickMockSet,
  scoreMock,
  seededRandom,
  suggestedMinutes,
  topicOptions,
  usageLabel,
} from '../features/practice/practiceLogic';
import { ANSWER_RUBRIC, unavailableFeedbackClient, validateRubricFeedback } from '../features/practice/aiFeedback';
import { companySetsFromCatalog } from '../features/practice/useCompanySets';

const entry = (over: Partial<PracticeEntry> & { id: string }): PracticeEntry => ({
  kind: 'problem',
  title: over.id,
  prompt: '',
  difficulty: 'medium',
  topics: [],
  roles: [],
  companies: [],
  link: null,
  skillId: null,
  referenceAnswer: null,
  quiz: null,
  source: 'test',
  ...over,
});

const ENTRIES: PracticeEntry[] = [
  entry({ id: 'lc:two-sum', title: 'Two Sum', difficulty: 'easy', topics: ['Array', 'Hash Table'], companies: [{ name: 'Acme', frequency: 40 }, { name: 'Beta', frequency: 90 }], link: 'https://leetcode.com/problems/two-sum/' }),
  entry({ id: 'lc:lru-cache', title: 'LRU Cache', difficulty: 'medium', topics: ['Design', 'Hash Table'], companies: [{ name: 'Acme', frequency: 95 }], link: 'https://leetcode.com/problems/lru-cache/' }),
  entry({ id: 'roleq:virtual-dom', kind: 'question', title: 'Explain the virtual DOM', difficulty: null, topics: ['Frontend & UI Engineering'], roles: ['frontend'] }),
  entry({ id: 'roleq:kafka', kind: 'question', title: 'How does Kafka order messages?', difficulty: null, topics: ['Backend & Systems Architecture'], roles: ['backend'] }),
];

describe('filterEntries', () => {
  it('returns everything with no filters', () => {
    expect(filterEntries(ENTRIES, EMPTY_FILTERS)).toHaveLength(4);
    expect(isFiltered(EMPTY_FILTERS)).toBe(false);
  });

  it('filters by kind, difficulty and topic', () => {
    expect(filterEntries(ENTRIES, { ...EMPTY_FILTERS, kind: 'question' }).map((e) => e.id)).toEqual(['roleq:virtual-dom', 'roleq:kafka']);
    expect(filterEntries(ENTRIES, { ...EMPTY_FILTERS, difficulty: 'easy' }).map((e) => e.id)).toEqual(['lc:two-sum']);
    expect(filterEntries(ENTRIES, { ...EMPTY_FILTERS, topic: 'Hash Table' })).toHaveLength(2);
  });

  it('treats entries without roles as general when filtering by role', () => {
    const ids = filterEntries(ENTRIES, { ...EMPTY_FILTERS, role: 'frontend' }).map((e) => e.id);
    expect(ids).toEqual(['lc:two-sum', 'lc:lru-cache', 'roleq:virtual-dom']);
  });

  it('filters by company and sorts by how often that company asks it', () => {
    expect(filterEntries(ENTRIES, { ...EMPTY_FILTERS, company: 'Acme' }).map((e) => e.id)).toEqual(['lc:lru-cache', 'lc:two-sum']);
    expect(filterEntries(ENTRIES, { ...EMPTY_FILTERS, company: 'Beta' }).map((e) => e.id)).toEqual(['lc:two-sum']);
  });

  it('searches titles and topics case-insensitively', () => {
    expect(filterEntries(ENTRIES, { ...EMPTY_FILTERS, search: 'kafka' }).map((e) => e.id)).toEqual(['roleq:kafka']);
    expect(filterEntries(ENTRIES, { ...EMPTY_FILTERS, search: 'design' }).map((e) => e.id)).toEqual(['lc:lru-cache']);
  });

  it('lists topics by frequency', () => {
    expect(topicOptions(ENTRIES)[0]).toEqual({ topic: 'Hash Table', count: 2 });
  });
});

describe('attempts', () => {
  const now = new Date('2026-10-03T10:00:00.000Z');

  it('builds a self-graded attempt from an entry', () => {
    const a = buildAttempt(ENTRIES[0], { grading: 'self', result: 'partial', mode: 'single', durationS: 61.4, now, id: '00000000-0000-4000-8000-000000000001' });
    expect(a).toEqual({
      id: '00000000-0000-4000-8000-000000000001', entry_id: 'lc:two-sum', entry_kind: 'problem', skill_id: null,
      topics: ['Array', 'Hash Table'], difficulty: 'easy', grading: 'self', outcome: 'partial', score: 0.5,
      mode: 'single', mock_id: null, duration_s: 61, created_at: now.toISOString(),
    });
  });

  it('derives the outcome from a quiz score', () => {
    expect(buildAttempt(ENTRIES[0], { grading: 'quiz', result: 1, mode: 'mock', mockId: 'm', durationS: 5 })).toMatchObject({ outcome: 'solved', score: 1, mock_id: 'm' });
    expect(buildAttempt(ENTRIES[0], { grading: 'quiz', result: 0.25, mode: 'single', durationS: 5 })).toMatchObject({ outcome: 'partial', score: 0.25 });
    expect(buildAttempt(ENTRIES[0], { grading: 'quiz', result: 0, mode: 'single', durationS: 5 }).outcome).toBe('unsolved');
  });

  it('keeps the latest attempt per entry', () => {
    const newer = buildAttempt(ENTRIES[0], { grading: 'self', result: 'solved', mode: 'single', durationS: 1 });
    const older = buildAttempt(ENTRIES[0], { grading: 'self', result: 'unsolved', mode: 'single', durationS: 1 });
    expect(latestByEntry([newer, older]).get('lc:two-sum')).toBe(newer);
  });
});

describe('mock interview', () => {
  it('picks n distinct entries deterministically for a seed', () => {
    const a = pickMockSet(ENTRIES, 3, seededRandom(42));
    const b = pickMockSet(ENTRIES, 3, seededRandom(42));
    expect(a).toEqual(b);
    expect(new Set(a.map((e) => e.id)).size).toBe(3);
    expect(pickMockSet(ENTRIES, 10)).toHaveLength(4);
  });

  it('suggests time from the set', () => {
    expect(suggestedMinutes([ENTRIES[0], ENTRIES[1]])).toBe(40); // 15 + 25
    expect(suggestedMinutes([ENTRIES[2]])).toBe(5);
  });

  it('scores a mock: unanswered count as zero', () => {
    const s = scoreMock([
      { entry: ENTRIES[0], outcome: 'solved', score: 1 },
      { entry: ENTRIES[1], outcome: 'partial', score: 0.5 },
      { entry: ENTRIES[2], outcome: null, score: 0 },
      { entry: ENTRIES[3], outcome: 'unsolved', score: 0 },
    ]);
    expect(s).toMatchObject({ total: 4, answered: 3, solved: 1, partial: 1, unsolved: 1, skipped: 1, percent: 38 });
    expect(s.topics[0].percent).toBe(0);
    expect(s.topics.find((t) => t.topic === 'Hash Table')).toEqual({ topic: 'Hash Table', percent: 75, count: 2 });
    expect(scoreMock([]).percent).toBe(0);
  });

  it('formats the clock', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(3725)).toBe('1:02:05');
  });

  it('labels the daily limit', () => {
    expect(usageLabel(Infinity, 3)).toBe('Unlimited practice');
    expect(usageLabel(10, 3)).toBe('7 of 10 attempts left today');
    expect(usageLabel(10, 12)).toBe('0 of 10 attempts left today');
    expect(usageLabel(10, null)).toBe('10 attempts a day');
  });
});

describe('AI rubric feedback client', () => {
  it('is unavailable and never produces feedback', async () => {
    expect(unavailableFeedbackClient.availability().available).toBe(false);
    await expect(unavailableFeedbackClient.request({ entryId: 'x', question: 'q', answer: 'a', rubric: ANSWER_RUBRIC })).rejects.toThrow(/not available/);
  });

  it('rejects replies that misquote the answer or skip criteria', () => {
    const answer = 'I would use a hash map  to store seen values.\nThen scan once.';
    const good = { summary: '', items: ANSWER_RUBRIC.map((r) => ({ criterionId: r.id, score: 3, quote: 'use a hash map to store', comment: '' })) };
    expect(validateRubricFeedback(answer, ANSWER_RUBRIC, good)).toEqual([]);
    const bad = { summary: '', items: [{ criterionId: 'correctness', score: 7, quote: 'uses a binary tree', comment: '' }] };
    const problems = validateRubricFeedback(answer, ANSWER_RUBRIC, bad);
    expect(problems).toContain('Score for "correctness" is out of range.');
    expect(problems).toContain('Quote for "correctness" is not in the answer.');
    expect(problems).toContain('Criterion "depth" was not scored.');
  });
});

describe('company sets for the resource vault', () => {
  it('groups problems per company by frequency', () => {
    const sets = companySetsFromCatalog({ version: 'v', entries: ENTRIES, companies: [{ name: 'Acme', problemCount: 2 }, { name: 'Beta', problemCount: 1 }] });
    expect(sets.Acme.problems.map((p) => p.title)).toEqual(['LRU Cache', 'Two Sum']);
    expect(sets.Beta).toMatchObject({ questionCount: 1, problems: [{ title: 'Two Sum', difficulty: 'EASY', link: 'https://leetcode.com/problems/two-sum/', frequency: '90' }] });
  });
});

import { describe, expect, it } from 'vitest';
import {
  LearningEventSchema,
  PracticeAttemptSchema,
  attemptEventType,
  attemptToEvent,
  attemptsFromEvents,
  outcomeFromScore,
  weakTopics,
  type PracticeAttempt,
} from '../src';

const NOW = new Date('2026-10-03T12:00:00.000Z');
let n = 0;
const attempt = (over: Partial<PracticeAttempt> = {}): PracticeAttempt => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  entry_id: 'lc:two-sum',
  entry_kind: 'problem',
  skill_id: 'dsa',
  topics: ['Array', 'Hash Table'],
  difficulty: 'easy',
  grading: 'self',
  outcome: 'solved',
  score: 1,
  mode: 'single',
  mock_id: null,
  duration_s: 600,
  created_at: '2026-10-03T10:00:00.000Z',
  ...over,
});

describe('practice attempts -> learning events', () => {
  it('maps outcomes to event types', () => {
    expect(attemptEventType({ entry_kind: 'problem', outcome: 'solved' })).toBe('problem_solved');
    expect(attemptEventType({ entry_kind: 'quiz', outcome: 'solved' })).toBe('quiz_passed');
    expect(attemptEventType({ entry_kind: 'question', outcome: 'partial' })).toBe('quiz_failed');
    expect(outcomeFromScore(1)).toBe('solved');
    expect(outcomeFromScore(0.4)).toBe('partial');
    expect(outcomeFromScore(0)).toBe('unsolved');
  });

  it('produces a valid learning event that round-trips back to the attempt', () => {
    const a = attempt({ mode: 'mock', mock_id: '00000000-0000-4000-8000-0000000000aa', outcome: 'partial', score: 0.5 });
    const event = attemptToEvent(a, 'user-1');
    expect(LearningEventSchema.safeParse(event).success).toBe(true);
    expect(event).toMatchObject({ type: 'quiz_failed', item_id: 'lc:two-sum', skill_id: 'dsa', payload: { source: 'practice', score: 0.5 } });
    expect(attemptsFromEvents([event])).toEqual([a]);
  });

  it('ignores events the Practice area did not write', () => {
    const other = { ...attemptToEvent(attempt(), 'u'), payload: { source: 'app', score: 1 } };
    expect(attemptsFromEvents([other])).toEqual([]);
  });

  it('rejects malformed attempts', () => {
    expect(PracticeAttemptSchema.safeParse({ ...attempt(), score: 2 }).success).toBe(false);
    expect(PracticeAttemptSchema.safeParse({ ...attempt(), entry_id: 'Not A Slug' }).success).toBe(false);
  });
});

describe('weakTopics', () => {
  it('returns topics below the threshold, weakest first', () => {
    const list = [
      attempt({ topics: ['Graph'], score: 0 }),
      attempt({ topics: ['Graph'], score: 0.5 }),
      attempt({ topics: ['Array'], score: 1 }),
      attempt({ topics: ['Array'], score: 1 }),
      attempt({ topics: ['Dynamic Programming'], score: 0 }),
      attempt({ topics: ['Dynamic Programming'], score: 0 }),
    ];
    const weak = weakTopics(list, { now: NOW });
    expect(weak.map((w) => w.topic)).toEqual(['Dynamic Programming', 'Graph']);
    expect(weak[0]).toMatchObject({ attempts: 2, score: 0, skill_id: 'dsa' });
    expect(weak[1].score).toBe(0.25);
  });

  it('needs a minimum number of attempts before judging a topic', () => {
    expect(weakTopics([attempt({ topics: ['Graph'], score: 0 })], { now: NOW })).toEqual([]);
    expect(weakTopics([attempt({ topics: ['Graph'], score: 0 })], { now: NOW, minAttempts: 1 })).toHaveLength(1);
  });

  it('weights recent attempts more than old ones', () => {
    const old = attempt({ topics: ['Tree'], score: 0, created_at: '2026-08-01T00:00:00.000Z' });
    const recent = attempt({ topics: ['Tree'], score: 1, created_at: '2026-10-03T11:00:00.000Z' });
    expect(weakTopics([old, recent], { now: NOW })).toEqual([]);
    const flipped = [attempt({ topics: ['Tree'], score: 1, created_at: '2026-08-01T00:00:00.000Z' }), attempt({ topics: ['Tree'], score: 0, created_at: '2026-10-03T11:00:00.000Z' })];
    expect(weakTopics(flipped, { now: NOW })[0].topic).toBe('Tree');
  });

  it('falls back to the skill id and drops skill_id when topics span skills', () => {
    const weak = weakTopics(
      [attempt({ topics: [], skill_id: 'sql', score: 0 }), attempt({ topics: [], skill_id: 'sql', score: 0 }), attempt({ topics: ['Mixed'], skill_id: 'a', score: 0 }), attempt({ topics: ['Mixed'], skill_id: 'b', score: 0 })],
      { now: NOW },
    );
    expect(weak.find((w) => w.topic === 'sql')?.skill_id).toBe('sql');
    expect(weak.find((w) => w.topic === 'Mixed')?.skill_id).toBeNull();
  });

  it('respects the limit', () => {
    const list = ['A', 'B', 'C'].flatMap((t) => [attempt({ topics: [t], score: 0 }), attempt({ topics: [t], score: 0 })]);
    expect(weakTopics(list, { now: NOW, limit: 2 })).toHaveLength(2);
  });
});

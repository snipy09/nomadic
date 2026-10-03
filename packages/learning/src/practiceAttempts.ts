/**
 * Practice attempts (Phase 3B.6): the shape the desktop Practice area records,
 * how an attempt maps onto the append-only learning_events log (migration 007,
 * where the free-tier daily limit is enforced), and weak-topic tracking.
 *
 * Everything here is pure so the Learn "Today" queue can call `weakTopics()`
 * on the same data the Practice area shows.
 *
 * Item id namespaces used by the Practice area (all valid `SlugSchema`s):
 *   lc:<leetcode-slug>   external LeetCode problem (company sets dataset)
 *   roleq:<slug>         written interview question for a role
 *   vault:<slug>         written question from the question bank
 *   <practice item id>   published quiz item from the content bundle
 */
import { z } from 'zod';
import { SlugSchema, UuidSchema, type LearningEvent, type LearningEventInput, type LearningEventType } from './types';

export const PRACTICE_ENTRY_KINDS = ['problem', 'question', 'quiz'] as const;
export const PracticeEntryKindSchema = z.enum(PRACTICE_ENTRY_KINDS);
export type PracticeEntryKind = z.infer<typeof PracticeEntryKindSchema>;

export const PracticeDifficultySchema = z.enum(['easy', 'medium', 'hard']);
export type PracticeDifficulty = z.infer<typeof PracticeDifficultySchema>;

/** `self`: the user graded themselves; `quiz`: graded by `gradeQuizItem`. */
export const PracticeGradingSchema = z.enum(['self', 'quiz']);
export type PracticeGrading = z.infer<typeof PracticeGradingSchema>;

/** Self-grade outcomes. Quiz attempts use `solved` / `partial` / `unsolved` from the score. */
export const PracticeOutcomeSchema = z.enum(['solved', 'partial', 'unsolved']);
export type PracticeOutcome = z.infer<typeof PracticeOutcomeSchema>;

export const PracticeModeSchema = z.enum(['single', 'mock']);
export type PracticeMode = z.infer<typeof PracticeModeSchema>;

export const PracticeAttemptSchema = z.object({
  id: UuidSchema,
  entry_id: SlugSchema,
  entry_kind: PracticeEntryKindSchema,
  skill_id: SlugSchema.nullable(),
  topics: z.array(z.string().min(1).max(80)).max(20),
  difficulty: PracticeDifficultySchema.nullable(),
  grading: PracticeGradingSchema,
  outcome: PracticeOutcomeSchema,
  /** 0..1 (self-grade: solved 1, partial 0.5, unsolved 0). */
  score: z.number().min(0).max(1),
  mode: PracticeModeSchema,
  mock_id: UuidSchema.nullable(),
  duration_s: z.number().int().min(0).max(86_400),
  created_at: z.string().datetime({ offset: true }),
});
export type PracticeAttempt = z.infer<typeof PracticeAttemptSchema>;

export const SELF_GRADE_SCORE: Record<PracticeOutcome, number> = { solved: 1, partial: 0.5, unsolved: 0 };

export function outcomeFromScore(score: number): PracticeOutcome {
  if (score >= 1) return 'solved';
  return score > 0 ? 'partial' : 'unsolved';
}

/** Event type for an attempt: solved problems are `problem_solved`, everything else is a quiz pass/fail. */
export function attemptEventType(a: Pick<PracticeAttempt, 'entry_kind' | 'outcome'>): LearningEventType {
  if (a.outcome !== 'solved') return 'quiz_failed';
  return a.entry_kind === 'problem' ? 'problem_solved' : 'quiz_passed';
}

/** The learning_events row for an attempt (sent to `learning_record_events`). */
export function attemptToEvent(a: PracticeAttempt, userId: string): LearningEventInput {
  return {
    id: a.id,
    user_id: userId,
    type: attemptEventType(a),
    skill_id: a.skill_id,
    item_id: a.entry_id,
    payload: {
      source: 'practice',
      score: a.score,
      entry_kind: a.entry_kind,
      topics: a.topics,
      difficulty: a.difficulty,
      grading: a.grading,
      outcome: a.outcome,
      mode: a.mode,
      mock_id: a.mock_id,
    },
    duration_s: a.duration_s,
    created_at: a.created_at,
  };
}

/** Practice attempts recovered from learning events (only events the Practice area wrote). */
export function attemptsFromEvents(events: Array<LearningEvent | LearningEventInput>): PracticeAttempt[] {
  const out: PracticeAttempt[] = [];
  for (const e of events) {
    const p = (e.payload ?? {}) as Record<string, unknown>;
    if (p.source !== 'practice' || !e.item_id) continue;
    const parsed = PracticeAttemptSchema.safeParse({
      id: e.id,
      entry_id: e.item_id,
      entry_kind: p.entry_kind,
      skill_id: e.skill_id ?? null,
      topics: Array.isArray(p.topics) ? p.topics : [],
      difficulty: p.difficulty ?? null,
      grading: p.grading,
      outcome: p.outcome,
      score: p.score,
      mode: p.mode ?? 'single',
      mock_id: p.mock_id ?? null,
      duration_s: e.duration_s ?? 0,
      created_at: e.created_at,
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

// ── Weak topics ─────────────────────────────────────────────────────────────

export interface WeakTopic {
  topic: string;
  /** Learn skill this topic belongs to, when every attempt agrees on one (else null). */
  skill_id: string | null;
  attempts: number;
  /** Recency-weighted mean score, 0..1, rounded to 3 places. */
  score: number;
  last_attempt_at: string;
}

export interface WeakTopicOptions {
  /** Topics with fewer attempts are not judged yet. Default 2. */
  minAttempts?: number;
  /** A topic is weak when its weighted score is below this. Default 0.6. */
  threshold?: number;
  /** Older attempts count less: weight halves every `halfLifeDays`. Default 14. */
  halfLifeDays?: number;
  /** Max topics returned (weakest first). Default 5. */
  limit?: number;
  now?: Date;
}

type TopicAttempt = Pick<PracticeAttempt, 'topics' | 'skill_id' | 'score' | 'created_at'>;

/**
 * Weakest topics from practice attempts, weakest first. Each attempt counts
 * toward every topic it is tagged with (falling back to its skill id when it
 * has no topics). Ties break on more attempts, then topic name.
 */
export function weakTopics(attempts: TopicAttempt[], opts: WeakTopicOptions = {}): WeakTopic[] {
  const minAttempts = opts.minAttempts ?? 2;
  const threshold = opts.threshold ?? 0.6;
  const halfLife = Math.max(0.1, opts.halfLifeDays ?? 14);
  const limit = opts.limit ?? 5;
  const now = (opts.now ?? new Date()).getTime();

  const acc = new Map<string, { num: number; den: number; n: number; last: string; skills: Set<string | null> }>();
  for (const a of attempts) {
    const topics = a.topics.length ? a.topics : a.skill_id ? [a.skill_id] : [];
    const ageDays = Math.max(0, (now - Date.parse(a.created_at)) / 86_400_000);
    const w = Math.pow(0.5, ageDays / halfLife);
    for (const t of new Set(topics)) {
      const cur = acc.get(t) ?? { num: 0, den: 0, n: 0, last: a.created_at, skills: new Set() };
      cur.num += a.score * w;
      cur.den += w;
      cur.n += 1;
      if (a.created_at > cur.last) cur.last = a.created_at;
      cur.skills.add(a.skill_id);
      acc.set(t, cur);
    }
  }

  const out: WeakTopic[] = [];
  for (const [topic, v] of acc) {
    if (v.n < minAttempts || v.den === 0) continue;
    const score = Math.round((v.num / v.den) * 1000) / 1000;
    if (score >= threshold) continue;
    const skill = v.skills.size === 1 ? [...v.skills][0] : null;
    out.push({ topic, skill_id: skill ?? null, attempts: v.n, score, last_attempt_at: v.last });
  }
  return out
    .sort((a, b) => a.score - b.score || b.attempts - a.attempts || a.topic.localeCompare(b.topic))
    .slice(0, limit);
}

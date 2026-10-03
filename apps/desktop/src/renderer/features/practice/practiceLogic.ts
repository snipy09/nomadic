/**
 * Pure logic for the Practice area: filters, facets, mock sets and scoring,
 * and building the attempt the main process records.
 */
import {
  SELF_GRADE_SCORE,
  outcomeFromScore,
  randomUuid,
  type PracticeAttempt,
  type PracticeGrading,
  type PracticeMode,
  type PracticeOutcome,
  type RoleFamilyId,
} from '@job-automator/learning';
import type { PracticeEntry } from '../../../shared/ipc';

export type KindFilter = 'all' | PracticeEntry['kind'];
export type DifficultyFilter = 'all' | 'easy' | 'medium' | 'hard';

export interface PracticeFilters {
  search: string;
  kind: KindFilter;
  /** Company name, or '' for any. */
  company: string;
  /** Role family id, or '' for any. */
  role: RoleFamilyId | '';
  difficulty: DifficultyFilter;
  /** Topic, or '' for any. */
  topic: string;
}

export const EMPTY_FILTERS: PracticeFilters = { search: '', kind: 'all', company: '', role: '', difficulty: 'all', topic: '' };

export const isFiltered = (f: PracticeFilters) =>
  f.search.trim() !== '' || f.kind !== 'all' || f.company !== '' || f.role !== '' || f.difficulty !== 'all' || f.topic !== '';

const companyFrequency = (e: PracticeEntry, company: string) => e.companies.find((c) => c.name === company)?.frequency ?? -1;

/**
 * Entries matching every filter. An entry with no roles is general and
 * matches any role. With a company filter, the most frequently asked come first.
 */
export function filterEntries(entries: PracticeEntry[], f: PracticeFilters): PracticeEntry[] {
  const q = f.search.trim().toLowerCase();
  const out = entries.filter((e) => {
    if (f.kind !== 'all' && e.kind !== f.kind) return false;
    if (f.difficulty !== 'all' && e.difficulty !== f.difficulty) return false;
    if (f.topic && !e.topics.includes(f.topic)) return false;
    if (f.role && e.roles.length > 0 && !e.roles.includes(f.role)) return false;
    if (f.company && !e.companies.some((c) => c.name === f.company)) return false;
    if (q && !e.title.toLowerCase().includes(q) && !e.topics.some((t) => t.toLowerCase().includes(q))) return false;
    return true;
  });
  if (f.company) out.sort((a, b) => companyFrequency(b, f.company) - companyFrequency(a, f.company));
  return out;
}

/** Topics by how many entries carry them (most first), then name. */
export function topicOptions(entries: PracticeEntry[]): Array<{ topic: string; count: number }> {
  const counts = new Map<string, number>();
  for (const e of entries) for (const t of e.topics) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
}

// ── Attempts ────────────────────────────────────────────────────────────────

export interface AttemptInput {
  grading: PracticeGrading;
  /** Self-grade outcome, or the quiz score (0..1). */
  result: PracticeOutcome | number;
  mode: PracticeMode;
  mockId?: string | null;
  durationS: number;
  now?: Date;
  id?: string;
}

export function buildAttempt(entry: PracticeEntry, input: AttemptInput): PracticeAttempt {
  const score = typeof input.result === 'number' ? Math.max(0, Math.min(1, input.result)) : SELF_GRADE_SCORE[input.result];
  const outcome = typeof input.result === 'number' ? outcomeFromScore(score) : input.result;
  return {
    id: input.id ?? randomUuid(),
    entry_id: entry.id,
    entry_kind: entry.kind,
    skill_id: entry.skillId,
    topics: entry.topics.slice(0, 20).map((t) => t.slice(0, 80)),
    difficulty: entry.difficulty,
    grading: input.grading,
    outcome,
    score,
    mode: input.mode,
    mock_id: input.mockId ?? null,
    duration_s: Math.max(0, Math.min(86_400, Math.round(input.durationS))),
    created_at: (input.now ?? new Date()).toISOString(),
  };
}

/** Latest attempt per entry id (attempts are newest first). */
export function latestByEntry(attempts: PracticeAttempt[]): Map<string, PracticeAttempt> {
  const map = new Map<string, PracticeAttempt>();
  for (const a of attempts) if (!map.has(a.entry_id)) map.set(a.entry_id, a);
  return map;
}

// ── Mock interview ──────────────────────────────────────────────────────────

/** Deterministic PRNG for tests (mulberry32). */
export function seededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** `n` distinct items chosen at random from the pool (partial Fisher-Yates). */
export function pickMockSet<T>(pool: T[], n: number, random: () => number = Math.random): T[] {
  const copy = [...pool];
  const count = Math.max(0, Math.min(n, copy.length));
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(random() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

const MINUTES: Record<string, number> = { easy: 15, medium: 25, hard: 40 };

/** Suggested time: problems by difficulty, written questions 5 min, quiz items 2 min. */
export function suggestedMinutes(entries: PracticeEntry[]): number {
  const total = entries.reduce((n, e) => {
    if (e.kind === 'quiz') return n + 2;
    if (e.kind === 'question') return n + 5;
    return n + (MINUTES[e.difficulty ?? 'medium'] ?? 25);
  }, 0);
  return Math.max(5, Math.ceil(total / 5) * 5);
}

export interface MockResult {
  entry: PracticeEntry;
  /** null = not answered (skipped or time ran out). */
  outcome: PracticeOutcome | null;
  score: number;
}

export interface MockSummary {
  total: number;
  answered: number;
  solved: number;
  partial: number;
  unsolved: number;
  skipped: number;
  /** Mean score over all questions (unanswered count as 0), 0..100. */
  percent: number;
  /** Topics from this mock, weakest first. */
  topics: Array<{ topic: string; percent: number; count: number }>;
}

export function scoreMock(results: MockResult[]): MockSummary {
  const total = results.length;
  const answered = results.filter((r) => r.outcome !== null);
  const sum = answered.reduce((n, r) => n + r.score, 0);
  const byTopic = new Map<string, { sum: number; n: number }>();
  for (const r of results) {
    for (const t of r.entry.topics) {
      const cur = byTopic.get(t) ?? { sum: 0, n: 0 };
      cur.sum += r.outcome === null ? 0 : r.score;
      cur.n += 1;
      byTopic.set(t, cur);
    }
  }
  return {
    total,
    answered: answered.length,
    solved: answered.filter((r) => r.outcome === 'solved').length,
    partial: answered.filter((r) => r.outcome === 'partial').length,
    unsolved: answered.filter((r) => r.outcome === 'unsolved').length,
    skipped: total - answered.length,
    percent: total ? Math.round((sum / total) * 100) : 0,
    topics: [...byTopic.entries()]
      .map(([topic, v]) => ({ topic, percent: Math.round((v.sum / v.n) * 100), count: v.n }))
      .sort((a, b) => a.percent - b.percent || b.count - a.count || a.topic.localeCompare(b.topic)),
  };
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

/** Daily limit text from the plan limit and the server count. */
export function usageLabel(limit: number, usedToday: number | null): string {
  if (!Number.isFinite(limit)) return 'Unlimited practice';
  if (usedToday === null) return `${limit} attempts a day`;
  return `${Math.max(0, limit - usedToday)} of ${limit} attempts left today`;
}

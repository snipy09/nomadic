/** Grading for quiz items. Code items are graded through a CodeRunner (runner.ts). */
import type { FillInItem, McqItem, OrderingItem, PracticeItem } from './types';

export interface GradeResult {
  correct: boolean;
  /** 0..1 partial credit. */
  score: number;
  feedback?: string;
}

export type QuizAnswer = number[] | string[] | null;

const norm = (s: string, caseSensitive: boolean) => {
  const t = s.trim().replace(/\s+/g, ' ');
  return caseSensitive ? t : t.toLowerCase();
};

export function gradeMcq(item: McqItem, selected: number[]): GradeResult {
  const want = new Set(item.correct);
  const got = new Set(selected);
  const hits = [...got].filter((i) => want.has(i)).length;
  const wrong = got.size - hits;
  const correct = hits === want.size && wrong === 0;
  const score = want.size === 0 ? 0 : Math.max(0, (hits - wrong) / want.size);
  return { correct, score: correct ? 1 : Math.min(score, 0.99), feedback: correct ? undefined : item.explanation };
}

export function gradeFillIn(item: FillInItem, answers: string[]): GradeResult {
  const ok = item.blanks.map((accepted, i) =>
    accepted.some((a) => norm(a, item.case_sensitive) === norm(answers[i] ?? '', item.case_sensitive))
  );
  const score = ok.filter(Boolean).length / item.blanks.length;
  return { correct: score === 1, score, feedback: score === 1 ? undefined : item.explanation };
}

/** Partial credit = longest correctly ordered subsequence / length. */
export function gradeOrdering(item: OrderingItem, order: string[]): GradeResult {
  const idx = order.map((s) => item.items.indexOf(s));
  if (idx.length !== item.items.length || idx.some((i) => i < 0) || new Set(idx).size !== idx.length) {
    return { correct: false, score: 0, feedback: 'Use every step exactly once.' };
  }
  const lis: number[] = [];
  for (const v of idx) {
    let lo = 0;
    let hi = lis.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (lis[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    lis[lo] = v;
  }
  const score = lis.length / idx.length;
  return { correct: score === 1, score, feedback: score === 1 ? undefined : item.explanation };
}

export function gradeQuizItem(item: PracticeItem, answer: QuizAnswer): GradeResult {
  if (answer === null) return { correct: false, score: 0 };
  switch (item.kind) {
    case 'mcq':
      return gradeMcq(item, answer as number[]);
    case 'fill_in':
      return gradeFillIn(item, answer as string[]);
    case 'ordering':
      return gradeOrdering(item, answer as string[]);
    case 'code':
      throw new Error('code items are graded with runCodeItem()');
  }
}

/** SM-2 quality (0-5) from a grade: fast + correct = 5, wrong = 1-2. */
export function qualityFromGrade(grade: GradeResult): number {
  if (grade.correct) return 5;
  if (grade.score >= 0.5) return 3;
  return grade.score > 0 ? 2 : 1;
}

/** A lesson check passes when at least `threshold` of its items are correct. */
export function lessonCheckPassed(grades: GradeResult[], threshold = 0.8): boolean {
  if (grades.length === 0) return false;
  return grades.filter((g) => g.correct).length / grades.length >= threshold;
}

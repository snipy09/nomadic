/**
 * Pure logic for the Answers page: the stored application answers, the candidate's own
 * question/answer pairs and search. Nothing here fills a value in for the candidate.
 */
import { APP_ANSWERS, ownAnswers, readAppAnswers, writeAppAnswers, type AppAnswerDef } from '../../../shared/applicationAnswers';

export interface OwnRow {
  /** Stable row id for React keys (not stored). */
  id: string;
  question: string;
  answer: string;
}

export interface AnswersDraft {
  app: Record<string, string>;
  own: OwnRow[];
}

let rowSeq = 0;
export const newRowId = () => `row-${++rowSeq}`;

/** The editable state for stored custom answers. */
export function toDraft(customAnswers: Record<string, string> | null | undefined): AnswersDraft {
  const all = customAnswers ?? {};
  return {
    app: readAppAnswers(all),
    own: Object.entries(ownAnswers(all)).map(([question, answer]) => ({ id: newRowId(), question, answer })),
  };
}

/**
 * Custom answers to save: keys the page does not edit (profile extras, work authorisation) are
 * kept as they are; own answers are replaced by the rows (blank questions dropped, the later of
 * two equal questions wins); the application answers are written over.
 */
export function fromDraft(customAnswers: Record<string, string> | null | undefined, draft: AnswersDraft): Record<string, string> {
  const all = customAnswers ?? {};
  const own = ownAnswers(all);
  const kept = Object.fromEntries(Object.entries(all).filter(([k]) => !(k in own)));
  for (const r of draft.own) {
    const q = r.question.trim();
    if (q && r.answer.trim()) kept[q] = r.answer.trim();
  }
  return writeAppAnswers(kept, Object.fromEntries(APP_ANSWERS.map((d) => [d.id, draft.app[d.id] ?? ''])));
}

export function sameDraft(a: AnswersDraft, b: AnswersDraft): boolean {
  const norm = (d: AnswersDraft) =>
    JSON.stringify([
      APP_ANSWERS.map((x) => (d.app[x.id] ?? '').trim()),
      d.own.filter((r) => r.question.trim() || r.answer.trim()).map((r) => [r.question.trim(), r.answer.trim()]),
    ]);
  return norm(a) === norm(b);
}

export function answeredCount(app: Record<string, string>): { done: number; total: number } {
  return { done: APP_ANSWERS.filter((d) => app[d.id]?.trim()).length, total: APP_ANSWERS.length };
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

export function matchesQuery(query: string, ...texts: Array<string | undefined>): boolean {
  const q = norm(query);
  if (!q) return true;
  return texts.some((t) => t && norm(t).includes(q));
}

export const defMatches = (query: string) => (d: AppAnswerDef) => matchesQuery(query, d.label, d.hint);

/** Ids that may be drafted by AI and are still empty. */
export function draftableEmpty(app: Record<string, string>): string[] {
  return APP_ANSWERS.filter((d) => d.aiDraft && !app[d.id]?.trim()).map((d) => d.id);
}

/** A remembered question key, shown as a question ("why_join" → "Why join"). */
export function prettyQuestion(key: string): string {
  const s = key.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : key;
}

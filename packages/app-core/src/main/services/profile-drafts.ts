import { z } from 'zod';
import type { DraftAnswersInput, DraftAnswersResult } from '../../shared/ipc.js';
import { APP_ANSWERS } from '../../shared/applicationAnswers.js';
import { aiErrorMessage, callAiProxy, type AiProxyOptions } from './ai-proxy.js';

/**
 * Drafts answers for the Answers page and onboarding through the AI proxy's `form_answers`
 * kind (no job attached). Short facts are read off the resume; long answers are written
 * from it. The proxy's prompt forbids invented facts and returns null when the facts are
 * not enough; those ids are simply left out. Nothing is saved here: the candidate edits
 * and confirms every draft.
 */

const FEATURE = 'AI drafts';
/** The proxy accepts 4,000 characters of candidate summary. */
const SUMMARY_MAX = 4_000;
const NO_VALUE = /^(n\/?a|none|null|nil|unknown|not (applicable|mentioned|specified|available|provided|stated)|-)\.?$/i;

const DRAFTABLE = new Map(APP_ANSWERS.filter((d) => d.aiDraft).map((d) => [d.id, d]));

export function buildDraftRequest(input: DraftAnswersInput): { payload: unknown; ids: string[] } | { error: string } {
  const ids = [...new Set(input.ids)].filter((id) => DRAFTABLE.has(id));
  if (!ids.length) return { error: 'Nothing to draft.' };
  const c = input.candidate;
  const summary = (c.documentText ?? '').trim().slice(0, SUMMARY_MAX);
  if (!summary && !c.skills?.trim()) return { error: 'Add your resume first so Nomadic has something to write from.' };
  const candidate: Record<string, string> = {};
  if (c.name?.trim()) candidate.name = c.name.trim();
  if (c.desiredTitle?.trim()) candidate.desired_title = c.desiredTitle.trim();
  if (c.skills?.trim()) candidate.skills = c.skills.trim().slice(0, 1000);
  if (c.location?.trim()) candidate.location = c.location.trim();
  if (summary) candidate.summary = summary;
  const questions = ids.map((id) => {
    const d = DRAFTABLE.get(id)!;
    return { id, question: d.ask ?? d.label, type: 'open_ended' as const, max_chars: Math.max(50, d.maxChars ?? 800) };
  });
  return { payload: { candidate, job: {}, questions }, ids };
}

const resultSchema = z.object({ answers: z.record(z.string(), z.string().nullable()) });

/** Usable drafts by id: only ids asked for, without empty or "not available" replies. */
export function readDrafts(result: unknown, ids: string[]): Record<string, string> | null {
  const parsed = resultSchema.safeParse(result);
  if (!parsed.success) return null;
  const out: Record<string, string> = {};
  for (const id of ids) {
    const v = parsed.data.answers[id]?.trim().replace(/^["']|["']$/g, '').trim();
    if (v && !NO_VALUE.test(v)) out[id] = v.slice(0, DRAFTABLE.get(id)?.maxChars ?? 800);
  }
  return out;
}

export async function draftProfileAnswers(input: DraftAnswersInput, opts: AiProxyOptions = {}): Promise<DraftAnswersResult> {
  const req = buildDraftRequest(input);
  if ('error' in req) return { success: false, error: req.error };
  const res = await callAiProxy('form_answers', req.payload, FEATURE, opts);
  if (!res.ok) return { success: false, code: res.code, error: res.error };
  const answers = readDrafts(res.result, req.ids);
  if (!answers) return { success: false, code: 'failed', error: aiErrorMessage('failed', FEATURE) };
  return { success: true, answers };
}

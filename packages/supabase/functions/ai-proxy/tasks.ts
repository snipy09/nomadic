// Task allow-list for the ai-proxy Edge Function: input schemas, server-owned prompts and
// zod-validated outputs. Pure (only zod), so it is unit-tested from
// packages/supabase/src/__tests__/ai-proxy-tasks.test.ts. `zod` maps to npm:zod via deno.json.
import { z } from 'zod';

export const AI_TASKS = ['form_answers', 'practice_feedback', 'roadmap_explanation'] as const;
export type AiTask = (typeof AI_TASKS)[number];

const text = (max: number) => z.string().trim().max(max);

// ── Inputs ────────────────────────────────────────────────────────────────

export const formAnswersInput = z.object({
  candidate: z.object({
    name: text(200).optional(),
    currentTitle: text(200).optional(),
    currentCompany: text(200).optional(),
    desiredTitle: text(200).optional(),
    yearsOfExperience: text(50).optional(),
    skills: text(2000).optional(),
    summary: text(4000).optional(),
    education: text(500).optional(),
    location: text(200).optional(),
  }),
  job: z.object({
    title: text(300).optional(),
    company: text(300).optional(),
    description: text(4000).optional(),
  }),
  questions: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        question: text(1000).min(1),
        type: z.enum(['open_ended', 'cover_letter']),
        maxChars: z.number().int().min(50).max(2000),
      })
    )
    .min(1)
    .max(20),
});

export const practiceFeedbackInput = z.object({
  question: text(2000).min(1),
  category: text(100).optional(),
  answer: text(8000).min(1),
});

export const roadmapExplanationInput = z.object({
  role: text(200).min(1),
  horizon: text(100).optional(),
  milestones: z
    .array(
      z.object({
        title: text(300).min(1),
        skills: z.array(text(100)).max(30).default([]),
        estimatedHours: z.number().nonnegative().max(2000).optional(),
      })
    )
    .min(1)
    .max(12),
});

export const TASK_INPUTS = {
  form_answers: formAnswersInput,
  practice_feedback: practiceFeedbackInput,
  roadmap_explanation: roadmapExplanationInput,
} as const;

// ── Outputs ───────────────────────────────────────────────────────────────

export const formAnswersOutput = z.object({
  answers: z.record(z.string(), z.string().max(4000).nullable()),
});

export const practiceFeedbackOutput = z.object({
  score: z.number().int().min(0).max(100),
  review: z.string().min(1).max(800),
  strengths: z.array(z.string().min(1).max(300)).max(4),
  improvements: z.array(z.string().min(1).max(300)).min(1).max(4),
});

export const roadmapExplanationOutput = z.object({
  summary: z.string().min(1).max(1200),
  milestones: z
    .array(z.object({ index: z.number().int().min(0), why: z.string().min(1).max(600) }))
    .max(12),
});

export type FormAnswersInput = z.infer<typeof formAnswersInput>;
export type FormAnswersOutput = z.infer<typeof formAnswersOutput>;
export type PracticeFeedbackOutput = z.infer<typeof practiceFeedbackOutput>;
export type RoadmapExplanationOutput = z.infer<typeof roadmapExplanationOutput>;

// ── URL guard: the model must never return links ──────────────────────────

const SCHEME_OR_WWW = /(https?:\/\/|ftp:\/\/|\bwww\.)/i;
// Lower-case only, so prose such as "ASP.NET" or "Socket.IO" is not mistaken for a domain.
const BARE_DOMAIN = /\b[a-z0-9-]+\.(com|org|net|io|dev|in|co|ai|app|edu|gov|me|ly|so|xyz|info|biz)\b/;

export function containsUrl(s: string): boolean {
  return SCHEME_OR_WWW.test(s) || BARE_DOMAIN.test(s);
}

function anyUrl(value: unknown): boolean {
  if (typeof value === 'string') return containsUrl(value);
  if (Array.isArray(value)) return value.some(anyUrl);
  if (value && typeof value === 'object') return Object.values(value).some(anyUrl);
  return false;
}

// ── Prompts (server-owned; the client only sends data) ────────────────────

const NO_LINKS = 'Never include URLs, links, domain names, email addresses or phone numbers.';

export function buildPrompt(task: AiTask, input: unknown): { system: string; user: string } {
  switch (task) {
    case 'form_answers':
      return {
        system: [
          'You write job-application answers on behalf of a candidate, in first person.',
          'Use ONLY the facts in CANDIDATE. Never invent employers, dates, numbers, degrees, projects or skills.',
          'If the facts are not enough to answer a question honestly, return null for it.',
          'Keep each answer within its maxChars.',
          NO_LINKS,
          'Return JSON: {"answers": {"<id>": "<answer or null>"}} with one key per question id.',
        ].join(' '),
        user: JSON.stringify(input),
      };
    case 'practice_feedback':
      return {
        system: [
          'You review a student\'s answer to an interview practice question.',
          'Judge only the answer text given. Behavioural answers: check Situation, Task, Action, Result.',
          'Technical answers: check correctness, trade-offs and clarity.',
          'score is an integer 0-100 for this answer alone; do not inflate it.',
          'review: 2-3 sentences. strengths: 0-4 short items actually present in the answer.',
          'improvements: 1-4 short, specific, actionable items.',
          NO_LINKS,
          'Return JSON: {"score": n, "review": "...", "strengths": ["..."], "improvements": ["..."]}.',
        ].join(' '),
        user: JSON.stringify(input),
      };
    case 'roadmap_explanation':
      return {
        system: [
          'You explain a learning roadmap that a deterministic planner already produced for a student.',
          'Do not add, remove, rename or reorder milestones, and do not recommend resources, courses or websites.',
          'summary: 2-4 sentences on how the milestones build toward the role.',
          'milestones: for each milestone by its 0-based index, one or two sentences on why it matters for the role.',
          NO_LINKS,
          'Return JSON: {"summary": "...", "milestones": [{"index": 0, "why": "..."}]}.',
        ].join(' '),
        user: JSON.stringify(input),
      };
  }
}

// ── Output validation ─────────────────────────────────────────────────────

export type Validated<T> = { ok: true; data: T } | { ok: false; error: string };

/** Parses the model's JSON text and validates it for the task, including the no-URL rule. */
export function validateOutput(task: AiTask, input: unknown, raw: string): Validated<unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Model output was not JSON.' };
  }

  if (task === 'form_answers') {
    const out = formAnswersOutput.safeParse(parsed);
    if (!out.success) return { ok: false, error: 'Model output did not match the schema.' };
    const questions = (input as FormAnswersInput).questions;
    const answers: Record<string, string | null> = {};
    for (const q of questions) {
      const a = out.data.answers[q.id];
      // A link or an over-long answer is dropped to null: the user answers that field themselves.
      answers[q.id] = typeof a === 'string' && a.trim() && a.length <= q.maxChars && !containsUrl(a) ? a.trim() : null;
    }
    return { ok: true, data: { answers } };
  }

  if (task === 'practice_feedback') {
    const out = practiceFeedbackOutput.safeParse(parsed);
    if (!out.success) return { ok: false, error: 'Model output did not match the schema.' };
    if (anyUrl(out.data)) return { ok: false, error: 'Model output contained a link.' };
    return { ok: true, data: out.data };
  }

  const out = roadmapExplanationOutput.safeParse(parsed);
  if (!out.success) return { ok: false, error: 'Model output did not match the schema.' };
  if (anyUrl(out.data)) return { ok: false, error: 'Model output contained a link.' };
  const count = (input as z.infer<typeof roadmapExplanationInput>).milestones.length;
  if (out.data.milestones.some((m) => m.index >= count)) return { ok: false, error: 'Model output referred to a milestone that does not exist.' };
  return { ok: true, data: out.data };
}

/** Request envelope from the desktop. */
export const proxyRequest = z.object({
  task: z.enum(AI_TASKS),
  input: z.unknown(),
  session: z.object({
    user_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
    session_token: z.string().min(1).max(500),
    device_fingerprint: z.string().min(1).max(500),
  }),
});

/** Concatenates the text parts of a Gemini generateContent response, skipping thought parts. */
export function geminiText(response: unknown): string {
  const parts = (response as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown; thought?: unknown }> } }> })
    ?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .filter((p) => p && p.thought !== true && typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('')
    .trim();
}

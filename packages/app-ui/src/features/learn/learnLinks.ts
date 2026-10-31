/**
 * "Learn on YouTube" and "Learn with ChatGPT" for one topic or one capstone
 * step. Pure: a YouTube search for exactly that topic, and a ChatGPT prompt
 * built only from the roadmap's own text and the student's role and level.
 */
import type { RoleLevel } from '@job-automator/learning';

/** Kept well under URL limits once encoded (the desktop IPC accepts 8,192 characters). */
export const PROMPT_MAX = 1500;

const LEVEL_TEXT: Record<RoleLevel, string> = {
  beginner: 'a beginner',
  intermediate: 'someone who knows the basics',
  advanced: 'someone with experience who wants depth',
};

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

export function youtubeSearchUrl(phrase: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(phrase.trim())}`;
}

/** Opens ChatGPT with the prompt typed in (chatgpt.com reads the q parameter). */
export function chatGptUrl(prompt: string): string {
  return `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
}

/** A teaching prompt for one topic of a role roadmap, at most PROMPT_MAX characters. */
export function topicPrompt(ctx: {
  role: string;
  level: RoleLevel;
  subject: string;
  module: string;
  topic: { title: string; covers: string };
}): string {
  const head = [
    `I am a student in India preparing to become a ${ctx.role}. I am ${LEVEL_TEXT[ctx.level]}.`,
    `Teach me "${ctx.topic.title}" (part of ${ctx.module}, in ${ctx.subject}).`,
    ctx.topic.covers ? `Cover: ${clip(ctx.topic.covers, 400)}.` : null,
  ].filter(Boolean).join(' ');
  const tail = [
    'Please:',
    '1. Explain it simply from the basics, with an intuitive example.',
    `2. Show how a ${ctx.role} uses it at work.`,
    '3. List the common mistakes.',
    '4. Give me 3 practice questions and wait for my answers before showing the solutions.',
  ].join('\n');
  return clip(`${head}\n\n${tail}`, PROMPT_MAX);
}

/** A guiding prompt for one capstone step: it helps the student do the step without doing it for them. */
export function stepPrompt(ctx: {
  role: string;
  project: string;
  milestone: string;
  step: { title: string; detail: string; done_when: string };
}): string {
  const lines = [
    `I am a student in India preparing to become a ${ctx.role}, building a portfolio project: "${clip(ctx.project, 120)}".`,
    `I am on the milestone "${clip(ctx.milestone, 100)}", step "${clip(ctx.step.title, 140)}".`,
    ctx.step.detail ? `About the step: ${clip(ctx.step.detail, 400)}` : null,
    ctx.step.done_when ? `It is done when: ${clip(ctx.step.done_when, 240)}` : null,
    '',
    'Guide me through this step without doing it all for me: explain the approach, the free tools to use, and what to check before I move on. Ask me what I have tried if I seem stuck.',
  ].filter((x) => x !== null);
  return clip(lines.join('\n'), PROMPT_MAX);
}

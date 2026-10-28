/**
 * "Learn from YouTube" and "Learn from ChatGPT" for a lesson. Pure: the YouTube search link, the ChatGPT prompt
 * (built only from the lesson's own catalogue text and the student's intake, nothing invented) and its link.
 */
import type { Intake, LearnModule, LearnTopic } from '@job-automator/learning';
import { roleById } from './content';
import { LANGUAGE_OPTIONS, LEVEL_OPTIONS } from './learnModel';

/** Kept well under URL limits once encoded (the desktop IPC accepts 8,192 characters). */
export const PROMPT_MAX = 1500;

type LessonContext = Partial<Pick<Intake, 'role' | 'aim' | 'language' | 'levels'>>;

const AIM_TEXT: Record<Intake['aim'], string> = {
  campus: 'on-campus placements in India',
  internship: 'an internship',
  offcampus: 'off-campus job applications',
  switch: 'switching into this role',
};

const languageName = (l: Intake['language']) => LANGUAGE_OPTIONS.find((o) => o.value === l)?.label ?? l;

function isDsa(mod: LearnModule | undefined) {
  return mod?.stream === 'dsa';
}

/** YouTube search for the lesson: topic, module and, for DSA, the student's language. */
export function youtubeSearchUrl(topic: Pick<LearnTopic, 'title'>, mod?: LearnModule, ctx: LessonContext = {}): string {
  const parts = [topic.title];
  if (mod && !topic.title.toLowerCase().includes(mod.title.toLowerCase())) parts.push(mod.title);
  if (isDsa(mod) && ctx.language) parts.push(languageName(ctx.language));
  parts.push('tutorial');
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(parts.join(' '))}`;
}

/** A detailed teaching prompt for the lesson, at most PROMPT_MAX characters. */
export function chatGptPrompt(topic: Pick<LearnTopic, 'title' | 'learn_items' | 'key_points'>, mod?: LearnModule, ctx: LessonContext = {}): string {
  const role = ctx.role ? roleById(ctx.role)?.name ?? ctx.role : null;
  const stream = mod?.stream;
  const level = stream && stream !== 'interview' && ctx.levels ? ctx.levels[stream] : undefined;
  const levelText = level ? LEVEL_OPTIONS.find((l) => l.value === level)?.label.toLowerCase() : undefined;
  const who = [
    'I am an engineering student in India',
    role ? `preparing for ${role} roles` : null,
    ctx.aim ? `(${AIM_TEXT[ctx.aim]})` : null,
  ].filter(Boolean).join(' ');

  const head = [
    `${who}.`,
    `Teach me "${topic.title}"${mod ? ` from the module "${mod.title}"` : ''}.`,
    levelText ? `My level in this area: ${levelText}.` : null,
    isDsa(mod) && ctx.language ? `Write all code in ${languageName(ctx.language)}.` : null,
  ].filter(Boolean).join(' ');

  const tail = [
    'Please:',
    '1. Explain it simply, building up from the basics, with a worked example.',
    '2. Cover every point listed above.',
    '3. List the common interview questions on it, with short model answers.',
    '4. Give 3 practice questions and hide the answers until I ask.',
    '5. List the common mistakes to avoid.',
  ].join('\n');

  const points = topic.learn_items.length ? topic.learn_items : topic.key_points;
  const budget = PROMPT_MAX - head.length - tail.length - 40;
  const lines: string[] = [];
  let used = 0;
  for (const p of points) {
    const line = `- ${p}`;
    if (used + line.length + 1 > budget) break;
    lines.push(line);
    used += line.length + 1;
  }
  const body = lines.length ? `\n\nPoints to cover:\n${lines.join('\n')}\n\n` : '\n\n';
  return `${head}${body}${tail}`.slice(0, PROMPT_MAX);
}

/** Opens ChatGPT with the prompt typed in (chatgpt.com reads the q parameter). */
export function chatGptUrl(prompt: string): string {
  return `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
}

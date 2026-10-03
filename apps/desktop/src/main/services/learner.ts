import { generateStructuredAIContent } from '@job-automator/automation';
import type { InterviewAnswerParams, InterviewEvaluation } from '../../shared/ipc.js';
import { logUserActivityDb } from '../db.js';
import { log } from './app-context.js';
import { getAiKeys } from './profile.js';

// ── AI Interview Question Evaluation (STAR & System Design) ─────────────────
export async function evaluateInterviewAnswer(params: InterviewAnswerParams): Promise<InterviewEvaluation> {
  const { questionTitle, answerText, category } = params;
  log(`[Interview AI] Evaluating candidate response for: "${questionTitle}"...`);

  const { groqKey, geminiKey } = getAiKeys();

  const prompt = `Category: ${category || 'General'}\nQuestion: ${questionTitle}\n\nCandidate's Response:\n${answerText}`;
  const systemInstruction = `You are an elite Principal Technical Hiring Manager and Bar Raiser at a top tier tech company.
Evaluate the candidate's interview answer. If behavioral, evaluate using the STAR methodology (Situation, Task, Action, Result). If system design, evaluate architectural trade-offs, scaling, and failure domains.
Respond strictly with valid JSON only in this schema:
{
  "score": <number between 50 and 98>,
  "review": "<2-3 sentence clear constructive evaluation>",
  "strengths": ["<strength 1>", "<strength 2>"],
  "improvements": ["<actionable improvement 1>", "<actionable improvement 2>"]
}`;

  try {
    const parsed = await generateStructuredAIContent<{
      score: number;
      review: string;
      strengths: string[];
      improvements: string[];
    }>(prompt, systemInstruction, { geminiKey, groqKey });

    if (parsed && typeof parsed.score === 'number' && parsed.review) {
      log(`[Interview AI] Evaluated response: Score ${parsed.score}/100 ✓`);
      logUserActivityDb('interview', `Practiced interview question: ${questionTitle} (Score: ${parsed.score}/100)`);
      return {
        score: Math.min(100, Math.max(50, Math.round(parsed.score))),
        review: parsed.review,
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths : ['Clear communication'],
        improvements: Array.isArray(parsed.improvements) ? parsed.improvements : ['Add further metrics'],
      };
    }
  } catch (err: any) {
    log(`[Interview AI] Note: ${err?.message}`);
  }

  // Fallback heuristic scoring
  const words = answerText.trim().split(/\s+/).length;
  const lower = answerText.toLowerCase();
  const hasAction = lower.includes('built') || lower.includes('implemented') || lower.includes('designed') || lower.includes('refactored');
  const hasResult = lower.includes('result') || lower.includes('%') || lower.includes('reduced') || lower.includes('improved');
  const score = Math.min(95, Math.max(60, 65 + Math.min(25, Math.floor(words / 5))));

  return {
    score,
    review: `Your response shows ${hasAction ? 'strong engineering execution' : 'promising fundamentals'}. ${hasResult ? 'Highlighting quantified impact effectively set your answer apart.' : 'To make your answer interview-ready, anchor the conclusion with concrete metrics (e.g., % improvement or time saved).' }`,
    strengths: ['Direct communication', 'Clear structure'],
    improvements: ['Include quantified business or performance impact'],
  };
}

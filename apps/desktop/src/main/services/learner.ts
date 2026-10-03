import { generateStructuredAIContent } from '@job-automator/automation';
import type {
  CuratedResource,
  InterviewAnswerParams,
  InterviewEvaluation,
  LearnerProgress,
  LearnerProgressInput,
  RecommendedResourcesParams,
} from '../../shared/ipc.js';
import {
  getLearnerProgressDb,
  saveLearnerProgressDb,
  getCuratedLearningResourcesDb,
  logUserActivityDb,
} from '../db.js';
import { log } from './app-context.js';
import { getAiKeys } from './profile.js';

// ── Learner Hub Progress & Streaks ──────────────────────────────────────────
export function getLearnerProgress(roadmapId: string): LearnerProgress | null {
  try {
    const progress = getLearnerProgressDb(roadmapId || 'frontend');
    return progress;
  } catch (err: unknown) {
    log(`[Learner] Fetch progress note: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export function saveLearnerProgress(progress: LearnerProgressInput): { success: boolean } {
  try {
    const ok = saveLearnerProgressDb(progress);
    log(`[Learner] Progress saved for track "${progress.roadmapId}" (${progress.completedNodes?.length || 0} nodes completed).`);
    return { success: ok };
  } catch (err: unknown) {
    log(`[Learner] Save progress error: ${err instanceof Error ? err.message : String(err)}`);
    return { success: false };
  }
}

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

// ── AI Recommended Learning Resources on Job Click / Selection ──────────────
export function getRecommendedResourcesForJob(params: RecommendedResourcesParams): CuratedResource[] {
  const allResources = getCuratedLearningResourcesDb();
  if (!allResources.length) return [];

  const titleLower = (params.title || '').toLowerCase();
  const descLower = (params.description || '').toLowerCase();
  const stackLower = (params.techStack || '').toLowerCase();

  const scored = allResources.map(r => {
    let score = 0;
    const topicTokens = r.topic.toLowerCase().split(/[^a-z0-9]+/);
    const roleTokens = r.targetRole.toLowerCase().split(/[^a-z0-9]+/);

    // Score based on role matches
    for (const tok of roleTokens) {
      if (tok.length > 2 && titleLower.includes(tok)) score += 6;
    }
    // Score based on topic matches
    for (const tok of topicTokens) {
      if (tok.length > 2) {
        if (titleLower.includes(tok)) score += 5;
        if (stackLower.includes(tok)) score += 4;
        if (descLower.includes(tok)) score += 2;
      }
    }
    return { resource: r, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const matched = scored.filter(s => s.score > 0).map(s => s.resource);
  return matched.length > 0 ? matched.slice(0, 4) : allResources.slice(0, 3);
}

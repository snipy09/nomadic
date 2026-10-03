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
import { aiProxy } from './ai-proxy.js';

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

// ── AI Interview Answer Feedback (ai-proxy task `practice_feedback`) ────────
// Feedback comes only from the server-side proxy. When it is unavailable the call
// fails with the reason (plan, daily limit, offline): no score is ever made up here.
export async function evaluateInterviewAnswer(params: InterviewAnswerParams): Promise<InterviewEvaluation> {
  const { questionTitle, answerText, category } = params;
  log(`[Interview AI] Requesting feedback for: "${questionTitle}"...`);
  if (answerText.trim().length > 8000) throw new Error('Keep your answer under 8,000 characters to get AI feedback.');

  const res = await aiProxy.practiceFeedback({ question: questionTitle, category: category || undefined, answer: answerText });
  if (!res.ok) {
    log(`[Interview AI] Feedback unavailable: ${res.code}`);
    throw new Error(res.error);
  }
  logUserActivityDb('interview', `Practiced interview question: ${questionTitle} (Score: ${res.data.score}/100)`);
  return {
    score: res.data.score,
    review: res.data.review,
    strengths: res.data.strengths,
    improvements: res.data.improvements,
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

import type {
  CuratedResource,
  LearnerProgress,
  LearnerProgressInput,
  RecommendedResourcesParams,
} from '../../shared/ipc.js';
import {
  getLearnerProgressDb,
  saveLearnerProgressDb,
  getCuratedLearningResourcesDb,
} from '../db.js';
import { log } from './app-context.js';

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

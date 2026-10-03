import { handle } from './handle.js';
import {
  customRoadmapArgs,
  deleteCustomRoadmapArgs,
  heatmapDaysArgs,
  logActivityArgs,
  onboardingArgs,
  recommendedResourcesArgs,
  roadmapIdArgs,
  saveCustomRoadmapArgs,
  saveLearnerProgressArgs,
} from './schemas.js';
import {
  deleteCustomRoadmapDb,
  getCustomRoadmapsDb,
  getUserActivityHeatmapDb,
  getUserActivityStatsDb,
  logUserActivityDb,
  saveCustomRoadmapDb,
} from '../db.js';
import {
  getLearnerProgress,
  getRecommendedResourcesForJob,
  saveLearnerProgress,
} from '../services/learner.js';
import { generateAiOnboardingProfile, generateCustomRoadmap } from '../services/roadmaps.js';

/** Learner hub: progress, roadmaps, activity heatmap. */
export function registerLearnerIpc(): void {
  handle('get-learner-progress', roadmapIdArgs, (roadmapId) => getLearnerProgress(roadmapId));
  handle('save-learner-progress', saveLearnerProgressArgs, (progress) => saveLearnerProgress(progress));
  handle('generate-ai-onboarding-profile', onboardingArgs, (params) => generateAiOnboardingProfile(params));
  handle('generate-custom-roadmap', customRoadmapArgs, (params) => generateCustomRoadmap(params));
  handle('get-custom-roadmaps', () => getCustomRoadmapsDb());
  handle('save-custom-roadmap', saveCustomRoadmapArgs, (roadmap) => {
    saveCustomRoadmapDb(roadmap.id, roadmap.roleTitle, roadmap.domain, roadmap.roadmapJson, roadmap.targetHorizon, roadmap.dailyCommitment);
    return { success: true };
  });
  handle('delete-custom-roadmap', deleteCustomRoadmapArgs, (id) => ({ success: deleteCustomRoadmapDb(id) }));

  handle('get-activity-heatmap', heatmapDaysArgs, (days) => getUserActivityHeatmapDb(days || 365));
  handle('log-user-activity', logActivityArgs, (params) => {
    logUserActivityDb(params.activityType, params.details);
    return { success: true };
  });
  handle('get-activity-stats', () => getUserActivityStatsDb());

  handle('get-recommended-resources-for-job', recommendedResourcesArgs, (params) => getRecommendedResourcesForJob(params));
}

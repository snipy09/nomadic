import { handle } from './handle.js';
import {
  learnCapstoneGenerateArgs,
  learnCapstoneHelpArgs,
  learnProblemNoteSaveArgs,
  learnProjectCheckRepoArgs,
  learnProjectHelpArgs,
  learnProjectSaveArgs,
  learnRoadmapAcceptArgs,
  learnRoadmapAdjustArgs,
  learnRoadmapGenerateArgs,
  learnRoleRoadmapGenerateArgs,
  learnRoleRoadmapSaveArgs,
  learnScheduleSaveArgs,
  learningRecordEventsArgs,
} from './schemas.js';
import { currentUserId, getLearningState, recordLearningEvents, syncLearning } from '../services/learning.js';
import {
  acceptRoadmap,
  adjustRoadmap,
  askProjectHelp,
  checkProjectRepo,
  generateRoadmap,
  saveProblemNote,
  saveProject,
  saveSchedule,
} from '../services/learn-v2.js';
import { askCapstoneHelp, generateCapstone, generateRoleRoadmap, saveRoleRoadmap } from '../services/learn-role.js';

/** Starts a background sync after a local change (never blocks the reply). */
function thenSync<T>(result: T): T {
  void syncLearning().catch(() => {});
  return result;
}

/** Learn: append-only learning events, the role roadmap (v3) and its capstone, the v2 documents, and their sync. */
export function registerLearnerIpc(): void {
  handle('learning-get-state', () => getLearningState());
  handle('learning-record-events', learningRecordEventsArgs, (events) => recordLearningEvents(events));
  handle('learning-sync', () => syncLearning());
  handle('learn-roadmap-generate', learnRoadmapGenerateArgs, (intake) => generateRoadmap(currentUserId(), intake));
  handle('learn-roadmap-adjust', learnRoadmapAdjustArgs, (instruction) => adjustRoadmap(currentUserId(), instruction));
  handle('learn-roadmap-accept', learnRoadmapAcceptArgs, (roadmap, schedule) => thenSync(acceptRoadmap(currentUserId(), roadmap, schedule)));
  handle('learn-schedule-save', learnScheduleSaveArgs, (schedule) => thenSync(saveSchedule(currentUserId(), schedule)));
  handle('learn-project-save', learnProjectSaveArgs, async (project) => thenSync(await saveProject(currentUserId(), project)));
  handle('learn-problem-note-save', learnProblemNoteSaveArgs, (note) => thenSync(saveProblemNote(currentUserId(), note)));
  handle('learn-project-check-repo', learnProjectCheckRepoArgs, (req) => checkProjectRepo(currentUserId(), req));
  handle('learn-project-help', learnProjectHelpArgs, (req) => askProjectHelp(req));
  handle('learn-role-roadmap-generate', learnRoleRoadmapGenerateArgs, async (req) => thenSync(await generateRoleRoadmap(currentUserId(), req)));
  handle('learn-role-roadmap-save', learnRoleRoadmapSaveArgs, (roadmap) => thenSync(saveRoleRoadmap(currentUserId(), roadmap)));
  handle('learn-capstone-generate', learnCapstoneGenerateArgs, async (projectId) => thenSync(await generateCapstone(currentUserId(), projectId)));
  handle('learn-capstone-help', learnCapstoneHelpArgs, (req) => askCapstoneHelp(currentUserId(), req));
}

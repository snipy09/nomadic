import { handle } from './handle.js';
import {
  learnProblemNoteSaveArgs,
  learnProjectCheckRepoArgs,
  learnProjectSaveArgs,
  learnRoadmapAcceptArgs,
  learnRoadmapAdjustArgs,
  learnRoadmapGenerateArgs,
  learnScheduleSaveArgs,
  learningRecordEventsArgs,
} from './schemas.js';
import { currentUserId, getLearningState, recordLearningEvents, syncLearning } from '../services/learning.js';
import {
  acceptRoadmap,
  adjustRoadmap,
  checkProjectRepo,
  generateRoadmap,
  saveProblemNote,
  saveProject,
  saveSchedule,
} from '../services/learn-v2.js';

/** Starts a background sync after a local change (never blocks the reply). */
function thenSync<T>(result: T): T {
  void syncLearning().catch(() => {});
  return result;
}

/** Learn: append-only learning events, the v2 roadmap, schedule, projects and notes, and their sync. */
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
}

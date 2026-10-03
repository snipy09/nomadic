import { handle } from './handle.js';
import { interviewAnswerArgs, learningRecordEventsArgs, learningSaveGoalArgs } from './schemas.js';
import { evaluateInterviewAnswer } from '../services/learner.js';
import { getLearningState, recordLearningEvents, saveLearningGoal, syncLearning } from '../services/learning.js';

/** Learn: goal, append-only learning events and their sync; interview practice. */
export function registerLearnerIpc(): void {
  handle('learning-get-state', () => getLearningState());
  handle('learning-save-goal', learningSaveGoalArgs, (goal) => saveLearningGoal(goal));
  handle('learning-record-events', learningRecordEventsArgs, (events) => recordLearningEvents(events));
  handle('learning-sync', () => syncLearning());

  handle('evaluate-interview-answer', interviewAnswerArgs, (params) => evaluateInterviewAnswer(params));
}

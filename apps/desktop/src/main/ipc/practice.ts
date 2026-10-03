import { handle } from './handle.js';
import { aiRubricFeedbackArgs, practiceRecordAttemptArgs } from './schemas.js';
import { getPracticeCatalog, getPracticeState, recordPracticeAttempt } from '../services/practice.js';
import { requestRubricFeedback } from '../services/ai-proxy.js';

/** Practice area (F8): catalog from bundled datasets, attempts through the server-limited RPC. */
export function registerPracticeIpc(): void {
  handle('practice-get-catalog', () => getPracticeCatalog());
  handle('practice-get-state', () => getPracticeState());
  handle('practice-record-attempt', practiceRecordAttemptArgs, (attempt) => recordPracticeAttempt(attempt));
  handle('ai-rubric-feedback', aiRubricFeedbackArgs, (req) => requestRubricFeedback(req));
}

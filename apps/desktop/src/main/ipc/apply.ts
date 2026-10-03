import { handle } from './handle.js';
import {
  batchOverridesArgs,
  batchTargetsArgs,
  applicationNotesArgs,
  applicationStatusArgs,
  idArgs,
  jobUrlsArgs,
  saveApplicationArgs,
} from './schemas.js';
import {
  cancelAutonomousApply,
  launchAutonomous,
  launchSemiAuto,
  startBatchCopilot,
  submitAllBatchCopilot,
} from '../services/apply.js';
import {
  deleteApplication,
  getApplications,
  saveApplication,
  updateApplicationNotes,
  updateApplicationStatus,
} from '../services/applications.js';

/** Application log, review mode, autonomous apply and batch co-pilot. */
export function registerApplyIpc(): void {
  handle('get-applications', () => getApplications());
  handle('update-application-status', applicationStatusArgs, (data) => updateApplicationStatus(data));
  handle('update-application-notes', applicationNotesArgs, (data) => updateApplicationNotes(data));
  handle('delete-application', idArgs, (id) => deleteApplication(id));
  handle('save-application', saveApplicationArgs, (app) => saveApplication(app));
  handle('launch-semi-auto', jobUrlsArgs, (jobUrls) => launchSemiAuto(jobUrls));
  handle('launch-autonomous', jobUrlsArgs, (jobUrls) => launchAutonomous(jobUrls));
  handle('cancel-autonomous-apply', () => cancelAutonomousApply());
  handle('start-batch-copilot', batchTargetsArgs, (targets, options) => startBatchCopilot(targets, options));
  handle('submit-all-batch-copilot', batchOverridesArgs, (overrides, ids) => submitAllBatchCopilot(overrides, ids));
}

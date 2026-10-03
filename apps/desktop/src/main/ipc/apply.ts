import { handle } from './handle.js';
import {
  batchOverridesArgs,
  batchTargetsArgs,
  idArgs,
  idStatusArgs,
  jobUrlsArgs,
  saveApplicationArgs,
} from './schemas.js';
import {
  cancelAutonomousApply,
  deleteApplication,
  getApplications,
  launchAutonomous,
  launchSemiAuto,
  saveApplication,
  startBatchCopilot,
  submitAllBatchCopilot,
  updateApplicationStatus,
} from '../services/apply.js';

/** Application log, review mode, autonomous apply and batch co-pilot. */
export function registerApplyIpc(): void {
  handle('get-applications', () => getApplications());
  handle('update-application-status', idStatusArgs, (data) => updateApplicationStatus(data));
  handle('delete-application', idArgs, (id) => deleteApplication(id));
  handle('save-application', saveApplicationArgs, (app) => saveApplication(app));
  handle('launch-semi-auto', jobUrlsArgs, (jobUrls) => launchSemiAuto(jobUrls));
  handle('launch-autonomous', jobUrlsArgs, (jobUrls) => launchAutonomous(jobUrls));
  handle('cancel-autonomous-apply', () => cancelAutonomousApply());
  handle('start-batch-copilot', batchTargetsArgs, (targets) => startBatchCopilot(targets));
  handle('submit-all-batch-copilot', batchOverridesArgs, (overrides) => submitAllBatchCopilot(overrides));
}

import { registerAdminIpc } from './admin.js';
import { registerApplyIpc } from './apply.js';
import { registerAssistantIpc } from './assistant.js';
import { registerAuthIpc } from './auth.js';
import { registerBillingIpc } from './billing.js';
import { registerDataSafetyIpc } from './data-safety.js';
import { registerFeedIpc } from './feed.js';
import { registerLearnerIpc } from './learner.js';
import { registerOutreachIpc } from './outreach.js';
import { registerPracticeIpc } from './practice.js';
import { registerProfileIpc } from './profile.js';
import { registerSettingsIpc } from './settings.js';
import { registerSystemIpc } from './system.js';

export { setIpcSenderGuard } from './handle.js';

/** Registers every `ipcMain.handle` channel listed in `shared/ipc.ts`. */
export function registerAllIpc(): void {
  registerAuthIpc();
  registerSystemIpc();
  registerSettingsIpc();
  registerProfileIpc();
  registerFeedIpc();
  registerApplyIpc();
  registerBillingIpc();
  registerOutreachIpc();
  registerAssistantIpc();
  registerLearnerIpc();
  registerPracticeIpc();
  registerAdminIpc();
  registerDataSafetyIpc();
}

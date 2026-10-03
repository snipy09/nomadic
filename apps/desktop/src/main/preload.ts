import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { ChannelArgs, ChannelName, ChannelResult, EventName, IpcEvents, NomadicApi } from '../shared/ipc';

// Runs sandboxed (webPreferences.sandbox = true): only `contextBridge` and
// `ipcRenderer` are used, and only type imports come from shared/ipc.

function invoke<C extends ChannelName>(channel: C, ...args: ChannelArgs<C>): Promise<ChannelResult<C>> {
  return ipcRenderer.invoke(channel, ...args);
}

function subscribe<E extends EventName>(event: E, cb: (payload: IpcEvents[E]) => void): () => void {
  const handler = (_: IpcRendererEvent, payload: IpcEvents[E]) => cb(payload);
  ipcRenderer.on(event, handler);
  return () => {
    ipcRenderer.removeListener(event, handler);
  };
}

const apiObj: NomadicApi = {
  getMasterProfile: () => invoke('get-master-profile'),
  saveMasterProfile: (data) => invoke('save-master-profile', data),
  getResumes: () => invoke('get-resumes'),
  saveResume: (resume) => invoke('save-resume', resume),
  deleteResume: (id) => invoke('delete-resume', id),
  setDefaultResume: (id) => invoke('set-default-resume', id),
  pickResumeFile: () => invoke('pick-resume-file'),
  runScrapers: () => invoke('run-scrapers'),
  getCloudFeed: (userId) => invoke('get-cloud-feed', userId),
  getCloudFeedPage: (options) => invoke('get-cloud-feed-page', options),
  launchSemiAuto: (jobUrls) => invoke('launch-semi-auto', jobUrls),
  launchAutonomous: (jobUrls) => invoke('launch-autonomous', jobUrls),
  cancelAutonomousApply: () => invoke('cancel-autonomous-apply'),
  startBatchCoPilot: (targets, options) => invoke('start-batch-copilot', targets, options),
  submitAllBatchCoPilot: (overrides, ids) => invoke('submit-all-batch-copilot', overrides, ids),
  getEntitlements: (options) => invoke('get-entitlements', options),
  startCheckout: (plan) => invoke('start-checkout', plan),
  verifyEmail: (email) => invoke('verify-email', email),
  getHrContacts: (targetRole) => invoke('get-hr-contacts', targetRole),
  sendOutreach: (contacts) => invoke('send-outreach', contacts),
  getApplications: () => invoke('get-applications'),
  saveApplication: (app) => invoke('save-application', app),
  getSavedJobs: () => invoke('get-saved-jobs'),
  saveJob: (job) => invoke('save-job', job),
  removeSavedJob: (applyUrl) => invoke('remove-saved-job', applyUrl),
  checkDependencies: () => invoke('check-dependencies'),
  installDependencies: () => invoke('install-dependencies'),
  testGroqKey: (key) => invoke('test-groq-key', key),
  startHeartbeat: (userId, sessionToken, deviceFingerprint) =>
    invoke('start-heartbeat', { userId, sessionToken, deviceFingerprint }),
  stopHeartbeat: () => invoke('stop-heartbeat'),
  syncCloudData: () => invoke('sync-cloud-data'),
  getDeviceInfo: () => invoke('get-device-info'),
  onLog: (cb) => subscribe('log', cb),
  onHeartbeatStatus: (cb) => subscribe('heartbeat-status', cb),
  onAutoApplyProgress: (cb) => subscribe('auto-apply-progress', cb),
  openExternalUrl: (url) => invoke('open-external-url', url),

  // AI Generation Handlers
  askNomadicAssistant: (data) => invoke('ask-nomadic-assistant', data),
  generateAiOutreachEmail: (params) => invoke('generate-ai-outreach-email', params),

  // Learn
  learningGetState: () => invoke('learning-get-state'),
  learningSaveGoal: (goal) => invoke('learning-save-goal', goal),
  learningRecordEvents: (events) => invoke('learning-record-events', events),
  learningSync: () => invoke('learning-sync'),

  // Applications Management
  updateApplicationStatus: (id, status) => invoke('update-application-status', { id, status }),
  updateApplicationNotes: (id, notes) => invoke('update-application-notes', { id, notes }),
  deleteApplication: (id) => invoke('delete-application', id),

  // Interview Evaluation

  // Authentication APIs
  authLogin: (credentials) => invoke('auth-login', credentials),
  authSignup: (credentials) => invoke('auth-signup', credentials),
  authGoogle: () => invoke('auth-google'),
  onOauthCallback: (cb) => subscribe('oauth-callback', cb),
  practiceGetCatalog: () => invoke('practice-get-catalog'),
  practiceGetState: () => invoke('practice-get-state'),
  practiceRecordAttempt: (attempt) => invoke('practice-record-attempt', attempt),

  // Admin (F12): every call is re-authorized server side (session + admin role)
  adminListUsers: (query) => invoke('admin-list-users', query),
  adminSetUserPlan: (input) => invoke('admin-set-user-plan', input),
  adminSetUserStatus: (input) => invoke('admin-set-user-status', input),
  adminListAudit: (query) => invoke('admin-list-audit', query),
  adminScrapeHealth: (days) => invoke('admin-scrape-health', days),
  adminListContent: (query) => invoke('admin-list-content', query),
  adminUpdateLesson: (input) => invoke('admin-update-lesson', input),
  adminSetResourceStatus: (input) => invoke('admin-set-resource-status', input),
  adminContentHistory: (query) => invoke('admin-content-history', query),

  // In-App Updates
  checkForUpdates: () => invoke('check-for-updates'),
  downloadUpdate: (downloadUrl) => invoke('download-update', downloadUrl),
  installUpdate: (installerPath) => invoke('install-update', installerPath),
  onUpdateDownloadProgress: (cb) => subscribe('update-download-progress', cb),
};

contextBridge.exposeInMainWorld('api', apiObj);
contextBridge.exposeInMainWorld('electronAPI', apiObj);

// Sentry's IPC bridge for the renderer SDK. It only forwards events to the main
// process, which drops them unless the user opted in to crash reports.
import '@sentry/electron/preload';
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { ChannelArgs, ChannelName, ChannelResult, EventName, IpcEvents, NomadicApi } from '../shared/ipc';

// Runs sandboxed (webPreferences.sandbox = true): only `contextBridge` and
// `ipcRenderer` are used (also by the Sentry bridge), and only type imports come from shared/ipc.

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
  readDocumentText: (input) => invoke('read-document-text', input),
  draftProfileAnswers: (input) => invoke('draft-profile-answers', input),
  listRememberedAnswers: () => invoke('remembered-answers-list'),
  updateRememberedAnswer: (input) => invoke('remembered-answers-update', input),
  clearRememberedAnswers: () => invoke('remembered-answers-clear'),
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
  getPaymentHistory: () => invoke('get-payment-history'),
  outreachListContacts: (query) => invoke('outreach-list-contacts', query),
  outreachReportContact: (input) => invoke('outreach-report-contact', input),
  outreachGetState: () => invoke('outreach-get-state'),
  outreachSavePerson: (input) => invoke('outreach-save-person', input),
  outreachDeletePerson: (id) => invoke('outreach-delete-person', id),
  outreachSaveMessage: (input) => invoke('outreach-save-message', input),
  outreachDeleteMessage: (id) => invoke('outreach-delete-message', id),
  outreachReviewMessage: (id) => invoke('outreach-review-message', id),
  outreachSendMessage: (id) => invoke('outreach-send-message', id),
  outreachOpenMessage: (input) => invoke('outreach-open-message', input),
  outreachMarkMessage: (input) => invoke('outreach-mark-message', input),
  outreachDraftAi: (input) => invoke('outreach-draft-ai', input),
  outreachGetSmtp: () => invoke('outreach-get-smtp'),
  outreachSaveSmtp: (input) => invoke('outreach-save-smtp', input),
  outreachClearSmtp: () => invoke('outreach-clear-smtp'),
  getApplications: () => invoke('get-applications'),
  saveApplication: (app) => invoke('save-application', app),
  getSavedJobs: () => invoke('get-saved-jobs'),
  saveJob: (job) => invoke('save-job', job),
  removeSavedJob: (applyUrl) => invoke('remove-saved-job', applyUrl),
  getHiddenJobs: () => invoke('get-hidden-jobs'),
  hideJob: (job) => invoke('hide-job', job),
  unhideJob: (applyUrl) => invoke('unhide-job', applyUrl),
  checkDependencies: () => invoke('check-dependencies'),
  installDependencies: () => invoke('install-dependencies'),
  startHeartbeat: (userId, sessionToken, deviceFingerprint) =>
    invoke('start-heartbeat', { userId, sessionToken, deviceFingerprint }),
  stopHeartbeat: () => invoke('stop-heartbeat'),
  syncCloudData: () => invoke('sync-cloud-data'),
  getDeviceInfo: () => invoke('get-device-info'),
  onLog: (cb) => subscribe('log', cb),
  onHeartbeatStatus: (cb) => subscribe('heartbeat-status', cb),
  onAutoApplyProgress: (cb) => subscribe('auto-apply-progress', cb),
  openExternalUrl: (url) => invoke('open-external-url', url),
  openInApplyBrowser: (url) => invoke('open-in-apply-browser', url),

  // AI Generation Handlers
  askNomadicAssistant: (data) => invoke('ask-nomadic-assistant', data),

  // Learn
  learningGetState: () => invoke('learning-get-state'),
  learningRecordEvents: (events) => invoke('learning-record-events', events),
  learningSync: () => invoke('learning-sync'),
  learnRoadmapGenerate: (intake) => invoke('learn-roadmap-generate', intake),
  learnRoadmapAdjust: (instruction) => invoke('learn-roadmap-adjust', instruction),
  learnRoadmapAccept: (roadmap, schedule) => invoke('learn-roadmap-accept', roadmap, schedule),
  learnScheduleSave: (schedule) => invoke('learn-schedule-save', schedule),
  learnProjectSave: (project) => invoke('learn-project-save', project),
  learnProblemNoteSave: (note) => invoke('learn-problem-note-save', note),
  learnProjectCheckRepo: (req) => invoke('learn-project-check-repo', req),
  learnProjectHelp: (req) => invoke('learn-project-help', req),

  // Applications Management
  updateApplicationStatus: (id, status) => invoke('update-application-status', { id, status }),
  updateApplicationNotes: (id, notes) => invoke('update-application-notes', { id, notes }),
  updateApplicationFollowUp: (id, followUpAt) => invoke('update-application-follow-up', { id, followUpAt }),
  deleteApplication: (id) => invoke('delete-application', id),

  // Interview Evaluation

  // Authentication APIs
  authLogin: (credentials) => invoke('auth-login', credentials),
  authSignup: (credentials) => invoke('auth-signup', credentials),
  authGoogle: (options) => invoke('auth-google', options),
  authRequestPasswordReset: (input) => invoke('auth-request-password-reset', input),
  authConfirmPasswordReset: (input) => invoke('auth-confirm-password-reset', input),
  authSendVerification: () => invoke('auth-send-verification'),
  authConfirmVerification: (input) => invoke('auth-confirm-verification', input),
  authVerificationStatus: () => invoke('auth-verification-status'),
  getDataHealth: () => invoke('get-data-health'),
  updaterGetStatus: () => invoke('updater-get-status'),
  updaterCheck: () => invoke('updater-check'),
  updaterDownload: () => invoke('updater-download'),
  updaterInstall: () => invoke('updater-install'),
  updaterSetChannel: (channel) => invoke('updater-set-channel', channel),
  onUpdaterStatus: (cb) => subscribe('updater-status', cb),
  getUpdatePolicy: () => invoke('get-update-policy'),
  getWhatsNew: () => invoke('whats-new-get'),
  dismissWhatsNew: () => invoke('whats-new-dismiss'),
  getTelemetry: () => invoke('telemetry-get'),
  setTelemetry: (enabled) => invoke('telemetry-set', enabled),
  sendFeedback: (input) => invoke('send-feedback', input),
  copyDiagnostics: () => invoke('copy-diagnostics'),
  exportAccountData: () => invoke('export-account-data'),
  deleteAccount: (input) => invoke('delete-account', input),
  onOauthCallback: (cb) => subscribe('oauth-callback', cb),
  practiceGetCatalog: () => invoke('practice-get-catalog'),
  practiceGetState: () => invoke('practice-get-state'),
  practiceRecordAttempt: (attempt) => invoke('practice-record-attempt', attempt),
  aiRubricFeedback: (req) => invoke('ai-rubric-feedback', req),

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
};

contextBridge.exposeInMainWorld('api', apiObj);
contextBridge.exposeInMainWorld('electronAPI', apiObj);

/**
 * Typed IPC contract shared by the Electron main process, the preload bridge
 * and the renderer.
 *
 *  - `IpcChannels` maps every `ipcRenderer.invoke` channel to its argument
 *    tuple and its resolved result. Main registers handlers through the typed
 *    `handle()` helper (main/ipc/handle.ts), so a handler that drifts from this
 *    map fails to compile.
 *  - `IpcEvents` maps every main -> renderer push channel (`webContents.send`)
 *    to its payload.
 *  - `NomadicApi` is the exact shape preload exposes as `window.api` and
 *    `window.electronAPI`.
 *
 * This file must stay free of runtime imports (types and plain constants
 * only) so it can be bundled into the sandboxed preload and the renderer.
 */

import type { AnswerSource, FieldKind, FillReport, FormEngineEvent } from '@job-automator/form-engine';

export type { AnswerSource, FieldKind, FillReport, FormEngineEvent };

// ── Shared payload shapes ───────────────────────────────────────────────────

export interface SuccessResult {
  success: boolean;
  error?: string;
}

/** Raw `master_profile` row (snake_case SQLite columns, secrets included). */
export type MasterProfileRow = Record<string, unknown>;

export interface DependencyStatus {
  sqliteReady: boolean;
  playwrightInstalled: boolean;
  internetOk: boolean;
  allReady: boolean;
}

export interface HeartbeatStatus {
  valid: boolean;
  reason?: string;
  ip?: string;
}

export interface AppUpdateInfo {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseName?: string;
  releaseNotes?: string;
  downloadUrl?: string;
}

export interface ResumeRecord {
  id: number;
  name: string;
  targetRole: string;
  filePath: string;
  isDefault: boolean;
  createdAt: string;
}

export interface ResumeInput {
  name?: string;
  targetRole?: string;
  filePath?: string;
  isDefault?: boolean;
  [key: string]: unknown;
}

export interface PickResumeFileResult {
  canceled: boolean;
  filePath?: string;
  fileName?: string;
}

export interface FeedJob {
  title: string;
  company: string;
  location: string;
  applyUrl: string;
  source: string;
  description: string;
  jobHash: string;
  salary?: string;
  score: number;
  employmentType?: string;
  workplaceType?: string;
  experienceLevel?: string;
  createdAt?: string;
  isIndian?: boolean;
}

export interface CloudFeedPageOptions {
  page?: number;
  pageSize?: number;
  search?: string;
  filterTab?: string;
  source?: string;
}

export interface SavedJob {
  title: string;
  company: string;
  applyUrl: string;
  location?: string;
  salary?: string;
  source?: string;
  score?: number;
  description?: string;
}

export interface SaveJobInput {
  title?: string;
  company?: string;
  applyUrl?: string;
  apply_url?: string;
  location?: string;
  salary?: string;
  source?: string;
  score?: number | string;
  description?: string;
  [key: string]: unknown;
}

/** Raw `local_applications` row. */
export type ApplicationRow = Record<string, unknown>;

export interface ApplicationInput {
  company: string;
  title: string;
  apply_url: string;
  status?: string;
  mode?: string;
}

export interface AutonomousApplyResult {
  success: boolean;
  applied?: number;
  skipped?: number;
  totalBatches?: number;
  limitReached?: boolean;
  currentUsage?: number;
  maxAllowed?: number;
  error?: string;
}

export interface BatchTarget {
  url: string;
  company?: string;
  title?: string;
}

/** One question of a pre-filled form, as the candidate reviews it. */
export interface BatchSnapshotField {
  /** Question fingerprint; the key used in `BatchOverrides`. */
  fieldKey: string;
  label: string;
  /** Value written into the form ('' when nothing was written). Checkboxes: 'true' / 'false'. */
  value: string;
  fieldType: FieldKind;
  required: boolean;
  status: 'filled' | 'needs_user' | 'skipped' | 'failed';
  /** Where the value came from (profile, saved answer, policy, AI...). */
  source?: AnswerSource;
  /** Classifier confidence (0-1) that the question was understood. */
  confidence?: number;
  /** Why the field needs the candidate, was skipped, or failed. */
  reason?: string;
  /** Visible option labels for choice fields. */
  options?: string[];
  multiple?: boolean;
}

/** A form pre-filled for review. Nothing in it has been submitted. */
export interface BatchSnapshot {
  id: string;
  company: string;
  jobTitle: string;
  applyUrl: string;
  fields: BatchSnapshotField[];
  /** ready: can be submitted after review; needs_attention: the candidate must act first; failed: could not be filled. */
  status: 'ready' | 'needs_attention' | 'failed';
  /** True while the filled form is held open and can be submitted. */
  submittable: boolean;
  /** Walls the candidate must clear in the browser (sign-in, CAPTCHA, email verification). */
  walls: Array<'login' | 'captcha' | 'email_verification'>;
  /** Validation messages the portal showed after filling. */
  pageErrors: string[];
  errorMessage?: string;
}

export interface BatchStartOptions {
  /** Keep previously held forms (used to retry one application without discarding the others). */
  keep?: boolean;
}

export interface BatchSubmitItemResult {
  id: string;
  submitted: boolean;
  /** The portal showed a confirmation page. */
  confirmed: boolean;
  error?: string;
}

export interface BatchSubmitResult extends SuccessResult {
  applied?: number;
  failed?: number;
  total?: number;
  results?: BatchSubmitItemResult[];
}

/** Reviewed values per snapshot id, keyed by `BatchSnapshotField.fieldKey`. */
export type BatchOverrides = Record<string, Record<string, string>>;

export interface EmailVerification {
  email?: string;
  isValid: boolean;
  stageFailed?: number;
  reason?: string;
}

export interface HrContact {
  name: string;
  company: string;
  role: string;
  email: string;
  department?: string;
  verificationStatus: string;
  sentStatus: string;
  isTargetCompany?: boolean;
  matchScore?: number;
}

export interface OutreachRecipient {
  email: string;
  name?: string;
  company?: string;
  role?: string;
  subject?: string;
  body?: string;
}

export interface OutreachResult {
  success: boolean;
  sent: number;
  mode?: 'smtp' | 'automated_chrome' | 'draft_opened';
  error?: string;
}

export interface AiOutreachEmailParams {
  role?: string;
  company?: string;
  recipientName?: string;
  tone?: string;
  skills?: string;
  candidateName?: string;
}

export interface AssistantAction {
  type: string;
  target?: string;
  payload?: Record<string, unknown>;
}

export interface AssistantRequest {
  message: string;
  history?: Array<{ sender: string; text: string }>;
}

export interface AssistantReply {
  success: boolean;
  reply: string;
  action?: AssistantAction;
}

export interface LearnerProgress {
  roadmapId: string;
  completedNodes: string[];
  targetHorizon: string;
  dailyCommitment: string;
  streakCount: number;
  lastActiveDate?: string;
}

export interface LearnerProgressInput {
  roadmapId: string;
  completedNodes: string[];
  targetHorizon?: string;
  dailyCommitment?: string;
  streakCount?: number;
}

export interface OnboardingProfileParams {
  targetRole: string;
  experienceLevel?: string;
  bioOrResumeText?: string;
  customSkills?: string[];
  targetHorizon?: string;
  dailyCommitment?: string;
  geminiKey?: string;
  groqKey?: string;
}

export interface CustomRoadmapParams {
  roleTitle: string;
  customTitle?: string;
  currentSkills?: string;
  targetHorizon?: string;
  dailyCommitment?: string;
  geminiKey?: string;
  groqKey?: string;
}

/** AI generated roadmap / profile payloads are free-form JSON. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AiJson = any;

export interface CustomRoadmapRecord {
  id: string;
  roleTitle: string;
  domain: string;
  targetHorizon: string;
  dailyCommitment: string;
  roadmapJson: string;
  updatedAt: string;
}

export interface CustomRoadmapInput {
  id: string;
  roleTitle: string;
  domain: string;
  roadmapJson: string;
  targetHorizon?: string;
  dailyCommitment?: string;
}

export interface ActivityHeatmapDay {
  date: string;
  count: number;
}

export interface ActivityStats {
  streakCount: number;
  totalActions: number;
}

export interface InterviewAnswerParams {
  questionId: string;
  questionTitle: string;
  answerText: string;
  category?: string;
}

export interface InterviewEvaluation {
  score: number;
  review: string;
  strengths: string[];
  improvements: string[];
}

export interface CuratedResource {
  id: number;
  title: string;
  youtubeUrl: string;
  topic: string;
  targetRole: string;
  summary: string;
  duration: string;
  createdAt: string;
}

export interface CuratedResourceInput {
  title: string;
  youtubeUrl: string;
  topic: string;
  targetRole: string;
  summary?: string;
  duration?: string;
}

export interface RecommendedResourcesParams {
  title: string;
  description?: string;
  techStack?: string;
}

export type UserTier =
  | 'trial'
  | 'pro'
  | 'max'
  | 'lifetime'
  | 'lite'
  | 'learner_pro'
  | 'seeker_pro'
  | 'seeker_max'
  | 'free';

export interface ValidatedUser {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'user';
  tier: UserTier;
  licenseKey: string;
  status: 'active' | 'suspended';
  appsCount: number;
  createdAt: string;
  expiresAt?: string;
  lastLogin?: string;
  onboardingCompleted?: boolean;
}

export interface SessionUser extends ValidatedUser {
  onboardingCompleted: boolean;
  sessionToken: string;
  deviceFingerprint: string;
  deviceName: string;
}

export interface AuthCredentials {
  email?: string;
  username?: string;
  password?: string;
  licenseKey?: string;
  fullName?: string;
  forceTakeover?: boolean;
  [key: string]: unknown;
}

export interface AuthResult {
  success: boolean;
  user?: SessionUser;
  conflict?: boolean;
  activeDevice?: string;
  error?: string;
}

export interface HeartbeatOptions {
  userId: string;
  sessionToken: string;
  deviceFingerprint: string;
}

export interface DeviceInfo {
  deviceFingerprint: string;
  deviceName: string;
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'user';
  tier: string;
  licenseKey: string;
  status: 'active' | 'suspended';
  appsCount: number;
  createdAt: string;
  expiresAt?: string;
  lastLogin?: string;
}

export interface AdminCreateUserInput {
  email?: string;
  fullName?: string;
  password?: string;
  tier?: string;
  role?: string;
  licenseKey?: string;
  [key: string]: unknown;
}

export interface IdStatusInput {
  id: number | string;
  status: string;
}

export interface BillingRecord {
  id: string;
  userEmail: string;
  amount: string;
  plan: string;
  status: 'paid' | 'pending' | 'refunded';
  paymentMethod: string;
  createdAt: string;
}

export interface BillingRecordInput {
  userEmail?: string;
  amount?: string;
  plan?: string;
  paymentMethod?: string;
  [key: string]: unknown;
}

export interface AdminMetrics {
  totalUsers: number;
  activeUsers: number;
  totalApps: number;
  totalRevenue: string;
  mrr: string;
  trialUsers: number;
  proUsers: number;
  maxUsers: number;
  lifetimeUsers: number;
}

export interface AssignPlanInput {
  userId: string | number;
  email?: string;
  planTier: string;
  expiresAt?: string;
}

/** Mirrors automation's `AutoApplyStatusEvent` (status pill + new form-engine detail). */
export interface AutoApplyStatusEvent {
  phase: string;
  message: string;
  colorState: 'grey' | 'green' | 'red';
  progress?: number;
  actionRequired?: string;
  /** Structured FormEngine event behind this status (new engine only). */
  formEvent?: FormEngineEvent;
  /** Final fill report, attached to the closing event of a run (new engine only). */
  report?: FillReport;
}

export interface AutoApplyProgressEvent {
  log: string;
  progress?: number;
  statusEvent: AutoApplyStatusEvent;
  /** Application the event belongs to (batch pre-fill and submit). */
  url?: string;
  /** Batch pre-fill: the finished snapshot for `url`, sent as soon as that form is filled. */
  snapshot?: BatchSnapshot;
}

/** A field the candidate must answer themselves (from `ApplyResult.needsUser`). */
export interface NeedsUserField {
  label: string;
  reason: string;
  required: boolean;
}

export interface OAuthCallbackPayload {
  success: boolean;
  user?: SessionUser;
  error?: string;
}

// ── Invoke channels (renderer -> main, request/response) ───────────────────

interface Channel<A extends unknown[], R> {
  args: A;
  result: R;
}

export interface IpcChannels {
  // system / settings
  'check-dependencies': Channel<[], DependencyStatus>;
  'install-dependencies': Channel<[], SuccessResult>;
  'test-groq-key': Channel<[key: string], SuccessResult>;
  'open-external-url': Channel<[url: string], SuccessResult>;
  'check-for-updates': Channel<[], AppUpdateInfo>;
  'download-update': Channel<[downloadUrl?: string], SuccessResult & { filePath?: string; openedBrowser?: boolean }>;
  'install-update': Channel<[installerPath?: string], SuccessResult>;

  // profile & resumes
  'get-master-profile': Channel<[], MasterProfileRow | null>;
  'save-master-profile': Channel<[profile: Record<string, unknown>], SuccessResult>;
  'get-resumes': Channel<[], ResumeRecord[]>;
  'save-resume': Channel<[resume: ResumeInput], SuccessResult>;
  'delete-resume': Channel<[id: number], SuccessResult>;
  'set-default-resume': Channel<[id: number], SuccessResult>;
  'pick-resume-file': Channel<[], PickResumeFileResult>;

  // feed & saved jobs
  'run-scrapers': Channel<[], { success: boolean; jobs: FeedJob[]; error?: string }>;
  'get-cloud-feed-page': Channel<[options?: CloudFeedPageOptions], { success: boolean; jobs: FeedJob[]; totalCount: number }>;
  'get-cloud-feed': Channel<[userId?: string], { success: boolean; jobs: FeedJob[]; error?: string }>;
  'get-saved-jobs': Channel<[], SavedJob[]>;
  'save-job': Channel<[job: SaveJobInput], SuccessResult>;
  'remove-saved-job': Channel<[applyUrl: string], SuccessResult>;

  // applications & auto-apply
  'get-applications': Channel<[], ApplicationRow[]>;
  'update-application-status': Channel<[data: IdStatusInput], { success: boolean }>;
  'delete-application': Channel<[id: number | string], { success: boolean }>;
  'save-application': Channel<[app: ApplicationInput], SuccessResult & { id?: number }>;
  'launch-semi-auto': Channel<[jobUrls: string[]], SuccessResult>;
  'launch-autonomous': Channel<[jobUrls: string[]], AutonomousApplyResult>;
  'cancel-autonomous-apply': Channel<[], { success: boolean }>;
  'start-batch-copilot': Channel<[targets: BatchTarget[], options?: BatchStartOptions], SuccessResult & { snapshots?: BatchSnapshot[]; cancelled?: boolean }>;
  /** Submits only the reviewed snapshot ids (all held forms when `ids` is omitted). */
  'submit-all-batch-copilot': Channel<[overrides?: BatchOverrides, ids?: string[]], BatchSubmitResult>;

  // outreach
  'verify-email': Channel<[email: string], EmailVerification>;
  'get-hr-contacts': Channel<[targetRole?: string], { success: boolean; contacts: HrContact[] }>;
  'send-outreach': Channel<[contacts: OutreachRecipient[]], OutreachResult>;
  'generate-ai-outreach-email': Channel<[params: AiOutreachEmailParams], { success: boolean; subject: string; body: string }>;

  // assistant
  'ask-nomadic-assistant': Channel<[data: AssistantRequest], AssistantReply>;

  // learner hub
  'get-learner-progress': Channel<[roadmapId: string], LearnerProgress | null>;
  'save-learner-progress': Channel<[progress: LearnerProgressInput], { success: boolean }>;
  'generate-ai-onboarding-profile': Channel<[params: OnboardingProfileParams], { success: boolean; profile?: AiJson; roadmap?: AiJson }>;
  'generate-custom-roadmap': Channel<[params: CustomRoadmapParams], { success: boolean; roadmap?: AiJson }>;
  'get-custom-roadmaps': Channel<[], CustomRoadmapRecord[]>;
  'save-custom-roadmap': Channel<[roadmap: CustomRoadmapInput], { success: boolean }>;
  'delete-custom-roadmap': Channel<[id: string], { success: boolean }>;
  'get-activity-heatmap': Channel<[days?: number], ActivityHeatmapDay[]>;
  'log-user-activity': Channel<[params: { activityType: string; details?: string }], { success: boolean }>;
  'get-activity-stats': Channel<[], ActivityStats>;
  'evaluate-interview-answer': Channel<[params: InterviewAnswerParams], InterviewEvaluation>;
  'get-recommended-resources-for-job': Channel<[params: RecommendedResourcesParams], CuratedResource[]>;

  // auth & session
  'auth-google': Channel<[], SuccessResult>;
  'auth-login': Channel<[credentials: AuthCredentials], AuthResult>;
  'auth-signup': Channel<[credentials: AuthCredentials], AuthResult>;
  'start-heartbeat': Channel<[opts: HeartbeatOptions], { success: boolean }>;
  'stop-heartbeat': Channel<[], { success: boolean }>;
  'sync-cloud-data': Channel<[], SuccessResult & { pulled?: boolean }>;
  'get-device-info': Channel<[], DeviceInfo>;

  // admin
  'admin-get-users': Channel<[], AdminUser[]>;
  'admin-create-user': Channel<[user: AdminCreateUserInput], SuccessResult & { id?: string }>;
  'admin-update-user-status': Channel<[data: IdStatusInput], SuccessResult>;
  'admin-delete-user': Channel<[id: number | string], SuccessResult>;
  'admin-get-billing': Channel<[], BillingRecord[]>;
  'admin-create-billing-record': Channel<[record: BillingRecordInput], SuccessResult>;
  'admin-get-metrics': Channel<[], AdminMetrics>;
  'admin-assign-plan': Channel<[data: AssignPlanInput], { success: boolean }>;
  'admin-get-learning-resources': Channel<[], CuratedResource[]>;
  'admin-add-learning-resource': Channel<[resource: CuratedResourceInput], { success: boolean; id?: number }>;
  'admin-delete-learning-resource': Channel<[id: number | string], { success: boolean }>;
}

export type ChannelName = keyof IpcChannels;
export type ChannelArgs<C extends ChannelName> = IpcChannels[C]['args'];
export type ChannelResult<C extends ChannelName> = IpcChannels[C]['result'];

/** Runtime list of every invoke channel (kept in sync with `IpcChannels` by the type below). */
export const IPC_CHANNELS = [
  'check-dependencies', 'install-dependencies', 'test-groq-key', 'open-external-url',
  'check-for-updates', 'download-update', 'install-update',
  'get-master-profile', 'save-master-profile', 'get-resumes', 'save-resume', 'delete-resume',
  'set-default-resume', 'pick-resume-file',
  'run-scrapers', 'get-cloud-feed-page', 'get-cloud-feed', 'get-saved-jobs', 'save-job', 'remove-saved-job',
  'get-applications', 'update-application-status', 'delete-application', 'save-application',
  'launch-semi-auto', 'launch-autonomous', 'cancel-autonomous-apply', 'start-batch-copilot',
  'submit-all-batch-copilot',
  'verify-email', 'get-hr-contacts', 'send-outreach', 'generate-ai-outreach-email',
  'ask-nomadic-assistant',
  'get-learner-progress', 'save-learner-progress', 'generate-ai-onboarding-profile',
  'generate-custom-roadmap', 'get-custom-roadmaps', 'save-custom-roadmap', 'delete-custom-roadmap',
  'get-activity-heatmap', 'log-user-activity', 'get-activity-stats', 'evaluate-interview-answer',
  'get-recommended-resources-for-job',
  'auth-google', 'auth-login', 'auth-signup', 'start-heartbeat', 'stop-heartbeat', 'sync-cloud-data',
  'get-device-info',
  'admin-get-users', 'admin-create-user', 'admin-update-user-status', 'admin-delete-user',
  'admin-get-billing', 'admin-create-billing-record', 'admin-get-metrics', 'admin-assign-plan',
  'admin-get-learning-resources', 'admin-add-learning-resource', 'admin-delete-learning-resource',
] as const satisfies readonly ChannelName[];

// Compile-time proof that IPC_CHANNELS lists every channel exactly.
type MissingChannels = Exclude<ChannelName, (typeof IPC_CHANNELS)[number]>;
const _allChannelsListed: [MissingChannels] extends [never] ? true : MissingChannels = true;
void _allChannelsListed;

// ── Push events (main -> renderer) ──────────────────────────────────────────

export interface IpcEvents {
  log: string;
  'heartbeat-status': HeartbeatStatus;
  'auto-apply-progress': AutoApplyProgressEvent;
  'update-download-progress': number;
  'oauth-callback': OAuthCallbackPayload;
}

export type EventName = keyof IpcEvents;

// ── Preload-exposed API (`window.api` / `window.electronAPI`) ──────────────

type Invoke<C extends ChannelName> = (...args: ChannelArgs<C>) => Promise<ChannelResult<C>>;
type Subscribe<E extends EventName> = (callback: (payload: IpcEvents[E]) => void) => () => void;

export interface NomadicApi {
  getMasterProfile: Invoke<'get-master-profile'>;
  saveMasterProfile: Invoke<'save-master-profile'>;
  getResumes: Invoke<'get-resumes'>;
  saveResume: Invoke<'save-resume'>;
  deleteResume: Invoke<'delete-resume'>;
  setDefaultResume: Invoke<'set-default-resume'>;
  pickResumeFile: Invoke<'pick-resume-file'>;
  runScrapers: Invoke<'run-scrapers'>;
  getCloudFeed: Invoke<'get-cloud-feed'>;
  getCloudFeedPage: Invoke<'get-cloud-feed-page'>;
  launchSemiAuto: Invoke<'launch-semi-auto'>;
  launchAutonomous: Invoke<'launch-autonomous'>;
  cancelAutonomousApply: Invoke<'cancel-autonomous-apply'>;
  startBatchCoPilot: Invoke<'start-batch-copilot'>;
  submitAllBatchCoPilot: Invoke<'submit-all-batch-copilot'>;
  verifyEmail: Invoke<'verify-email'>;
  getHrContacts: Invoke<'get-hr-contacts'>;
  sendOutreach: Invoke<'send-outreach'>;
  getApplications: Invoke<'get-applications'>;
  saveApplication: Invoke<'save-application'>;
  getSavedJobs: Invoke<'get-saved-jobs'>;
  saveJob: Invoke<'save-job'>;
  removeSavedJob: Invoke<'remove-saved-job'>;
  checkDependencies: Invoke<'check-dependencies'>;
  installDependencies: Invoke<'install-dependencies'>;
  testGroqKey: Invoke<'test-groq-key'>;
  startHeartbeat: (userId: string, sessionToken: string, deviceFingerprint: string) => Promise<ChannelResult<'start-heartbeat'>>;
  stopHeartbeat: Invoke<'stop-heartbeat'>;
  syncCloudData: Invoke<'sync-cloud-data'>;
  getDeviceInfo: Invoke<'get-device-info'>;
  onLog: Subscribe<'log'>;
  onHeartbeatStatus: Subscribe<'heartbeat-status'>;
  onAutoApplyProgress: Subscribe<'auto-apply-progress'>;
  openExternalUrl: Invoke<'open-external-url'>;

  askNomadicAssistant: Invoke<'ask-nomadic-assistant'>;
  generateAiOutreachEmail: Invoke<'generate-ai-outreach-email'>;
  generateAiOnboardingProfile: Invoke<'generate-ai-onboarding-profile'>;
  generateCustomRoadmap: Invoke<'generate-custom-roadmap'>;
  getCustomRoadmaps: Invoke<'get-custom-roadmaps'>;
  saveCustomRoadmap: Invoke<'save-custom-roadmap'>;
  deleteCustomRoadmap: Invoke<'delete-custom-roadmap'>;

  getActivityHeatmap: Invoke<'get-activity-heatmap'>;
  logUserActivity: (activityType: string, details?: string) => Promise<ChannelResult<'log-user-activity'>>;
  getActivityStats: Invoke<'get-activity-stats'>;

  getLearnerProgress: Invoke<'get-learner-progress'>;
  saveLearnerProgress: Invoke<'save-learner-progress'>;

  updateApplicationStatus: (id: number | string, status: string) => Promise<ChannelResult<'update-application-status'>>;
  deleteApplication: Invoke<'delete-application'>;

  evaluateInterviewAnswer: Invoke<'evaluate-interview-answer'>;

  authLogin: Invoke<'auth-login'>;
  authSignup: Invoke<'auth-signup'>;
  authGoogle: Invoke<'auth-google'>;
  onOauthCallback: Subscribe<'oauth-callback'>;
  adminGetUsers: Invoke<'admin-get-users'>;
  adminCreateUser: Invoke<'admin-create-user'>;
  adminUpdateUserStatus: (id: number | string, status: string) => Promise<ChannelResult<'admin-update-user-status'>>;
  adminDeleteUser: Invoke<'admin-delete-user'>;
  adminAssignPlan: Invoke<'admin-assign-plan'>;
  adminGetLearningResources: Invoke<'admin-get-learning-resources'>;
  adminAddLearningResource: Invoke<'admin-add-learning-resource'>;
  adminDeleteLearningResource: Invoke<'admin-delete-learning-resource'>;
  getRecommendedResourcesForJob: Invoke<'get-recommended-resources-for-job'>;
  adminGetBilling: Invoke<'admin-get-billing'>;
  adminCreateBillingRecord: Invoke<'admin-create-billing-record'>;
  adminGetMetrics: Invoke<'admin-get-metrics'>;

  checkForUpdates: Invoke<'check-for-updates'>;
  downloadUpdate: Invoke<'download-update'>;
  installUpdate: Invoke<'install-update'>;
  onUpdateDownloadProgress: Subscribe<'update-download-progress'>;
}

import type {
  AutoApplyProgressEvent, BatchOverrides, BatchSnapshot, BatchStartOptions, BatchSubmitResult, BatchTarget, CheckoutResult, EntitlementsResult, NomadicApi,
  LearningEventInput, LearningEventRecord, LearningGoal, LearningGoalInput, LearningState, LearningSyncResult,
} from '../shared/ipc';

export type { LearningEventInput, LearningEventRecord, LearningGoal, LearningGoalInput, LearningState, LearningSyncResult };

export type WorkspaceMode = 'learner_only' | 'seeker_only' | 'unified';
export type OpportunityType = 'job' | 'internship' | 'both';

export interface MasterProfile {
  id?: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  linkedin: string;
  github: string;
  sponsorship: string;
  desiredSalary: string;
  noticePeriod: string;
  groqApiKey?: string;
  geminiApiKey?: string;
  claudeApiKey?: string;
  hunterApiKey?: string;
  sendgridApiKey?: string;
  smtpPassword?: string;
  resumeText: string;
  resumeFilePath?: string;
  desiredTitle?: string;
  techStack?: string;
  autoApplyDelay?: number;
  saveScreenshots?: boolean;
  emailTone?: 'professional' | 'casual' | 'confident';
  emailSignature?: string;
  syncFrequency?: string;
  customAnswers: Record<string, string>;
  onboardingCompleted?: boolean;
  workplaceType?: 'remote' | 'hybrid' | 'onsite';
  experienceLevel?: 'entry' | 'mid' | 'senior';
  workspaceMode?: WorkspaceMode;
  targetOpportunityType?: OpportunityType;
  askBeforeSubmit?: boolean;
}

export interface Job {
  id?: number | string;
  title: string;
  company: string;
  applyUrl: string;
  location?: string;
  salary?: string;
  source?: string;
  score?: number;
  matchedSkills?: string[];
  tags?: string[];
  description?: string;
  employmentType?: 'job' | 'internship';
  workplaceType?: 'remote' | 'hybrid' | 'onsite';
  experienceLevel?: 'entry' | 'mid' | 'senior';
  createdAt?: string;
  jobHash?: string;
}

export interface ApplicationStatusEvent {
  status: string;
  /** ISO-8601, or SQLite `YYYY-MM-DD HH:MM:SS` (UTC) on older rows. */
  changed_at: string;
}

export interface Application {
  id?: number;
  company: string;
  title: string;
  /** Posting URL, or a `manual:` sync key for entries logged without a link. */
  apply_url: string;
  status: string;
  mode: string;
  applied_at: string;
  created_at?: string;
  updated_at?: string | null;
  notes?: string;
  /** Append-only status history, oldest first. */
  history?: ApplicationStatusEvent[];
}

export interface OutreachContact {
  email: string;
  name?: string;
  company?: string;
  role?: string;
  department?: 'Engineering' | 'Talent Acquisition' | 'Product' | 'Executive' | string;
  verificationStatus?: 'valid' | 'invalid' | 'pending' | 'risky' | 'catch-all';
  sentStatus?: 'unsent' | 'sent' | 'failed' | 'drafted';
  sentAt?: string;
  verifiedAt?: string;
  isTargetCompany?: boolean;
  matchScore?: number;
  linkedinUrl?: string;
}

export interface CuratedResource {
  id: number;
  title: string;
  youtubeUrl: string;
  topic: string;
  targetRole: string;
  summary: string;
  duration: string;
  createdAt?: string;
}

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

export type PersonaTrack = 'learner' | 'seeker';

export type TabType =
  | 'home'
  | 'feed'
  | 'applications'
  | 'outreach'
  | 'profile'
  | 'opportunities'
  | 'learner-roadmaps'
  | 'learner-resources'
  | 'learner-interview-prep'
  | 'learner-vault'
  | 'learner-drills'
  | 'admin-overview'
  | 'logs'
  | 'settings'
  | 'account';

export type ThemeMode = 'dark' | 'light' | 'system';

export interface ResumeRecord {
  id: number;
  name: string;
  targetRole: string;
  filePath: string;
  isDefault: boolean;
  createdAt?: string;
}

export type SubscriptionTier = 'free' | 'pro' | 'max';

export interface AppUser {
  id: number | string;
  email: string;
  fullName: string;
  role: 'admin' | 'user';
  tier: SubscriptionTier | string;
  subscription_tier?: string;
  licenseKey?: string;
  status: 'active' | 'suspended';
  appsCount: number;
  createdAt: string;
  expiresAt?: string;
  lastLogin?: string;
  onboardingCompleted?: boolean;
}


export interface AppUpdateInfo {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseName?: string;
  releaseNotes?: string;
  downloadUrl?: string;
}

export interface ElectronAPI {
  getMasterProfile: () => Promise<Record<string, unknown> | null>;
  saveMasterProfile: (data: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
  /** Not exposed by the current preload; callers must feature-check before use. */
  updateMasterProfile?: (data: Partial<MasterProfile>) => Promise<{ success: boolean; error?: string }>;
  getResumes: () => Promise<ResumeRecord[]>;
  saveResume: (resume: { name: string; targetRole: string; filePath: string; isDefault: boolean }) =>
    Promise<{ success: boolean; id?: number; error?: string }>;
  deleteResume: (id: number) => Promise<{ success: boolean; error?: string }>;
  setDefaultResume: (id: number) => Promise<{ success: boolean; error?: string }>;
  pickResumeFile: () => Promise<{ canceled: boolean; filePath?: string; fileName?: string }>;
  runScrapers: () => Promise<{ success: boolean; jobs: Job[]; error?: string }>;
  getCloudFeed: (userId: string) => Promise<{ success: boolean; jobs: Job[]; error?: string }>;
  getCloudFeedPage?: (options?: { page?: number; pageSize?: number; search?: string; filterTab?: string; source?: string }) => Promise<{ success: boolean; jobs: Job[]; totalCount?: number; error?: string }>;
  launchSemiAuto: (jobUrls: string[]) => Promise<{ success: boolean; error?: string; incompleteProfile?: boolean }>;
  launchAutonomous: (jobUrls: string[]) => Promise<{
    success: boolean;
    applied?: number;
    skipped?: number;
    totalBatches?: number;
    limitReached?: boolean;
    incompleteProfile?: boolean;
    currentUsage?: number;
    maxAllowed?: number;
    error?: string;
  }>;
  cancelAutonomousApply?: () => Promise<{ success: boolean }>;
  /** Fills each form for review and holds it open; never submits. */
  startBatchCoPilot?: (targets: BatchTarget[], options?: BatchStartOptions) => Promise<{ success: boolean; snapshots?: BatchSnapshot[]; cancelled?: boolean; error?: string }>;
  /** Submits only the reviewed snapshot ids, writing the reviewed values first. */
  submitAllBatchCoPilot?: (overrides?: BatchOverrides, ids?: string[]) => Promise<BatchSubmitResult>;
  /** Plan, limits and today's usage from the server (cached briefly in main). */
  getEntitlements?: (options?: { fresh?: boolean }) => Promise<EntitlementsResult>;
  /** Opens Razorpay checkout for a paid plan in the browser. */
  startCheckout?: (plan: 'pro' | 'max') => Promise<CheckoutResult>;
  verifyEmail: (email: string) => Promise<{ isValid: boolean; stageFailed?: number; reason?: string }>;
  getHrContacts: (targetRole?: string) => Promise<{ success: boolean; contacts: OutreachContact[]; error?: string }>;
  sendOutreach: (contacts: Array<{ email: string; name?: string; company?: string; role?: string; subject?: string; body?: string }>) =>
    Promise<{ success: boolean; sent?: number; mode?: string; error?: string }>;
  startHeartbeat: (userId: string, sessionToken: string, deviceFingerprint: string) =>
    Promise<{ success: boolean }>;
  stopHeartbeat: () => Promise<{ success: boolean }>;
  syncCloudData: () => Promise<{ success: boolean; pulled?: boolean; error?: string }>;
  getDeviceInfo: () => Promise<{ deviceFingerprint: string; deviceName: string }>;
  onHeartbeatStatus: (callback: (status: HeartbeatStatus) => void) => () => void;
  checkDependencies: () => Promise<DependencyStatus>;
  installDependencies: () => Promise<{ success: boolean; error?: string }>;
  testGroqKey: (key: string) => Promise<{ success: boolean; error?: string }>;
  onLog: (callback: (msg: string) => void) => () => void;
  onAutoApplyProgress?: (callback: (data: AutoApplyProgressEvent) => void) => () => void;
  getApplications: () => Promise<Application[]>;
  saveApplication: (app: { company: string; title: string; apply_url?: string; status?: string; mode?: string; notes?: string }) =>
    Promise<{ success: boolean; id?: number; error?: string }>;
  updateApplicationStatus: (id: number | string, status: string) => Promise<{ success: boolean; error?: string; application?: Application }>;
  updateApplicationNotes: (id: number | string, notes: string) => Promise<{ success: boolean; error?: string; application?: Application }>;
  deleteApplication: (id: number | string) => Promise<{ success: boolean; error?: string }>;
  getSavedJobs: () => Promise<Job[]>;
  saveJob: (job: Job) => Promise<{ success: boolean; error?: string }>;
  removeSavedJob: (applyUrl: string) => Promise<{ success: boolean; error?: string }>;
  openExternalUrl: (url: string) => Promise<{ success: boolean; error?: string }>;

  // AI Generation & Assistant Handlers
  askNomadicAssistant?: (data: { message: string; history?: Array<{ sender: string; text: string }> }) =>
    Promise<{ success: boolean; reply: string; action?: { type: string; target?: string; payload?: Record<string, any> }; error?: string }>;
  generateAiOutreachEmail: (params: {
    role?: string;
    company?: string;
    recipientName?: string;
    tone?: string;
    skills?: string;
    candidateName?: string;
  }) => Promise<{
    success: boolean;
    subject?: string;
    body?: string;
    error?: string;
  }>;
  // Learn: goal and append-only learning events (local SQLite, synced to Supabase)
  learningGetState: () => Promise<LearningState>;
  learningSaveGoal: (goal: LearningGoalInput) => Promise<{ success: boolean; goal?: LearningGoal; error?: string }>;
  learningRecordEvents: (events: LearningEventInput[]) => Promise<{ success: boolean; events?: LearningEventRecord[]; error?: string }>;
  learningSync: () => Promise<LearningSyncResult>;

  // Auth Handlers
  authLogin: (credentials: {
    username?: string;
    email?: string;
    password?: string;
    licenseKey?: string;
    forceTakeover?: boolean;
    oauthToken?: boolean;
    tier?: 'trial' | 'pro' | 'max' | 'lifetime';
    role?: 'admin' | 'user';
    fullName?: string;
  }) => Promise<{
    success: boolean;
    conflict?: boolean;
    activeDevice?: string;
    user?: AppUser;
    error?: string;
  }>;
  authSignup?: (credentials: {
    email: string;
    password?: string;
    fullName?: string;
  }) => Promise<{
    success: boolean;
    user?: AppUser;
    error?: string;
  }>;
  authGoogle: (options?: { forceTakeover?: boolean }) => Promise<{ success: boolean; error?: string }>;
  // Password reset and email verification (019). Optional so older test doubles and builds keep working.
  authRequestPasswordReset?: NomadicApi['authRequestPasswordReset'];
  authConfirmPasswordReset?: NomadicApi['authConfirmPasswordReset'];
  authSendVerification?: NomadicApi['authSendVerification'];
  authConfirmVerification?: NomadicApi['authConfirmVerification'];
  authVerificationStatus?: NomadicApi['authVerificationStatus'];
  onOauthCallback: (callback: (url: string) => void) => () => void;
  // Admin tools (F12): session-checked RPCs; the server re-checks the admin role on every call.
  adminListUsers: NomadicApi['adminListUsers'];
  adminSetUserPlan: NomadicApi['adminSetUserPlan'];
  adminSetUserStatus: NomadicApi['adminSetUserStatus'];
  adminListAudit: NomadicApi['adminListAudit'];
  adminScrapeHealth: NomadicApi['adminScrapeHealth'];
  adminListContent: NomadicApi['adminListContent'];
  adminUpdateLesson: NomadicApi['adminUpdateLesson'];
  adminSetResourceStatus: NomadicApi['adminSetResourceStatus'];
  adminContentHistory: NomadicApi['adminContentHistory'];
  // Practice (F8)
  practiceGetCatalog: NomadicApi['practiceGetCatalog'];
  practiceGetState: NomadicApi['practiceGetState'];
  practiceRecordAttempt: NomadicApi['practiceRecordAttempt'];


  // In-App Updates
  checkForUpdates?: () => Promise<AppUpdateInfo>;
  downloadUpdate?: (downloadUrl?: string) => Promise<{ success: boolean; filePath?: string; openedBrowser?: boolean; error?: string }>;
  installUpdate?: (installerPath?: string) => Promise<{ success: boolean; error?: string }>;
  onUpdateDownloadProgress?: (cb: (pct: number) => void) => () => void;
}

declare global {
  interface Window {
    api?: ElectronAPI;
    electronAPI?: ElectronAPI;
  }
}

import { createBrowserApiShim } from './browserApiShim';

let browserShimInstance: ElectronAPI | null = null;

export function getApi(): ElectronAPI {
  if (typeof window !== 'undefined') {
    if (window.api) return window.api;
    if (window.electronAPI) return window.electronAPI;
  }
  if (!browserShimInstance) {
    browserShimInstance = createBrowserApiShim();
  }
  return browserShimInstance;
}

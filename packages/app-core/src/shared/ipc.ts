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
import type {
  AdminAuditPage, AdminAuditQuery, AdminChangeResult, AdminContentHistoryQuery, AdminContentList, AdminContentQuery,
  AdminContentVersion, AdminLessonUpdate, AdminResourceStatusUpdate, AdminResult, AdminSetPlanInput, AdminSetStatusInput,
  AdminStatusChangeResult, AdminUserQuery, AdminUsersPage, AdminVersionResult, ScrapeHealth,
} from './admin.js';

export type { AnswerSource, FieldKind, FillReport, FormEngineEvent };

import type {
  FillInItem,
  IntakeInput,
  McqItem,
  OrderingItem,
  PracticeAttempt,
  PracticeDifficulty,
  PracticeEntryKind,
  ProblemNote,
  RepoCheck,
  Roadmap,
  RoadmapDiff,
  RoleFamilyId,
  Schedule,
  Shortfall,
  UserProject,
} from '@job-automator/learning';

export type { PracticeAttempt };

// ── Shared payload shapes ───────────────────────────────────────────────────

export interface SuccessResult {
  success: boolean;
  error?: string;
}

/** `open-in-apply-browser`: `browser` names the browser the page opened in (e.g. "Google Chrome"). */
export interface OpenInApplyBrowserResult extends SuccessResult {
  browser?: string;
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
  /** True when the server rejected the session; false/absent for network errors. */
  ended?: boolean;
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

/** Reads a saved resume (`resumeId`) or, without one, a PDF/TXT the user picks (e.g. a LinkedIn "Save to PDF"). */
export interface DocumentTextInput {
  resumeId?: number;
}

export interface DocumentTextResult {
  success: boolean;
  text?: string;
  fileName?: string;
  canceled?: boolean;
  error?: string;
}

/** Facts the AI may draft from; nothing else about the candidate is sent. */
export interface DraftAnswersInput {
  /** Ids from `APP_ANSWERS` (shared/applicationAnswers.ts) that allow AI drafts. */
  ids: string[];
  candidate: {
    name?: string;
    desiredTitle?: string;
    skills?: string;
    location?: string;
    /** Resume and LinkedIn text. */
    documentText?: string;
  };
}

export interface DraftAnswersResult {
  success: boolean;
  /** Drafts by id; ids the AI could not answer from the facts are left out. */
  answers?: Record<string, string>;
  code?: AiErrorCode;
  error?: string;
}

export interface RememberedAnswer {
  key: string;
  answer: string;
  createdAt: string;
}

export interface RememberedAnswerUpdate {
  key: string;
  /** null forgets the answer. */
  answer: string | null;
}

/**
 * News page (Home): hiring updates per company, company news from Indian publishers (hiring plans, campus drives,
 * layoffs, funding, expansion) and upcoming hackathons and contests, each from a real source with a link.
 */
export type NewsKind = 'hiring' | 'update' | 'hackathon';
export type NewsSourceState = 'ok' | 'not_ready' | 'error';
export type NewsTopic = 'hiring' | 'campus' | 'layoffs' | 'funding' | 'expansion';

export interface NewsItem {
  id: string;
  kind: NewsKind;
  /** The headline for company news; a line built from the counts for hiring items. */
  title: string;
  /** One line of facts from the source ("3 internships · 5 entry level", "Sept–Dec · 1,200 freshers"); null when none. */
  detail: string | null;
  /** Company name for hiring items and company news (opens the job board filtered to it). */
  company: string | null;
  /** Where the facts come from. */
  url: string;
  sourceLabel: string;
  /** When: the snapshot day, the newest posting, the article date, or the event start. */
  at: string | null;
  /** Hiring: roles new since the last check (null = not known). */
  newRoles?: number | null;
  /** Company news: what the article is about. */
  topic?: NewsTopic;
  /** Hackathons and contests. */
  eventKind?: 'hackathon' | 'contest';
  startsAt?: string | null;
  endsAt?: string | null;
  registrationEndsAt?: string | null;
  mode?: 'online' | 'in_person' | 'hybrid' | 'unknown';
  city?: string | null;
}

export interface NewsResult {
  success: boolean;
  items: NewsItem[];
  /** Per source: 'not_ready' when its table is not published yet (migration 031/033 not applied or never scraped). */
  sources: { snapshots: NewsSourceState; jobs: NewsSourceState; hackathons: NewsSourceState; articles?: NewsSourceState };
  fetchedAt: string;
  error?: string;
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

/** A job the user marked "Not interested"; hidden from the feed until restored. */
export interface HiddenJob {
  applyUrl: string;
  title: string;
  company: string;
  hiddenAt: string;
}

export interface HideJobInput {
  applyUrl: string;
  title?: string;
  company?: string;
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

/** Statuses a person can move an application to (the apply engine also writes others, e.g. `failed`). */
export const USER_APPLICATION_STATUSES = ['applied', 'interviewing', 'offered', 'rejected', 'withdrawn'] as const;
export type UserApplicationStatus = (typeof USER_APPLICATION_STATUSES)[number];

/** Prefix of the sync key stored in `apply_url` for applications logged without a link. */
export const MANUAL_APPLICATION_KEY_PREFIX = 'manual:';

/** One entry of an application's append-only status history. */
export interface ApplicationStatusEvent {
  status: string;
  /** ISO-8601 (older rows may use SQLite `YYYY-MM-DD HH:MM:SS`, UTC). */
  changed_at: string;
}

/** A `local_applications` row with its notes and status history. */
export interface ApplicationRecord {
  id: number;
  company: string;
  title: string;
  /** Posting URL, or a `manual:` sync key when none was given. */
  apply_url: string;
  status: string;
  mode: string | null;
  applied_at: string;
  updated_at: string | null;
  notes: string;
  /** Follow-up reminder date (YYYY-MM-DD) kept on this computer; null when none. */
  follow_up_at: string | null;
  history: ApplicationStatusEvent[];
}

/** @deprecated use ApplicationRecord */
export type ApplicationRow = ApplicationRecord;

export interface ApplicationInput {
  company: string;
  title: string;
  /** Optional for manual entries; a `manual:` key is generated when missing. */
  apply_url?: string;
  status?: string;
  mode?: string;
  notes?: string;
}

export interface ApplicationNotesInput {
  id: number | string;
  notes: string;
}

export interface ApplicationFollowUpInput {
  id: number | string;
  /** YYYY-MM-DD, or null to clear. */
  followUpAt: string | null;
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
  /** The server refused (part of) the run because today's apply limit is used up. */
  limitReached?: boolean;
  /** Applications still allowed today after this run (null = unlimited, undefined = unknown). */
  appliesRemaining?: number | null;
}

// ── Billing / entitlements (F9, migration 011) ───────────────────────────────
// Unlimited limits are null. Everything here comes from the server
// (get_entitlements); the client never decides a limit.
export type BillingPlanId = 'free' | 'pro' | 'max';

export interface Entitlements {
  plan: BillingPlanId;
  /** Raw users_profile.subscription_tier (e.g. 'trial', 'pro'). */
  storedTier: string | null;
  accountStatus: 'active' | 'expired' | 'suspended';
  /** Paid period end (renewal or expiry), ISO-8601. */
  expiresAt: string | null;
  limits: {
    appliesPerDay: number | null;
    feedJobs: number | null;
    learnTracks: number | null;
    practicePerDay: number | null;
    autonomousApply: boolean;
    resumes: number | null;
  };
  usage: { appliesToday: number; learnTracksActive: number };
  appliesRemaining: number | null;
  /** When today's counters reset (Asia/Kolkata midnight), ISO-8601. */
  resetsAt: string | null;
  fetchedAt: string;
}

export type EntitlementsErrorCode = 'signed_out' | 'unauthorized' | 'offline';

export type EntitlementsResult =
  | { success: true; entitlements: Entitlements }
  | { success: false; code: EntitlementsErrorCode; error: string };

/** One captured payment from the server (migration 025), newest first. */
export interface PaymentRecord {
  paymentId: string;
  plan: Exclude<BillingPlanId, 'free'> | 'lifetime';
  amountInr: number | null;
  status: 'captured' | 'failed' | 'refunded';
  paidAt: string | null;
}

export type PaymentHistoryResult =
  | { success: true; payments: PaymentRecord[] }
  | { success: false; code: EntitlementsErrorCode; error: string };

export interface CheckoutResult extends SuccessResult {
  /** No checkout page is configured in this build; the dialog offers the manual route. */
  notConfigured?: boolean;
}

/** Reviewed values per snapshot id, keyed by `BatchSnapshotField.fieldKey`. */
export type BatchOverrides = Record<string, Record<string, string>>;

// ── Outreach (F13, behind the `outreach` flag) ──────────────────────────────
// Everyone who can refer: recruiters, hiring managers, founders, employees, alumni and
// team inboxes. Directory rows come from public pages only (migration 027); messages are
// written locally, reviewed by the user and only then sent or opened.

export const OUTREACH_CONTACT_KINDS = ['recruiter', 'hiring_manager', 'founder', 'employee', 'alumni', 'team_inbox', 'unknown'] as const;
export type OutreachContactKind = (typeof OUTREACH_CONTACT_KINDS)[number];
export const OUTREACH_PURPOSES = ['referral', 'application_follow_up', 'introduction', 'follow_up'] as const;
export type OutreachPurpose = (typeof OUTREACH_PURPOSES)[number];
export type OutreachChannel = 'email' | 'linkedin';
export const OUTREACH_REPORT_REASONS = ['bounced', 'wrong_person', 'not_hiring', 'asked_to_stop', 'other'] as const;
export type OutreachReportReason = (typeof OUTREACH_REPORT_REASONS)[number];
export type OutreachMessageStatus = 'draft' | 'ready' | 'sent' | 'replied' | 'no_reply' | 'bounced';
export type OutreachSentVia = 'smtp' | 'gmail' | 'mailto' | 'linkedin' | 'manual';

export type OutreachErrorCode =
  | 'not_signed_in'
  | 'unauthorized'
  | 'account_suspended'
  | 'daily_limit'
  | 'bad_request'
  | 'network'
  | 'not_found'
  | 'not_reviewed'
  | 'placeholders'
  | 'send_limit'
  | 'smtp_not_configured'
  | 'smtp_failed';

/** A published directory row (outreach_list_contacts). Unknown stays null. */
export interface DirectoryContact {
  id: string;
  email: string;
  name: string | null;
  company: string;
  companyDomain: string | null;
  roleTitle: string | null;
  hiringFor: string | null;
  kind: OutreachContactKind;
  addressType: string | null;
  source: string;
  sourceUrl: string | null;
  sourceSnippet: string | null;
  jobUrl: string | null;
  location: string | null;
  remote: boolean | null;
  postedAt: string | null;
  mxOk: boolean | null;
  lastSeenAt: string | null;
}

export interface OutreachContactQuery {
  company?: string;
  query?: string;
  kinds?: OutreachContactKind[];
  limit?: number;
  offset?: number;
}

export type OutreachContactsResult =
  | { success: true; contacts: DirectoryContact[]; total: number; rowsLeftToday: number | null }
  | { success: false; code: OutreachErrorCode; error: string };

export interface OutreachReportInput {
  contactId: string;
  reason: OutreachReportReason;
  note?: string;
}

export interface OutreachResult {
  success: boolean;
  code?: OutreachErrorCode;
  error?: string;
}

/** Someone the user wants to reach, saved locally (from the directory or typed in). */
export interface OutreachPerson {
  id: number;
  name: string | null;
  email: string | null;
  linkedinUrl: string | null;
  company: string;
  roleTitle: string | null;
  kind: OutreachContactKind;
  contactId: string | null;
  sourceUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OutreachPersonInput {
  id?: number;
  name?: string | null;
  email?: string | null;
  linkedinUrl?: string | null;
  company: string;
  roleTitle?: string | null;
  kind: OutreachContactKind;
  contactId?: string | null;
  sourceUrl?: string | null;
  notes?: string | null;
}

export interface OutreachMessage {
  id: number;
  personId: number;
  channel: OutreachChannel;
  purpose: OutreachPurpose;
  jobTitle: string | null;
  jobUrl: string | null;
  subject: string;
  body: string;
  status: OutreachMessageStatus;
  reviewedAt: string | null;
  sentAt: string | null;
  sentVia: OutreachSentVia | null;
  applicationId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface OutreachMessageInput {
  id?: number;
  personId: number;
  channel: OutreachChannel;
  purpose: OutreachPurpose;
  jobTitle?: string | null;
  jobUrl?: string | null;
  subject: string;
  body: string;
}

export interface OutreachState {
  people: OutreachPerson[];
  messages: OutreachMessage[];
  /** Emails sent through SMTP today (local day) and the daily cap. */
  sentToday: number;
  sendLimit: number;
}

export interface OutreachOpenInput {
  id: number;
  via: 'gmail' | 'mailto' | 'linkedin';
}

export interface OutreachMarkInput {
  id: number;
  status: 'sent' | 'replied' | 'no_reply' | 'bounced';
}

export interface OutreachDraftInput {
  personId: number;
  channel: OutreachChannel;
  purpose: OutreachPurpose;
  jobTitle?: string | null;
  note?: string | null;
}

export type OutreachDraftResult =
  | { success: true; subject: string | null; body: string | null; quota: AiQuota | null }
  | { success: false; code: AiErrorCode | 'not_found'; error: string; quota?: AiQuota | null };

export interface OutreachSmtpSettings {
  configured: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  fromName: string;
}

export interface OutreachSmtpInput {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  /** Omit to keep the stored password. */
  password?: string;
  fromName?: string;
}

export type OutreachMessageResult = OutreachResult & { message?: OutreachMessage };

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

// ── Learn (append-only learning events + v2 roadmap, schedule, projects) ────

export const LEARNING_EVENT_TYPE_LIST = [
  'lesson_viewed', 'quiz_passed', 'quiz_failed', 'problem_solved', 'review_done', 'skill_marked_known',
  'task_done', 'task_skipped', 'task_moved', 'problem_attempted', 'stage_done', 'project_started', 'project_done',
  'roadmap_accepted',
] as const;
export type LearningEventTypeName = (typeof LEARNING_EVENT_TYPE_LIST)[number];

/** One learning event as stored locally and in Supabase (`learning_events`). */
export interface LearningEventRecord {
  id: string;
  user_id: string;
  type: LearningEventTypeName;
  skill_id: string | null;
  item_id: string | null;
  payload: Record<string, unknown>;
  duration_s: number;
  created_at: string;
}

/** What the renderer sends; the main process stamps `user_id`. */
export type LearningEventInput = Omit<LearningEventRecord, 'user_id'>;

/** A generated roadmap waiting for review (kept on this device until accepted). */
export interface LearnDraft {
  roadmap: Roadmap;
  /** The schedule the roadmap fits into (left-out work listed in `left_out`). */
  schedule: Schedule;
  /** "Built with the standard planner" and why, when the AI was not used. */
  notice: string | null;
  created_at: string;
}

export interface LearningState {
  events: LearningEventRecord[];
  /** Local events and documents not yet accepted by the server. */
  pendingSync: number;
  roadmap: Roadmap | null;
  schedule: Schedule | null;
  projects: UserProject[];
  notes: ProblemNote[];
  draft: LearnDraft | null;
}

export interface LearningSyncResult extends SuccessResult {
  pushed: number;
  pulled: number;
  rejected: number;
}

export interface LearnGenerateResult extends SuccessResult {
  draft?: LearnDraft;
  quota?: AiQuota | null;
}

/** A proposed change from "Adjust": applied only when the student accepts it. */
export interface LearnAdjustProposal {
  roadmap: Roadmap;
  schedule: Schedule;
  diff: RoadmapDiff;
  summary: string;
  warnings: string[];
  moved: number;
  shortfall: Shortfall | null;
}

export interface LearnAdjustResult extends SuccessResult {
  proposal?: LearnAdjustProposal;
  code?: AiErrorCode;
  quota?: AiQuota | null;
}

export interface LearnAcceptResult extends SuccessResult {
  roadmap?: Roadmap;
  schedule?: Schedule;
}

export interface LearnProjectSaveResult extends SuccessResult {
  projects?: UserProject[];
  /** Set when the plan's limits refused the change. */
  limited?: boolean;
}

export interface LearnNoteSaveResult extends SuccessResult {
  notes?: ProblemNote[];
}

export interface LearnRepoCheckRequest {
  projectId: string;
  stageId: string;
  repoUrl: string;
}

/** "I'm stuck" on a guided project: the question is answered by Nomadic AI (ai-proxy kind project_help). */
export interface LearnProjectHelpRequest {
  projectId: string;
  stageId: string;
  /** Index of the step the question is about (omit for the whole stage). */
  stepIndex?: number;
  question: string;
  /** Code or error output the student pasted. */
  code?: string;
}

export type LearnProjectHelpResult =
  | { success: true; answer: string; nextSteps: string[]; code: string | null; quota: AiQuota | null }
  | { success: false; code: AiErrorCode | 'not_found'; error: string; quota?: AiQuota | null };

export interface LearnRepoCheckResult extends SuccessResult {
  passed?: boolean;
  checks?: RepoCheck[];
  commits?: number;
  checkedAt?: string;
  rateLimited?: boolean;
}

// ── Practice (F8) ───────────────────────────────────────────────────────────

/** A quiz item the app can grade locally (no code runner at launch). */
export type PracticeQuizItem = McqItem | FillInItem | OrderingItem;

export interface PracticeCompanyTag {
  name: string;
  /** Relative frequency 0-100 from the company sets dataset (null when absent). */
  frequency: number | null;
}

/**
 * One thing to practise. `link` is only ever copied from a dataset (never
 * generated); `referenceAnswer` only from the question bank.
 */
export interface PracticeEntry {
  /** Learning item id: `lc:<slug>`, `roleq:<slug>`, `vault:<slug>` or a practice item id. */
  id: string;
  kind: PracticeEntryKind;
  title: string;
  /** Problem statement / question text ('' for external problems: read it on the linked site). */
  prompt: string;
  difficulty: PracticeDifficulty | null;
  topics: string[];
  /** Role families this is for; empty = general (shown for every role). */
  roles: RoleFamilyId[];
  companies: PracticeCompanyTag[];
  link: string | null;
  /** Learn skill id the attempt counts toward (null when none). */
  skillId: string | null;
  referenceAnswer: string | null;
  quiz: PracticeQuizItem | null;
  /** Provenance (dataset file) for curators. */
  source: string;
}

export interface PracticeCatalog {
  version: string;
  entries: PracticeEntry[];
  /** Companies in the company sets dataset, by name. Empty when `companyLocked`. */
  companies: Array<{ name: string; problemCount: number }>;
  /**
   * True when the signed-in plan (from the server) does not include company question sets: the main
   * process then removes every company name and frequency before the catalog reaches the renderer.
   */
  companyLocked?: boolean;
}

export type PracticeCatalogResult = { success: true; catalog: PracticeCatalog } | { success: false; error: string };

export interface PracticeState {
  /** Attempts the server accepted (local cache merged with the server log), newest first. */
  attempts: PracticeAttempt[];
  /** Practice attempts the server counted today (UTC), all sources; null when not signed in or unreachable. */
  usedToday: number | null;
  signedIn: boolean;
  /** Set when the server could not be reached; `attempts` is then the local cache only. */
  syncError?: string;
}

export type PracticeStateResult = { success: true; state: PracticeState } | { success: false; error: string };

export type PracticeRecordErrorCode = 'not_signed_in' | 'unauthorized' | 'daily_limit' | 'network';

export type PracticeRecordResult =
  | { success: true; attempt: PracticeAttempt; usedToday: number | null }
  | { success: false; code: PracticeRecordErrorCode; error: string };

/**
 * AI rubric feedback on a written answer ('ai-rubric-feedback'). Main sends it to the
 * Nomadic AI proxy (Edge Function `ai-proxy`), which holds the model key and enforces the
 * plan flag and daily quota (migration 020).
 */
export interface RubricCriterion {
  id: string;
  label: string;
  description: string;
}

export interface RubricFeedbackRequest {
  entryId: string;
  question: string;
  answer: string;
  rubric: RubricCriterion[];
}

export interface RubricFeedbackItem {
  criterionId: string;
  /** 0-4 per criterion. */
  score: number;
  /** Verbatim excerpt of the answer the score is based on ('' when the answer does not address it). */
  quote: string;
  comment: string;
}

export interface RubricFeedback {
  items: RubricFeedbackItem[];
  summary: string;
}

/** Why an AI proxy call was refused or failed. */
export type AiErrorCode =
  | 'not_signed_in'
  | 'unauthorized'
  | 'account_suspended'
  | 'plan_required'
  | 'quota_exceeded'
  | 'bad_request'
  | 'unavailable'
  | 'failed'
  | 'network';

/** Today's AI allowance for one feature, as the server counted it. */
export interface AiQuota {
  plan: string | null;
  limit: number | null;
  used: number | null;
  remaining: number | null;
  resetsAt: string | null;
}

export type RubricFeedbackResult =
  | { success: true; feedback: RubricFeedback; quota: AiQuota | null }
  | { success: false; code: AiErrorCode; error: string; quota?: AiQuota | null };

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

// ── Password reset and email verification (migration 019, Edge Function send-email-code) ──

export interface PasswordResetRequestInput {
  email: string;
}

export interface PasswordResetConfirmInput {
  email: string;
  /** The 6-digit code from the email. */
  code: string;
  newPassword: string;
}

export interface EmailVerificationConfirmInput {
  code: string;
}

/**
 * `not_signed_in`: no online session (offline sign-in or signed out). `unauthorized`: the server refused the
 * session. `invalid_code`: wrong, expired, used or locked code (one message for all). `rate_limited`: too many
 * codes requested. `email_failed`: the email could not be sent. `network`: the server could not be reached.
 */
export type EmailCodeErrorCode =
  | 'not_signed_in' | 'unauthorized' | 'invalid_code' | 'invalid_password' | 'rate_limited'
  | 'email_failed' | 'network' | 'not_configured';

export interface EmailCodeResult extends SuccessResult {
  code?: EmailCodeErrorCode;
  /** auth-send-verification / auth-confirm-verification: the account was already verified. */
  alreadyVerified?: boolean;
}

export interface EmailVerificationStatus extends SuccessResult {
  verified?: boolean;
  email?: string;
  verifiedAt?: string | null;
  code?: EmailCodeErrorCode;
}

// ── Data safety (F10) ──────────────────────────────────────────────────────

export type DbStartupState = 'new' | 'ok' | 'recovered_from_backup' | 'reset_after_corruption';
export type DbMigrationStatus = 'up_to_date' | 'migrated' | 'failed' | 'newer_than_app';

/** What happened to the local database at startup. */
export interface LocalDbHealth {
  startup: DbStartupState;
  migration: DbMigrationStatus;
  migrationError?: string;
  schemaVersion: number;
  latestSchemaVersion: number;
  integrity: 'ok';
  checkedAt: string;
}

export interface DataHealthResult extends SuccessResult {
  health: LocalDbHealth | null;
  backups: number;
  latestBackupAt: string | null;
  sizeBytes: number | null;
}

export interface AccountExportResult extends SuccessResult {
  canceled?: boolean;
  filePath?: string;
  /** False when the account's server copy could not be fetched; the file then says why. */
  serverIncluded?: boolean;
}

export interface DeleteAccountInput {
  confirmEmail: string;
  password: string;
}

// ── Updates, telemetry and support (F11) ───────────────────────────────────

export type UpdateChannel = 'stable' | 'beta';

export interface UpdaterStatus {
  state: 'unsupported' | 'idle' | 'checking' | 'up_to_date' | 'available' | 'downloading' | 'downloaded' | 'error';
  currentVersion: string;
  version?: string;
  percent?: number;
  releaseNotes?: string;
  message?: string;
}

export interface UpdaterInfo extends UpdaterStatus {
  channel: UpdateChannel;
}

export interface UpdatePolicyResult {
  required: boolean;
  currentVersion: string;
  minimumVersion: string | null;
  message: string | null;
}

export interface WhatsNewInfo {
  show: boolean;
  version: string;
  previousVersion: string | null;
  notes: string | null;
  releaseUrl: string;
}

export interface TelemetryState {
  /** The user's choice (off by default). */
  crashReports: boolean;
  /** This build has a Sentry DSN. */
  available: boolean;
  /** Reporting is running in the main process now (renderer reporting starts after a restart). */
  active: boolean;
}

export type FeedbackKind = 'bug' | 'idea' | 'question';

export interface FeedbackInput {
  kind: FeedbackKind;
  message: string;
  includeDiagnostics: boolean;
  contactEmail?: string;
}

export interface FeedbackResult extends SuccessResult {
  via?: 'sentry' | 'email';
  note?: string;
}

/** In-app review (migration 034): due once the account is 7 days old and has no review yet. */
export interface AppReviewStatus {
  due: boolean;
}

export interface AppReviewInput {
  platform: 'windows' | 'mac' | 'android';
  /** The 10 System Usability Scale answers in order, each 1 (strongly disagree) to 5 (strongly agree). */
  sus: number[];
  /** How likely they are to recommend Nomadic, 0 to 10. */
  recommend: number;
  best?: string;
  frustrating?: string;
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

export interface IdStatusInput {
  id: number | string;
  status: string;
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
  /** Single-laptop lock: the account is active on another device (retry with forceTakeover). */
  conflict?: boolean;
  activeDevice?: string;
  error?: string;
}

export interface GoogleSignInOptions {
  /** Sign the other device out (a fresh Google sign-in is needed; login tickets are single use). */
  forceTakeover?: boolean;
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
  'open-external-url': Channel<[url: string], SuccessResult>;
  'open-in-apply-browser': Channel<[url: string], OpenInApplyBrowserResult>;

  // profile & resumes
  'get-master-profile': Channel<[], MasterProfileRow | null>;
  'save-master-profile': Channel<[profile: Record<string, unknown>], SuccessResult>;
  'get-resumes': Channel<[], ResumeRecord[]>;
  'save-resume': Channel<[resume: ResumeInput], SuccessResult>;
  'delete-resume': Channel<[id: number], SuccessResult>;
  'set-default-resume': Channel<[id: number], SuccessResult>;
  'pick-resume-file': Channel<[], PickResumeFileResult>;
  'read-document-text': Channel<[input: DocumentTextInput], DocumentTextResult>;
  'draft-profile-answers': Channel<[input: DraftAnswersInput], DraftAnswersResult>;
  'remembered-answers-list': Channel<[], RememberedAnswer[]>;
  'remembered-answers-update': Channel<[input: RememberedAnswerUpdate], SuccessResult>;
  'remembered-answers-clear': Channel<[], SuccessResult>;

  // feed & saved jobs
  'run-scrapers': Channel<[], { success: boolean; jobs: FeedJob[]; error?: string }>;
  'get-cloud-feed-page': Channel<[options?: CloudFeedPageOptions], { success: boolean; jobs: FeedJob[]; totalCount: number }>;
  'get-cloud-feed': Channel<[userId?: string], { success: boolean; jobs: FeedJob[]; error?: string }>;
  'get-saved-jobs': Channel<[], SavedJob[]>;
  'save-job': Channel<[job: SaveJobInput], SuccessResult>;
  'remove-saved-job': Channel<[applyUrl: string], SuccessResult>;
  'get-news': Channel<[], NewsResult>;
  'get-hidden-jobs': Channel<[], HiddenJob[]>;
  'hide-job': Channel<[job: HideJobInput], SuccessResult>;
  'unhide-job': Channel<[applyUrl: string], SuccessResult>;

  // applications & auto-apply
  'get-applications': Channel<[], ApplicationRecord[]>;
  'update-application-status': Channel<[data: IdStatusInput], SuccessResult & { application?: ApplicationRecord }>;
  'update-application-notes': Channel<[data: ApplicationNotesInput], SuccessResult & { application?: ApplicationRecord }>;
  'update-application-follow-up': Channel<[data: ApplicationFollowUpInput], SuccessResult & { application?: ApplicationRecord }>;
  'delete-application': Channel<[id: number | string], SuccessResult>;
  'save-application': Channel<[app: ApplicationInput], SuccessResult & { id?: number }>;
  'launch-semi-auto': Channel<[jobUrls: string[]], SuccessResult>;
  'launch-autonomous': Channel<[jobUrls: string[]], AutonomousApplyResult>;
  'cancel-autonomous-apply': Channel<[], { success: boolean }>;
  'start-batch-copilot': Channel<[targets: BatchTarget[], options?: BatchStartOptions], SuccessResult & { snapshots?: BatchSnapshot[]; cancelled?: boolean }>;
  /** Submits only the reviewed snapshot ids (all held forms when `ids` is omitted). */
  'submit-all-batch-copilot': Channel<[overrides?: BatchOverrides, ids?: string[]], BatchSubmitResult>;

  // billing
  /** Server entitlements, cached briefly in main; `fresh` skips the cache. */
  'get-entitlements': Channel<[options?: { fresh?: boolean }], EntitlementsResult>;
  /** Opens the Razorpay checkout page for a paid plan in the browser. */
  'start-checkout': Channel<[plan: Exclude<BillingPlanId, 'free'>], CheckoutResult>;
  'get-payment-history': Channel<[], PaymentHistoryResult>;

  // outreach
  /** Published directory (server RPC, session-checked, 500 rows per day). */
  'outreach-list-contacts': Channel<[query: OutreachContactQuery], OutreachContactsResult>;
  'outreach-report-contact': Channel<[input: OutreachReportInput], OutreachResult>;
  'outreach-get-state': Channel<[], OutreachState>;
  'outreach-save-person': Channel<[input: OutreachPersonInput], OutreachResult & { person?: OutreachPerson }>;
  'outreach-delete-person': Channel<[id: number], OutreachResult>;
  /** Any edit puts the message back to draft; it must be reviewed again. */
  'outreach-save-message': Channel<[input: OutreachMessageInput], OutreachMessageResult>;
  'outreach-delete-message': Channel<[id: number], OutreachResult>;
  /** The user's "I reviewed this" tick: draft -> ready. */
  'outreach-review-message': Channel<[id: number], OutreachMessageResult>;
  /** Sends a ready email through the user's own SMTP account. */
  'outreach-send-message': Channel<[id: number], OutreachMessageResult>;
  /** Opens a ready message in Gmail, the mail app, or LinkedIn (note copied). Nothing is sent by Nomadic. */
  'outreach-open-message': Channel<[input: OutreachOpenInput], OutreachResult & { copied?: boolean }>;
  'outreach-mark-message': Channel<[input: OutreachMarkInput], OutreachMessageResult>;
  'outreach-draft-ai': Channel<[input: OutreachDraftInput], OutreachDraftResult>;
  'outreach-get-smtp': Channel<[], OutreachSmtpSettings>;
  'outreach-save-smtp': Channel<[input: OutreachSmtpInput], OutreachResult>;
  'outreach-clear-smtp': Channel<[], OutreachResult>;

  // assistant
  'ask-nomadic-assistant': Channel<[data: AssistantRequest], AssistantReply>;

  // learn
  'learning-get-state': Channel<[], LearningState>;
  'learning-record-events': Channel<[events: LearningEventInput[]], SuccessResult & { events?: LearningEventRecord[] }>;
  'learning-sync': Channel<[], LearningSyncResult>;
  'learn-roadmap-generate': Channel<[intake: IntakeInput], LearnGenerateResult>;
  'learn-roadmap-adjust': Channel<[instruction: string], LearnAdjustResult>;
  'learn-roadmap-accept': Channel<[roadmap: Roadmap, schedule: Schedule], LearnAcceptResult>;
  'learn-schedule-save': Channel<[schedule: Schedule], SuccessResult>;
  'learn-project-save': Channel<[project: UserProject], LearnProjectSaveResult>;
  'learn-problem-note-save': Channel<[note: ProblemNote], LearnNoteSaveResult>;
  'learn-project-check-repo': Channel<[request: LearnRepoCheckRequest], LearnRepoCheckResult>;
  'learn-project-help': Channel<[request: LearnProjectHelpRequest], LearnProjectHelpResult>;

  // practice (F8)
  'practice-get-catalog': Channel<[], PracticeCatalogResult>;
  'practice-get-state': Channel<[], PracticeStateResult>;
  'practice-record-attempt': Channel<[attempt: PracticeAttempt], PracticeRecordResult>;
  /** AI rubric feedback through the server-side AI proxy (plan- and quota-checked there). */
  'ai-rubric-feedback': Channel<[req: RubricFeedbackRequest], RubricFeedbackResult>;

  // auth & session
  'auth-google': Channel<[options?: GoogleSignInOptions], SuccessResult>;
  'auth-login': Channel<[credentials: AuthCredentials], AuthResult>;
  'auth-signup': Channel<[credentials: AuthCredentials], AuthResult>;
  'auth-request-password-reset': Channel<[input: PasswordResetRequestInput], EmailCodeResult>;
  'auth-confirm-password-reset': Channel<[input: PasswordResetConfirmInput], EmailCodeResult>;
  'auth-send-verification': Channel<[], EmailCodeResult>;
  'auth-confirm-verification': Channel<[input: EmailVerificationConfirmInput], EmailCodeResult>;
  'auth-verification-status': Channel<[], EmailVerificationStatus>;
  'start-heartbeat': Channel<[opts: HeartbeatOptions], { success: boolean }>;
  'stop-heartbeat': Channel<[], { success: boolean }>;
  'sync-cloud-data': Channel<[], SuccessResult & { pulled?: boolean }>;
  'get-device-info': Channel<[], DeviceInfo>;
  'updater-get-status': Channel<[], UpdaterInfo>;
  'updater-check': Channel<[], UpdaterInfo>;
  'updater-download': Channel<[], UpdaterInfo>;
  'updater-install': Channel<[], SuccessResult>;
  'updater-set-channel': Channel<[channel: UpdateChannel], UpdaterInfo>;
  'get-update-policy': Channel<[], UpdatePolicyResult>;
  'whats-new-get': Channel<[], WhatsNewInfo | null>;
  'whats-new-dismiss': Channel<[], SuccessResult>;
  'telemetry-get': Channel<[], TelemetryState>;
  'telemetry-set': Channel<[enabled: boolean], TelemetryState>;
  'send-feedback': Channel<[input: FeedbackInput], FeedbackResult>;
  'app-review-status': Channel<[], AppReviewStatus>;
  'app-review-submit': Channel<[input: AppReviewInput], SuccessResult>;
  'get-data-health': Channel<[], DataHealthResult>;
  'copy-diagnostics': Channel<[], SuccessResult & { text?: string }>;
  'export-account-data': Channel<[], AccountExportResult>;
  'delete-account': Channel<[input: DeleteAccountInput], SuccessResult>;

  // admin (F12): session-checked RPCs, re-authorized server side on every call
  'admin-list-users': Channel<[query: AdminUserQuery], AdminResult<AdminUsersPage>>;
  'admin-set-user-plan': Channel<[input: AdminSetPlanInput], AdminResult<AdminChangeResult>>;
  'admin-set-user-status': Channel<[input: AdminSetStatusInput], AdminResult<AdminStatusChangeResult>>;
  'admin-list-audit': Channel<[query: AdminAuditQuery], AdminResult<AdminAuditPage>>;
  'admin-scrape-health': Channel<[days: number], AdminResult<ScrapeHealth>>;
  'admin-list-content': Channel<[query: AdminContentQuery], AdminResult<AdminContentList>>;
  'admin-update-lesson': Channel<[input: AdminLessonUpdate], AdminResult<AdminVersionResult>>;
  'admin-set-resource-status': Channel<[input: AdminResourceStatusUpdate], AdminResult<AdminVersionResult>>;
  'admin-content-history': Channel<[query: AdminContentHistoryQuery], AdminResult<AdminContentVersion[]>>;
}

export type ChannelName = keyof IpcChannels;
export type ChannelArgs<C extends ChannelName> = IpcChannels[C]['args'];
export type ChannelResult<C extends ChannelName> = IpcChannels[C]['result'];

/** Runtime list of every invoke channel (kept in sync with `IpcChannels` by the type below). */
export const IPC_CHANNELS = [
  'check-dependencies', 'install-dependencies', 'open-external-url', 'open-in-apply-browser',
  'updater-get-status', 'updater-check', 'updater-download', 'updater-install', 'updater-set-channel',
  'get-update-policy', 'whats-new-get', 'whats-new-dismiss', 'telemetry-get', 'telemetry-set', 'send-feedback',
  'app-review-status', 'app-review-submit',
  'get-master-profile', 'save-master-profile', 'get-resumes', 'save-resume', 'delete-resume',
  'set-default-resume', 'pick-resume-file', 'read-document-text', 'draft-profile-answers',
  'remembered-answers-list', 'remembered-answers-update', 'remembered-answers-clear',
  'run-scrapers', 'get-cloud-feed-page', 'get-cloud-feed', 'get-saved-jobs', 'save-job', 'remove-saved-job', 'get-news',
  'get-hidden-jobs', 'hide-job', 'unhide-job',
  'get-applications', 'update-application-status', 'update-application-notes', 'update-application-follow-up', 'delete-application', 'save-application',
  'launch-semi-auto', 'launch-autonomous', 'cancel-autonomous-apply', 'start-batch-copilot',
  'submit-all-batch-copilot',
  'get-entitlements', 'start-checkout', 'get-payment-history',
  'outreach-list-contacts', 'outreach-report-contact', 'outreach-get-state', 'outreach-save-person',
  'outreach-delete-person', 'outreach-save-message', 'outreach-delete-message', 'outreach-review-message',
  'outreach-send-message', 'outreach-open-message', 'outreach-mark-message', 'outreach-draft-ai',
  'outreach-get-smtp', 'outreach-save-smtp', 'outreach-clear-smtp',
  'ask-nomadic-assistant',
  'learning-get-state', 'learning-record-events', 'learning-sync',
  'learn-roadmap-generate', 'learn-roadmap-adjust', 'learn-roadmap-accept', 'learn-schedule-save',
  'learn-project-save', 'learn-problem-note-save', 'learn-project-check-repo', 'learn-project-help',
  'practice-get-catalog', 'practice-get-state', 'practice-record-attempt', 'ai-rubric-feedback',
  'auth-google', 'auth-login', 'auth-signup',
  'auth-request-password-reset', 'auth-confirm-password-reset', 'auth-send-verification', 'auth-confirm-verification',
  'auth-verification-status', 'start-heartbeat', 'stop-heartbeat', 'sync-cloud-data',
  'get-device-info', 'get-data-health', 'copy-diagnostics', 'export-account-data', 'delete-account',
  'admin-list-users', 'admin-set-user-plan', 'admin-set-user-status', 'admin-list-audit',
  'admin-scrape-health', 'admin-list-content', 'admin-update-lesson', 'admin-set-resource-status',
  'admin-content-history',
] as const satisfies readonly ChannelName[];

// Compile-time proof that IPC_CHANNELS lists every channel exactly.
type MissingChannels = Exclude<ChannelName, (typeof IPC_CHANNELS)[number]>;
const _allChannelsListed: [MissingChannels] extends [never] ? true : MissingChannels = true;
void _allChannelsListed;

// ── Push events (main -> renderer) ──────────────────────────────────────────

export interface IpcEvents {
  'updater-status': UpdaterStatus;
  log: string;
  'heartbeat-status': HeartbeatStatus;
  'auto-apply-progress': AutoApplyProgressEvent;
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
  readDocumentText: Invoke<'read-document-text'>;
  draftProfileAnswers: Invoke<'draft-profile-answers'>;
  listRememberedAnswers: Invoke<'remembered-answers-list'>;
  updateRememberedAnswer: Invoke<'remembered-answers-update'>;
  clearRememberedAnswers: Invoke<'remembered-answers-clear'>;
  runScrapers: Invoke<'run-scrapers'>;
  getCloudFeed: Invoke<'get-cloud-feed'>;
  getCloudFeedPage: Invoke<'get-cloud-feed-page'>;
  getNews: Invoke<'get-news'>;
  launchSemiAuto: Invoke<'launch-semi-auto'>;
  launchAutonomous: Invoke<'launch-autonomous'>;
  cancelAutonomousApply: Invoke<'cancel-autonomous-apply'>;
  startBatchCoPilot: Invoke<'start-batch-copilot'>;
  submitAllBatchCoPilot: Invoke<'submit-all-batch-copilot'>;
  getEntitlements: Invoke<'get-entitlements'>;
  startCheckout: Invoke<'start-checkout'>;
  getPaymentHistory: Invoke<'get-payment-history'>;
  outreachListContacts: Invoke<'outreach-list-contacts'>;
  outreachReportContact: Invoke<'outreach-report-contact'>;
  outreachGetState: Invoke<'outreach-get-state'>;
  outreachSavePerson: Invoke<'outreach-save-person'>;
  outreachDeletePerson: Invoke<'outreach-delete-person'>;
  outreachSaveMessage: Invoke<'outreach-save-message'>;
  outreachDeleteMessage: Invoke<'outreach-delete-message'>;
  outreachReviewMessage: Invoke<'outreach-review-message'>;
  outreachSendMessage: Invoke<'outreach-send-message'>;
  outreachOpenMessage: Invoke<'outreach-open-message'>;
  outreachMarkMessage: Invoke<'outreach-mark-message'>;
  outreachDraftAi: Invoke<'outreach-draft-ai'>;
  outreachGetSmtp: Invoke<'outreach-get-smtp'>;
  outreachSaveSmtp: Invoke<'outreach-save-smtp'>;
  outreachClearSmtp: Invoke<'outreach-clear-smtp'>;
  getApplications: Invoke<'get-applications'>;
  saveApplication: Invoke<'save-application'>;
  getSavedJobs: Invoke<'get-saved-jobs'>;
  saveJob: Invoke<'save-job'>;
  removeSavedJob: Invoke<'remove-saved-job'>;
  getHiddenJobs: Invoke<'get-hidden-jobs'>;
  hideJob: Invoke<'hide-job'>;
  unhideJob: Invoke<'unhide-job'>;
  checkDependencies: Invoke<'check-dependencies'>;
  installDependencies: Invoke<'install-dependencies'>;
  startHeartbeat: (userId: string, sessionToken: string, deviceFingerprint: string) => Promise<ChannelResult<'start-heartbeat'>>;
  stopHeartbeat: Invoke<'stop-heartbeat'>;
  syncCloudData: Invoke<'sync-cloud-data'>;
  getDeviceInfo: Invoke<'get-device-info'>;
  updaterGetStatus: Invoke<'updater-get-status'>;
  updaterCheck: Invoke<'updater-check'>;
  updaterDownload: Invoke<'updater-download'>;
  updaterInstall: Invoke<'updater-install'>;
  updaterSetChannel: Invoke<'updater-set-channel'>;
  onUpdaterStatus: Subscribe<'updater-status'>;
  getUpdatePolicy: Invoke<'get-update-policy'>;
  getWhatsNew: Invoke<'whats-new-get'>;
  dismissWhatsNew: Invoke<'whats-new-dismiss'>;
  getTelemetry: Invoke<'telemetry-get'>;
  setTelemetry: Invoke<'telemetry-set'>;
  sendFeedback: Invoke<'send-feedback'>;
  appReviewStatus: Invoke<'app-review-status'>;
  appReviewSubmit: Invoke<'app-review-submit'>;
  getDataHealth: Invoke<'get-data-health'>;
  copyDiagnostics: Invoke<'copy-diagnostics'>;
  exportAccountData: Invoke<'export-account-data'>;
  deleteAccount: Invoke<'delete-account'>;
  onLog: Subscribe<'log'>;
  onHeartbeatStatus: Subscribe<'heartbeat-status'>;
  onAutoApplyProgress: Subscribe<'auto-apply-progress'>;
  openExternalUrl: Invoke<'open-external-url'>;
  openInApplyBrowser: Invoke<'open-in-apply-browser'>;

  askNomadicAssistant: Invoke<'ask-nomadic-assistant'>;

  learningGetState: Invoke<'learning-get-state'>;
  learningRecordEvents: Invoke<'learning-record-events'>;
  learningSync: Invoke<'learning-sync'>;
  learnRoadmapGenerate: Invoke<'learn-roadmap-generate'>;
  learnRoadmapAdjust: Invoke<'learn-roadmap-adjust'>;
  learnRoadmapAccept: Invoke<'learn-roadmap-accept'>;
  learnScheduleSave: Invoke<'learn-schedule-save'>;
  learnProjectSave: Invoke<'learn-project-save'>;
  learnProblemNoteSave: Invoke<'learn-problem-note-save'>;
  learnProjectCheckRepo: Invoke<'learn-project-check-repo'>;
  learnProjectHelp: Invoke<'learn-project-help'>;

  updateApplicationStatus: (id: number | string, status: string) => Promise<ChannelResult<'update-application-status'>>;
  updateApplicationNotes: (id: number | string, notes: string) => Promise<ChannelResult<'update-application-notes'>>;
  updateApplicationFollowUp: (id: number | string, followUpAt: string | null) => Promise<ChannelResult<'update-application-follow-up'>>;
  deleteApplication: Invoke<'delete-application'>;

  practiceGetCatalog: Invoke<'practice-get-catalog'>;
  practiceGetState: Invoke<'practice-get-state'>;
  practiceRecordAttempt: Invoke<'practice-record-attempt'>;
  aiRubricFeedback: Invoke<'ai-rubric-feedback'>;

  authLogin: Invoke<'auth-login'>;
  authSignup: Invoke<'auth-signup'>;
  authGoogle: Invoke<'auth-google'>;
  authRequestPasswordReset: Invoke<'auth-request-password-reset'>;
  authConfirmPasswordReset: Invoke<'auth-confirm-password-reset'>;
  authSendVerification: Invoke<'auth-send-verification'>;
  authConfirmVerification: Invoke<'auth-confirm-verification'>;
  authVerificationStatus: Invoke<'auth-verification-status'>;
  onOauthCallback: Subscribe<'oauth-callback'>;
  adminListUsers: Invoke<'admin-list-users'>;
  adminSetUserPlan: Invoke<'admin-set-user-plan'>;
  adminSetUserStatus: Invoke<'admin-set-user-status'>;
  adminListAudit: Invoke<'admin-list-audit'>;
  adminScrapeHealth: Invoke<'admin-scrape-health'>;
  adminListContent: Invoke<'admin-list-content'>;
  adminUpdateLesson: Invoke<'admin-update-lesson'>;
  adminSetResourceStatus: Invoke<'admin-set-resource-status'>;
  adminContentHistory: Invoke<'admin-content-history'>;

}

import { z } from 'zod';
import type { ArgSchemas } from './handle.js';
import {
  IntakeSchema,
  LearningEventPayloadSchema,
  LearningEventTypeSchema,
  ProblemNoteSchema,
  RoadmapSchema,
  ScheduleSchema,
  UserProjectSchema,
  UuidSchema,
} from '@job-automator/learning';
import { OUTREACH_CONTACT_KINDS, OUTREACH_PURPOSES, OUTREACH_REPORT_REASONS, USER_APPLICATION_STATUSES } from '../../shared/ipc.js';
import {
  ADMIN_ASSIGNABLE_TIERS,
  ADMIN_CONTENT_KINDS,
  ADMIN_REASON_MAX,
  ADMIN_REASON_MIN,
  ADMIN_USER_STATUSES,
  CONTENT_STATUSES,
  RESOURCE_STATUSES,
} from '../../shared/admin.js';
import { PracticeAttemptSchema, type PracticeAttempt } from '@job-automator/learning';

/**
 * Zod schemas for every IPC channel that accepts renderer input. They check
 * types and sizes at the process boundary; they intentionally stay as lenient
 * as the existing handlers about optional / extra fields (objects use
 * `.passthrough()`) so valid renderer payloads keep working unchanged.
 */

const SHORT = 1_000;
const MEDIUM = 20_000;
const LONG = 2_000_000; // resume text, roadmap JSON
const URL_MAX = 8_192;
const LIST_MAX = 1_000;

const str = (max: number = SHORT) => z.string().max(max);

/** Optional value; `null` from the renderer is normalised to `undefined`. */
function opt<T extends z.ZodTypeAny>(schema: T): z.ZodType<z.output<T> | undefined, z.ZodTypeDef, unknown> {
  return schema.nullish().transform((v) => (v === null ? undefined : v)) as unknown as z.ZodType<
    z.output<T> | undefined,
    z.ZodTypeDef,
    unknown
  >;
}

/** Optional field inside a passthrough object (null kept as-is, handlers use `??`). */
const field = (max: number = SHORT) => z.string().max(max).nullish();

const id = z.union([z.number().finite(), str(200)]);
const numericId = z.number().int().finite();
const url = str(URL_MAX);
const urlList = z.array(url).max(LIST_MAX);
const freeRecord = z.record(z.string(), z.unknown());

// ── system / settings ──────────────────────────────────────────────────────
export const openExternalUrlArgs: ArgSchemas<'open-external-url'> = [url];
export const openInApplyBrowserArgs: ArgSchemas<'open-in-apply-browser'> = [url.regex(/^https?:\/\//i)];
export const updateChannelArgs: ArgSchemas<'updater-set-channel'> = [z.enum(['stable', 'beta'])];
export const telemetrySetArgs: ArgSchemas<'telemetry-set'> = [z.boolean()];
export const feedbackArgs: ArgSchemas<'send-feedback'> = [
  z.object({
    kind: z.enum(['bug', 'idea', 'question']),
    message: z.string().trim().min(10).max(5_000),
    includeDiagnostics: z.boolean(),
    contactEmail: opt(z.string().trim().email().max(254)),
  }),
];

// ── profile & resumes ──────────────────────────────────────────────────────
const masterProfileInput = z
  .object({
    firstName: field(), first_name: field(),
    lastName: field(), last_name: field(),
    email: field(), phone: field(),
    linkedin: field(URL_MAX), linkedin_url: field(URL_MAX),
    github: field(URL_MAX), github_url: field(URL_MAX),
    sponsorship: field(),
    desiredSalary: field(), desired_salary: field(),
    noticePeriod: field(), notice_period: field(),
    groqApiKey: field(), groq_api_key: field(),
    smtpPassword: field(), smtp_password: field(),
    resumeText: field(LONG), resume_text: field(LONG),
    customAnswersJson: field(LONG), custom_answers_json: z.union([str(LONG), freeRecord]).nullish(),
    desiredTitle: field(), desired_title: field(),
    techStack: field(MEDIUM), tech_stack: field(MEDIUM),
  })
  .passthrough();
export const saveMasterProfileArgs: ArgSchemas<'save-master-profile'> = [masterProfileInput];

const resumeInput = z
  .object({
    name: opt(str()),
    targetRole: opt(str()),
    filePath: opt(str(4_096)),
    isDefault: opt(z.boolean()),
  })
  .passthrough();
export const saveResumeArgs: ArgSchemas<'save-resume'> = [resumeInput];
export const resumeIdArgs: ArgSchemas<'delete-resume'> = [numericId];
export const documentTextArgs: ArgSchemas<'read-document-text'> = [z.object({ resumeId: opt(numericId) })];
export const draftAnswersArgs: ArgSchemas<'draft-profile-answers'> = [
  z.object({
    ids: z.array(str(64)).min(1).max(30),
    candidate: z.object({
      name: opt(str(200)),
      desiredTitle: opt(str(300)),
      skills: opt(str(MEDIUM)),
      location: opt(str(300)),
      documentText: opt(str(MEDIUM * 5)),
    }),
  }),
];
export const rememberedAnswerUpdateArgs: ArgSchemas<'remembered-answers-update'> = [
  z.object({ key: z.string().trim().min(1).max(200), answer: z.string().max(200).nullable() }),
];

// ── feed & saved jobs ──────────────────────────────────────────────────────
const cloudFeedPageOptions = z
  .object({
    page: opt(z.number().int().min(0).max(100_000)),
    pageSize: opt(z.number().int().min(1).max(500)),
    search: opt(str(500)),
    filterTab: opt(str(100)),
    source: opt(str(200)),
  })
  .passthrough();
export const cloudFeedPageArgs: ArgSchemas<'get-cloud-feed-page'> = [opt(cloudFeedPageOptions)];
export const cloudFeedArgs: ArgSchemas<'get-cloud-feed'> = [opt(str())];

const saveJobInput = z
  .object({
    title: opt(str()),
    company: opt(str()),
    applyUrl: opt(url),
    apply_url: opt(url),
    location: opt(str()),
    salary: opt(str()),
    source: opt(str()),
    score: opt(z.union([z.number(), str(50)])),
    description: opt(str(LONG)),
  })
  .passthrough();
export const saveJobArgs: ArgSchemas<'save-job'> = [saveJobInput];
export const applyUrlArgs: ArgSchemas<'remove-saved-job'> = [url];
export const hideJobArgs: ArgSchemas<'hide-job'> = [
  z.object({ applyUrl: url, title: opt(str()), company: opt(str()) }).strict(),
];

// ── applications & auto-apply ──────────────────────────────────────────────
export const idArgs: ArgSchemas<'delete-application'> = [id];

/** Notes on one application (synced, so bounded like the cloud RPC). */
export const APPLICATION_NOTES_MAX = 10_000;
const applicationStatus = z.object({ id, status: z.enum(USER_APPLICATION_STATUSES) }).passthrough();
export const applicationStatusArgs: ArgSchemas<'update-application-status'> = [applicationStatus];
const applicationNotes = z.object({ id, notes: str(APPLICATION_NOTES_MAX) }).passthrough();
export const applicationNotesArgs: ArgSchemas<'update-application-notes'> = [applicationNotes];
const applicationFollowUp = z.object({ id, followUpAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() }).strict();
export const applicationFollowUpArgs: ArgSchemas<'update-application-follow-up'> = [applicationFollowUp];

const applicationInput = z
  .object({
    company: str().refine((v) => v.trim().length > 0, 'Company is required'),
    title: str().refine((v) => v.trim().length > 0, 'Title is required'),
    apply_url: opt(url),
    status: opt(str(100)),
    mode: opt(z.enum(['semi-auto', 'autonomous', 'outreach', 'manual'])),
    notes: opt(str(APPLICATION_NOTES_MAX)),
  })
  .passthrough();
export const saveApplicationArgs: ArgSchemas<'save-application'> = [applicationInput];
export const jobUrlsArgs: ArgSchemas<'launch-autonomous'> = [urlList];

const batchTarget = z
  .object({ url, company: opt(str()), title: opt(str()) })
  .passthrough();
const BATCH_MAX = 50;
export const batchTargetsArgs: ArgSchemas<'start-batch-copilot'> = [
  z.array(batchTarget).max(BATCH_MAX),
  opt(z.object({ keep: opt(z.boolean()) }).strict()),
];
const snapshotId = str(200);
export const batchOverridesArgs: ArgSchemas<'submit-all-batch-copilot'> = [
  opt(z.record(snapshotId, z.record(str(200), str(MEDIUM)))),
  opt(z.array(snapshotId).max(BATCH_MAX)),
];

// ── billing ────────────────────────────────────────────────────────────────
export const getEntitlementsArgs: ArgSchemas<'get-entitlements'> = [
  opt(z.object({ fresh: opt(z.boolean()) }).strict()),
];
export const startCheckoutArgs: ArgSchemas<'start-checkout'> = [z.enum(['pro', 'max'])];

// ── outreach ───────────────────────────────────────────────────────────────
const outreachKind = z.enum(OUTREACH_CONTACT_KINDS);
const outreachPurpose = z.enum(OUTREACH_PURPOSES);
const outreachChannel = z.enum(['email', 'linkedin']);
const nullableField = (max: number = SHORT) => str(max).nullish().transform((v) => (v == null ? null : v));
export const outreachListContactsArgs: ArgSchemas<'outreach-list-contacts'> = [
  z
    .object({
      company: opt(str(200)),
      query: opt(str(200)),
      kinds: opt(z.array(outreachKind).max(OUTREACH_CONTACT_KINDS.length)),
      limit: opt(z.number().int().min(1).max(50)),
      offset: opt(z.number().int().min(0).max(100_000)),
    })
    .strict(),
];
export const outreachReportContactArgs: ArgSchemas<'outreach-report-contact'> = [
  z
    .object({
      contactId: UuidSchema,
      reason: z.enum(OUTREACH_REPORT_REASONS),
      note: opt(str(500)),
    })
    .strict(),
];
export const outreachSavePersonArgs: ArgSchemas<'outreach-save-person'> = [
  z
    .object({
      id: opt(numericId),
      name: nullableField(200),
      email: str(320).trim().email().nullish().or(z.literal('')).transform((v) => (v ? v : null)),
      linkedinUrl: str(URL_MAX).trim().regex(/^https:\/\/([a-z0-9-]+\.)?linkedin\.com\//i).nullish().or(z.literal('')).transform((v) => (v ? v : null)),
      company: z.string().trim().min(1).max(200),
      roleTitle: nullableField(200),
      kind: outreachKind,
      contactId: UuidSchema.nullish().transform((v) => (v == null ? null : v)),
      sourceUrl: str(URL_MAX).regex(/^https?:\/\//i).nullish().transform((v) => (v == null ? null : v)),
      notes: nullableField(2_000),
    })
    .strict(),
];
export const outreachIdArgs: ArgSchemas<'outreach-delete-person'> = [numericId];
export const outreachSaveMessageArgs: ArgSchemas<'outreach-save-message'> = [
  z
    .object({
      id: opt(numericId),
      personId: numericId,
      channel: outreachChannel,
      purpose: outreachPurpose,
      jobTitle: nullableField(200),
      jobUrl: str(URL_MAX).regex(/^https?:\/\//i).nullish().transform((v) => (v == null ? null : v)),
      subject: str(300),
      body: str(5_000),
    })
    .strict(),
];
export const outreachOpenMessageArgs: ArgSchemas<'outreach-open-message'> = [
  z.object({ id: numericId, via: z.enum(['gmail', 'mailto', 'linkedin']) }).strict(),
];
export const outreachMarkMessageArgs: ArgSchemas<'outreach-mark-message'> = [
  z.object({ id: numericId, status: z.enum(['sent', 'replied', 'no_reply', 'bounced']) }).strict(),
];
export const outreachDraftAiArgs: ArgSchemas<'outreach-draft-ai'> = [
  z
    .object({
      personId: numericId,
      channel: outreachChannel,
      purpose: outreachPurpose,
      jobTitle: nullableField(200),
      note: nullableField(500),
    })
    .strict(),
];
export const outreachSaveSmtpArgs: ArgSchemas<'outreach-save-smtp'> = [
  z
    .object({
      host: z.string().trim().min(3).max(253).regex(/^[a-z0-9.-]+$/i),
      port: z.number().int().min(1).max(65_535),
      secure: z.boolean(),
      user: z.string().trim().min(3).max(320),
      password: opt(z.string().min(1).max(500)),
      fromName: opt(str(100)),
    })
    .strict(),
];
// ── assistant ──────────────────────────────────────────────────────────────
const assistantRequest = z
  .object({
    message: str(MEDIUM),
    history: opt(z.array(z.object({ sender: str(100), text: str(MEDIUM) }).passthrough()).max(500)),
  })
  .passthrough();
export const assistantArgs: ArgSchemas<'ask-nomadic-assistant'> = [assistantRequest];

// ── learn ──────────────────────────────────────────────────────────────────
const learningEventInput = z.object({
  id: UuidSchema,
  type: LearningEventTypeSchema,
  skill_id: str(120).min(1).nullable(),
  item_id: str(120).min(1).nullable(),
  payload: LearningEventPayloadSchema.refine((p) => JSON.stringify(p).length <= 4_000, 'payload is too large').default({}),
  duration_s: z.number().int().min(0).max(86_400).default(0),
  created_at: z.string().datetime({ offset: true }),
});
/** At most 500 events per call (the server RPC's batch limit). */
export const learningRecordEventsArgs: ArgSchemas<'learning-record-events'> = [z.array(learningEventInput).min(1).max(500)];

// Learn v2: the documents are validated with the shared zod model (the same one the
// main process and sync use), plus size caps so a bad caller cannot flood the store.
const sized = <T extends z.ZodTypeAny>(schema: T, maxChars: number, what: string) =>
  z.unknown().superRefine((v, ctx) => {
    if (JSON.stringify(v ?? null).length > maxChars) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${what} is too large` });
  }).pipe(schema);
export const learnRoadmapGenerateArgs: ArgSchemas<'learn-roadmap-generate'> = [sized(IntakeSchema, 20_000, 'intake')];
export const learnRoadmapAdjustArgs: ArgSchemas<'learn-roadmap-adjust'> = [z.string().trim().min(3).max(500)];
export const learnRoadmapAcceptArgs: ArgSchemas<'learn-roadmap-accept'> = [
  sized(RoadmapSchema, 200_000, 'roadmap'),
  sized(ScheduleSchema, 400_000, 'schedule'),
];
export const learnScheduleSaveArgs: ArgSchemas<'learn-schedule-save'> = [sized(ScheduleSchema, 400_000, 'schedule')];
export const learnProjectSaveArgs: ArgSchemas<'learn-project-save'> = [sized(UserProjectSchema, 50_000, 'project')];
export const learnProblemNoteSaveArgs: ArgSchemas<'learn-problem-note-save'> = [ProblemNoteSchema];
export const learnProjectHelpArgs: ArgSchemas<'learn-project-help'> = [
  z.object({
    projectId: str(120).min(1),
    stageId: str(120).min(1),
    stepIndex: z.number().int().min(0).max(20).optional(),
    question: z.string().trim().min(3).max(1000),
    code: z.string().max(6000).optional(),
  }),
];
export const learnProjectCheckRepoArgs: ArgSchemas<'learn-project-check-repo'> = [
  z.object({
    projectId: str(120).min(1),
    stageId: str(120).min(1),
    repoUrl: z.string().trim().min(10).max(200).regex(/^(https?:\/\/)?(www\.)?github\.com\//i, 'must be a GitHub repository link'),
  }),
];

// ── practice (F8) ──────────────────────────────────────────────────────────
// Validated with the shared schema from @job-automator/learning (one source of
// truth for the attempt shape); strict: unknown keys are dropped.
const practiceAttempt = z.unknown().transform((value, ctx): PracticeAttempt => {
  const parsed = PracticeAttemptSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  for (const issue of parsed.error.issues) ctx.addIssue({ code: z.ZodIssueCode.custom, path: issue.path, message: issue.message });
  return z.NEVER;
});
export const practiceRecordAttemptArgs: ArgSchemas<'practice-record-attempt'> = [practiceAttempt];

// AI rubric feedback: same limits the ai-proxy Edge Function enforces (8000-char answer,
// 1-10 criteria with unique ids), so oversized requests never leave the device.
const nonBlank = (max: number) => z.string().max(max).refine((v) => v.trim().length > 0, 'must not be empty');
const rubricCriterion = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    label: nonBlank(100),
    description: z.string().max(500),
  })
  .strip();
const rubricFeedbackRequest = z
  .object({
    entryId: nonBlank(200),
    question: nonBlank(4_000),
    answer: nonBlank(8_000),
    rubric: z
      .array(rubricCriterion)
      .min(1)
      .max(10)
      .refine((r) => new Set(r.map((c) => c.id)).size === r.length, 'rubric ids must be unique'),
  })
  .strip();
export const aiRubricFeedbackArgs: ArgSchemas<'ai-rubric-feedback'> = [rubricFeedbackRequest];

// ── auth & session ─────────────────────────────────────────────────────────
const credentials = z
  .object({
    email: opt(str(320)),
    username: opt(str(320)),
    password: opt(str(SHORT)),
    licenseKey: opt(str(SHORT)),
    fullName: opt(str()),
    forceTakeover: opt(z.boolean()),
  })
  .passthrough();
export const credentialsArgs: ArgSchemas<'auth-login'> = [credentials];
export const googleSignInArgs: ArgSchemas<'auth-google'> = [opt(z.object({ forceTakeover: opt(z.boolean()) }).strict())];

// Password reset / email verification (019). Strict: these channels have no legacy callers. Password length
// rules are applied by the service (same messages as sign-up); the server re-checks everything.
const resetEmail = z.string().trim().min(3).max(320).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address.');
const emailCode = z.string().trim().regex(/^[0-9]{6}$/, 'Enter the 6-digit code.');
export const passwordResetRequestArgs: ArgSchemas<'auth-request-password-reset'> = [
  z.object({ email: resetEmail }).strict(),
];
export const passwordResetConfirmArgs: ArgSchemas<'auth-confirm-password-reset'> = [
  z.object({ email: resetEmail, code: emailCode, newPassword: z.string().max(SHORT) }).strict(),
];
export const emailVerificationConfirmArgs: ArgSchemas<'auth-confirm-verification'> = [
  z.object({ code: emailCode }).strict(),
];

const heartbeatOptions = z
  .object({
    userId: z.union([str(200), z.number().finite()]).transform(String),
    sessionToken: str(500),
    deviceFingerprint: str(500),
  })
  .passthrough();
export const heartbeatArgs: ArgSchemas<'start-heartbeat'> = [heartbeatOptions];

// Account deletion re-checks the password on the server (fresh login ticket, migration 022).
export const deleteAccountArgs: ArgSchemas<'delete-account'> = [
  z.object({ confirmEmail: z.string().trim().toLowerCase().email().max(254), password: z.string().min(1).max(SHORT) }),
];

// ── admin (F12) ────────────────────────────────────────────────────────────
// Strict objects: admin payloads have no legacy callers. The server re-validates
// everything (and re-checks the session and admin role) on each call.
const uuid = z.string().uuid();
const slug = z.string().min(1).max(200);
const reason = z.string().trim().min(ADMIN_REASON_MIN).max(ADMIN_REASON_MAX);
const pageLimit = z.number().int().min(1).max(200).optional();

export const adminListUsersArgs: ArgSchemas<'admin-list-users'> = [
  z
    .object({
      query: str(200).optional(),
      tier: str(50).optional(),
      status: z.enum(ADMIN_USER_STATUSES).optional(),
      limit: pageLimit,
      offset: z.number().int().min(0).max(1_000_000).optional(),
    })
    .strict(),
];

export const adminSetUserPlanArgs: ArgSchemas<'admin-set-user-plan'> = [
  z
    .object({
      targetId: uuid,
      tier: z.enum(ADMIN_ASSIGNABLE_TIERS),
      expiresAt: z.string().datetime({ offset: true }).nullable(),
      reason,
    })
    .strict(),
];

export const adminSetUserStatusArgs: ArgSchemas<'admin-set-user-status'> = [
  z.object({ targetId: uuid, status: z.enum(ADMIN_USER_STATUSES), reason }).strict(),
];

export const adminListAuditArgs: ArgSchemas<'admin-list-audit'> = [
  z
    .object({
      limit: pageLimit,
      beforeId: z.number().int().positive().optional(),
      targetType: z.enum(['user', 'lesson', 'resource', 'admin']).optional(),
      targetId: str(200).optional(),
    })
    .strict(),
];

export const adminScrapeHealthArgs: ArgSchemas<'admin-scrape-health'> = [z.number().int().min(1).max(30)];

export const adminListContentArgs: ArgSchemas<'admin-list-content'> = [
  z.object({ kind: z.enum(ADMIN_CONTENT_KINDS), status: str(50).optional(), query: str(200).optional() }).strict(),
];

export const adminUpdateLessonArgs: ArgSchemas<'admin-update-lesson'> = [
  z
    .object({
      id: slug,
      expectedVersion: z.number().int().positive(),
      title: z.string().trim().min(1).max(200),
      summaryMd: z.string().trim().min(1).max(20_000),
      keyPoints: z.array(z.string().max(300)).max(20),
      status: z.enum(CONTENT_STATUSES),
      reason,
    })
    .strict(),
];

export const adminSetResourceStatusArgs: ArgSchemas<'admin-set-resource-status'> = [
  z
    .object({ id: slug, expectedVersion: z.number().int().positive(), status: z.enum(RESOURCE_STATUSES), reason })
    .strict(),
];

export const adminContentHistoryArgs: ArgSchemas<'admin-content-history'> = [
  z.object({ type: z.enum(['lesson', 'resource']), id: slug }).strict(),
];

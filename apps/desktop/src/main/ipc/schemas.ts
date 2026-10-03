import { z } from 'zod';
import type { ArgSchemas } from './handle.js';
import { LearningEventPayloadSchema, LearningEventTypeSchema, RoleFamilyIdSchema, UuidSchema } from '@job-automator/learning';
import { USER_APPLICATION_STATUSES } from '../../shared/ipc.js';
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
export const testGroqKeyArgs: ArgSchemas<'test-groq-key'> = [str(SHORT)];
export const openExternalUrlArgs: ArgSchemas<'open-external-url'> = [url];
export const downloadUpdateArgs: ArgSchemas<'download-update'> = [opt(url)];
export const installUpdateArgs: ArgSchemas<'install-update'> = [opt(str(4_096))];

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

// ── applications & auto-apply ──────────────────────────────────────────────
export const idArgs: ArgSchemas<'delete-application'> = [id];

/** Notes on one application (synced, so bounded like the cloud RPC). */
export const APPLICATION_NOTES_MAX = 10_000;
const applicationStatus = z.object({ id, status: z.enum(USER_APPLICATION_STATUSES) }).passthrough();
export const applicationStatusArgs: ArgSchemas<'update-application-status'> = [applicationStatus];
const applicationNotes = z.object({ id, notes: str(APPLICATION_NOTES_MAX) }).passthrough();
export const applicationNotesArgs: ArgSchemas<'update-application-notes'> = [applicationNotes];

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
export const emailArgs: ArgSchemas<'verify-email'> = [str(320)];
export const targetRoleArgs: ArgSchemas<'get-hr-contacts'> = [opt(str())];

const outreachRecipient = z
  .object({
    email: str(320),
    name: opt(str()),
    company: opt(str()),
    role: opt(str()),
    subject: opt(str(2_000)),
    body: opt(str(MEDIUM)),
  })
  .passthrough();
export const sendOutreachArgs: ArgSchemas<'send-outreach'> = [z.array(outreachRecipient).max(LIST_MAX)];

const aiOutreachParams = z
  .object({
    role: opt(str()),
    company: opt(str()),
    recipientName: opt(str()),
    tone: opt(str()),
    skills: opt(str(MEDIUM)),
    candidateName: opt(str()),
  })
  .passthrough();
export const aiOutreachArgs: ArgSchemas<'generate-ai-outreach-email'> = [aiOutreachParams];

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

const learningGoalInput = z.object({
  track_id: RoleFamilyIdSchema,
  horizon_months: z.union([z.literal(1), z.literal(3), z.literal(6)]),
  daily_hours: z.union([z.literal(1), z.literal(2), z.literal(4)]),
});
export const learningSaveGoalArgs: ArgSchemas<'learning-save-goal'> = [learningGoalInput];

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

const heartbeatOptions = z
  .object({
    userId: z.union([str(200), z.number().finite()]).transform(String),
    sessionToken: str(500),
    deviceFingerprint: str(500),
  })
  .passthrough();
export const heartbeatArgs: ArgSchemas<'start-heartbeat'> = [heartbeatOptions];

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

import { z } from 'zod';
import type { ArgSchemas } from './handle.js';
import { USER_APPLICATION_STATUSES } from '../../shared/ipc.js';

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
const idStatus = z.object({ id, status: str(100) }).passthrough();
export const idStatusArgs: ArgSchemas<'admin-update-user-status'> = [idStatus];
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

// ── learner hub ────────────────────────────────────────────────────────────
export const roadmapIdArgs: ArgSchemas<'get-learner-progress'> = [str(500)];

const learnerProgressInput = z
  .object({
    roadmapId: str(500),
    completedNodes: z.array(str(500)).max(10_000),
    targetHorizon: opt(str(100)),
    dailyCommitment: opt(str(100)),
    streakCount: opt(z.number().int().min(0).max(100_000)),
  })
  .passthrough();
export const saveLearnerProgressArgs: ArgSchemas<'save-learner-progress'> = [learnerProgressInput];

const aiKeys = { geminiKey: opt(str()), groqKey: opt(str()) };

const onboardingParams = z
  .object({
    targetRole: str(),
    experienceLevel: opt(str(200)),
    bioOrResumeText: opt(str(LONG)),
    customSkills: opt(z.array(str()).max(500)),
    targetHorizon: opt(str(100)),
    dailyCommitment: opt(str(100)),
    ...aiKeys,
  })
  .passthrough();
export const onboardingArgs: ArgSchemas<'generate-ai-onboarding-profile'> = [onboardingParams];

const customRoadmapParams = z
  .object({
    roleTitle: str(),
    customTitle: opt(str()),
    currentSkills: opt(str(MEDIUM)),
    targetHorizon: opt(str(100)),
    dailyCommitment: opt(str(100)),
    ...aiKeys,
  })
  .passthrough();
export const customRoadmapArgs: ArgSchemas<'generate-custom-roadmap'> = [customRoadmapParams];

const customRoadmapInput = z
  .object({
    id: str(500),
    roleTitle: str(),
    domain: str(),
    roadmapJson: str(LONG),
    targetHorizon: opt(str(100)),
    dailyCommitment: opt(str(100)),
  })
  .passthrough();
export const saveCustomRoadmapArgs: ArgSchemas<'save-custom-roadmap'> = [customRoadmapInput];
export const deleteCustomRoadmapArgs: ArgSchemas<'delete-custom-roadmap'> = [str(500)];

export const heatmapDaysArgs: ArgSchemas<'get-activity-heatmap'> = [opt(z.number().int().min(0).max(3_650))];
export const logActivityArgs: ArgSchemas<'log-user-activity'> = [
  z.object({ activityType: str(100), details: opt(str(MEDIUM)) }).passthrough(),
];

const interviewAnswerParams = z
  .object({
    questionId: str(500),
    questionTitle: str(MEDIUM),
    answerText: str(LONG),
    category: opt(str(200)),
  })
  .passthrough();
export const interviewAnswerArgs: ArgSchemas<'evaluate-interview-answer'> = [interviewAnswerParams];

const recommendedParams = z
  .object({ title: str(), description: opt(str(LONG)), techStack: opt(str(MEDIUM)) })
  .passthrough();
export const recommendedResourcesArgs: ArgSchemas<'get-recommended-resources-for-job'> = [recommendedParams];

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

const heartbeatOptions = z
  .object({
    userId: z.union([str(200), z.number().finite()]).transform(String),
    sessionToken: str(500),
    deviceFingerprint: str(500),
  })
  .passthrough();
export const heartbeatArgs: ArgSchemas<'start-heartbeat'> = [heartbeatOptions];

// Account deletion re-checks the password on the server (fresh login ticket, migration 018).
export const deleteAccountArgs: ArgSchemas<'delete-account'> = [
  z.object({ confirmEmail: z.string().trim().toLowerCase().email().max(254), password: z.string().min(1).max(SHORT) }),
];

// ── admin ──────────────────────────────────────────────────────────────────
const adminCreateUserInput = z
  .object({
    email: opt(str(320)),
    fullName: opt(str()),
    password: opt(str()),
    tier: opt(str(100)),
    role: opt(str(100)),
    licenseKey: opt(str(200)),
  })
  .passthrough();
export const adminCreateUserArgs: ArgSchemas<'admin-create-user'> = [adminCreateUserInput];

const billingRecordInput = z
  .object({
    userEmail: opt(str(320)),
    amount: opt(str(100)),
    plan: opt(str(200)),
    paymentMethod: opt(str(200)),
  })
  .passthrough();
export const billingRecordArgs: ArgSchemas<'admin-create-billing-record'> = [billingRecordInput];

const assignPlanInput = z
  .object({
    userId: id,
    email: opt(str(320)),
    planTier: str(100),
    expiresAt: opt(str(100)),
  })
  .passthrough();
export const assignPlanArgs: ArgSchemas<'admin-assign-plan'> = [assignPlanInput];

const curatedResourceInput = z
  .object({
    title: str(),
    youtubeUrl: url,
    topic: str(),
    targetRole: str(),
    summary: opt(str(MEDIUM)),
    duration: opt(str(100)),
  })
  .passthrough();
export const curatedResourceArgs: ArgSchemas<'admin-add-learning-resource'> = [curatedResourceInput];

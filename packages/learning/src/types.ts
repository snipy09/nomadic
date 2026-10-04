/**
 * Learning data model (Phase 3B.1).
 *
 * Every shape that crosses a boundary (SQLite row, Supabase row, seed JSON,
 * IPC payload, LLM output) is defined here as a zod schema, with the TS type
 * inferred from it. Field names are snake_case so a row from either database
 * parses without a mapping layer.
 */
import { z } from 'zod';
import { ContentStatusSchema, RoleFamilyIdSchema, SlugSchema, UuidSchema } from './primitives';
import { LearnModuleSchema, LearnTopicSchema, ProblemInfoSchema, ProjectSchema } from './v2/types';

export * from './primitives';

// ── Shared enums ────────────────────────────────────────────────────────────

export const SkillLevelSchema = z.number().int().min(1).max(5);

// ── Skills graph ────────────────────────────────────────────────────────────

export const SkillCategorySchema = z.enum([
  'foundations',
  'frontend',
  'backend',
  'data',
  'ml',
  'devops',
  'product',
  'design',
  'career',
]);
export type SkillCategory = z.infer<typeof SkillCategorySchema>;

export const SkillSchema = z.object({
  id: SlugSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  category: SkillCategorySchema,
  /** 1 = first-week beginner material, 5 = senior/specialist. */
  level: SkillLevelSchema,
  estimated_hours: z.number().positive().max(400),
  /** Lower-case phrases the tagger matches (word-boundary aware). */
  aliases: z.array(z.string().min(1)).default([]),
  /** Case-sensitive regex sources for ambiguous names (e.g. "Go", "R"). */
  patterns: z.array(z.string().min(1)).default([]),
});
export type Skill = z.infer<typeof SkillSchema>;

export const SkillPrerequisiteSchema = z.object({
  skill_id: SlugSchema,
  prerequisite_id: SlugSchema,
  /** 'hard' blocks the planner; 'soft' only influences ordering. */
  strength: z.enum(['hard', 'soft']).default('hard'),
});
export type SkillPrerequisite = z.infer<typeof SkillPrerequisiteSchema>;

export const RoleFamilySchema = z.object({
  id: RoleFamilyIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  /** Legacy roadmap ids (roadmaps.ts / jobRolesDataset.ts) that map here. */
  legacy_roadmap_ids: z.array(z.string()).default([]),
  /** Example job titles; used by the scraper/feed to pick a family. */
  example_titles: z.array(z.string()).default([]),
});
export type RoleFamily = z.infer<typeof RoleFamilySchema>;

export const RoleSkillSchema = z.object({
  role_id: RoleFamilyIdSchema,
  skill_id: SlugSchema,
  /** Importance for the role, 0 < weight <= 1. Core skills are >= 0.7. */
  weight: z.number().gt(0).max(1),
});
export type RoleSkill = z.infer<typeof RoleSkillSchema>;

// ── Resources ───────────────────────────────────────────────────────────────

export const ResourceTypeSchema = z.enum([
  'video',
  'doc',
  'book',
  'course',
  'cheatsheet',
  'article',
  'interactive',
  'problem',
]);
export type ResourceType = z.infer<typeof ResourceTypeSchema>;

/**
 * `unverified` = never link-checked; `active` = passed the last check and may be
 * shown; `broken` = failed the check (hidden); `retired` = removed by an editor.
 * The app only ever renders rows with status `active`.
 */
export const ResourceStatusSchema = z.enum(['unverified', 'active', 'broken', 'retired']);
export type ResourceStatus = z.infer<typeof ResourceStatusSchema>;

export const LearningResourceSchema = z.object({
  id: SlugSchema,
  title: z.string().min(1),
  url: z
    .string()
    .url()
    .refine((u) => /^https:\/\//.test(u), 'resources must use https'),
  provider: z.string().min(1),
  type: ResourceTypeSchema,
  duration_minutes: z.number().int().positive().nullable().default(null),
  skill_ids: z.array(SlugSchema).min(1),
  level: SkillLevelSchema,
  /** Editorial quality score 1-5 (5 = canonical reference). */
  quality: z.number().int().min(1).max(5),
  is_free: z.boolean().default(true),
  status: ResourceStatusSchema.default('unverified'),
  last_checked: z.string().datetime().nullable().default(null),
  http_status: z.number().int().nullable().default(null),
  fail_count: z.number().int().min(0).default(0),
  /** Where in the repo the URL came from (provenance for curators). */
  source: z.string().min(1),
});
export type LearningResource = z.infer<typeof LearningResourceSchema>;

// ── Lessons ─────────────────────────────────────────────────────────────────

export const LessonSchema = z.object({
  id: SlugSchema,
  skill_id: SlugSchema,
  title: z.string().min(1),
  /** Short markdown summary. Never contains URLs (links come from resources). */
  summary_md: z
    .string()
    .min(1)
    .refine((s) => !/https?:\/\//i.test(s), 'lesson text must not contain URLs'),
  key_points: z.array(z.string().min(1)).default([]),
  resource_ids: z.array(SlugSchema).default([]),
  estimated_minutes: z.number().int().positive(),
  /** Free tier may open core lessons only. */
  is_core: z.boolean().default(true),
  status: ContentStatusSchema.default('draft'),
  ai_drafted: z.boolean().default(false),
  version: z.number().int().positive().default(1),
});
export type Lesson = z.infer<typeof LessonSchema>;

// ── Practice items ──────────────────────────────────────────────────────────

export const CodeLanguageSchema = z.enum(['javascript', 'python']);
export type CodeLanguage = z.infer<typeof CodeLanguageSchema>;

export const CodeTestSchema = z.object({
  /** Positional arguments passed to the entry point (JSON values). */
  args: z.array(z.unknown()),
  expected: z.unknown(),
  hidden: z.boolean().default(false),
  description: z.string().optional(),
});
export type CodeTest = z.infer<typeof CodeTestSchema>;

const PracticeBase = {
  id: SlugSchema,
  skill_id: SlugSchema,
  lesson_id: SlugSchema.nullable().default(null),
  prompt: z.string().min(1),
  explanation: z.string().default(''),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('easy'),
  /** Company tags for interview sets (a paid feature). */
  company_tags: z.array(z.string()).default([]),
  status: ContentStatusSchema.default('draft'),
  ai_drafted: z.boolean().default(false),
  version: z.number().int().positive().default(1),
};

export const McqItemSchema = z.object({
  ...PracticeBase,
  kind: z.literal('mcq'),
  options: z.array(z.string().min(1)).min(2).max(8),
  /** Indexes into options; more than one means "select all that apply". */
  correct: z.array(z.number().int().min(0)).min(1),
});

export const FillInItemSchema = z.object({
  ...PracticeBase,
  kind: z.literal('fill_in'),
  /** One array of accepted answers per blank (`___` in the prompt). */
  blanks: z.array(z.array(z.string().min(1)).min(1)).min(1),
  case_sensitive: z.boolean().default(false),
});

export const OrderingItemSchema = z.object({
  ...PracticeBase,
  kind: z.literal('ordering'),
  /** Steps in the correct order; the UI shuffles them. */
  items: z.array(z.string().min(1)).min(2).max(12),
});

export const CodeItemSchema = z.object({
  ...PracticeBase,
  kind: z.literal('code'),
  language: CodeLanguageSchema,
  starter_code: z.string(),
  entry_point: z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/),
  tests: z.array(CodeTestSchema).min(1),
  timeout_ms: z.number().int().positive().max(30_000).default(3000),
});

export const PracticeItemSchema = z.discriminatedUnion('kind', [
  McqItemSchema,
  FillInItemSchema,
  OrderingItemSchema,
  CodeItemSchema,
]);
export type McqItem = z.infer<typeof McqItemSchema>;
export type FillInItem = z.infer<typeof FillInItemSchema>;
export type OrderingItem = z.infer<typeof OrderingItemSchema>;
export type CodeItem = z.infer<typeof CodeItemSchema>;
export type PracticeItem = z.infer<typeof PracticeItemSchema>;
export type PracticeKind = PracticeItem['kind'];

/** Reference solutions live in a separate admin-only table. */
export const PracticeSolutionSchema = z.object({
  item_id: SlugSchema,
  solution_code: z.string().min(1),
  notes: z.string().default(''),
});
export type PracticeSolution = z.infer<typeof PracticeSolutionSchema>;

// ── Events (append-only progress log) ───────────────────────────────────────

export const LEARNING_EVENT_TYPES = [
  'lesson_viewed',
  'quiz_passed',
  'quiz_failed',
  'problem_solved',
  'review_done',
  'skill_marked_known',
  // Learn v2
  'task_done',
  'task_skipped',
  'task_moved',
  'problem_attempted',
  'stage_done',
  'project_started',
  'project_done',
  'roadmap_accepted',
] as const;
export const LearningEventTypeSchema = z.enum(LEARNING_EVENT_TYPES);
export type LearningEventType = z.infer<typeof LearningEventTypeSchema>;

/**
 * Known payload keys (all optional; payload is open for forward compatibility):
 * - track_id: role family the user was studying when the event happened
 * - lesson_id: lesson the event belongs to (a lesson check pass completes it)
 * - quality: 0-5 SM-2 recall quality (reviews); defaults derived from type
 * - score: 0-1 grading score
 * - mastery: 0-1 floor for skill_marked_known (placement result)
 * - source: 'app' | 'legacy_import' | 'placement'
 * Learn v2:
 * - planned_minutes: minutes the schedule planned for a task (pace factor)
 * - undone: true unticks an earlier task_done
 * - topic_id / module_id / stream / task_kind: where a task belongs
 * - project_id / stage_id / skill_ids: project evidence (project_done raises mastery)
 * - hint: true when a problem needed a hint (problem_attempted)
 */
export const LearningEventPayloadSchema = z
  .object({
    track_id: z.string().optional(),
    lesson_id: z.string().optional(),
    quality: z.number().min(0).max(5).optional(),
    score: z.number().min(0).max(1).optional(),
    mastery: z.number().min(0).max(1).optional(),
    source: z.string().optional(),
  })
  .passthrough();
export type LearningEventPayload = z.infer<typeof LearningEventPayloadSchema>;

export const LearningEventSchema = z.object({
  id: UuidSchema,
  user_id: z.string().min(1),
  type: LearningEventTypeSchema,
  skill_id: z.string().min(1).nullable(),
  item_id: z.string().min(1).nullable(),
  payload: LearningEventPayloadSchema.default({}),
  duration_s: z.number().int().min(0).max(86_400).default(0),
  created_at: z.string().datetime({ offset: true }),
});
export type LearningEvent = z.infer<typeof LearningEventSchema>;
export type LearningEventInput = z.input<typeof LearningEventSchema>;

// ── Tracks (one per role family a user is studying) ─────────────────────────

export const UserTrackSchema = z.object({
  user_id: z.string().min(1),
  track_id: RoleFamilyIdSchema,
  status: z.enum(['active', 'archived']),
  horizon_months: z.union([z.literal(1), z.literal(3), z.literal(6)]).default(3),
  daily_hours: z.union([z.literal(1), z.literal(2), z.literal(4)]).default(2),
  started_at: z.string().datetime({ offset: true }),
  archived_at: z.string().datetime({ offset: true }).nullable().default(null),
});
export type UserTrack = z.infer<typeof UserTrackSchema>;

// ── Content bundle (what the seed files / content sync deliver) ─────────────

export const ContentBundleSchema = z.object({
  version: z.string(),
  skills: z.array(SkillSchema),
  prerequisites: z.array(SkillPrerequisiteSchema),
  roles: z.array(RoleFamilySchema),
  role_skills: z.array(RoleSkillSchema),
  resources: z.array(LearningResourceSchema),
  lessons: z.array(LessonSchema),
  practice_items: z.array(PracticeItemSchema),
  // Learn v2 catalogue
  modules: z.array(LearnModuleSchema).default([]),
  topics: z.array(LearnTopicSchema).default([]),
  projects: z.array(ProjectSchema).default([]),
  problems: z.array(ProblemInfoSchema).default([]),
});
export type ContentBundle = z.infer<typeof ContentBundleSchema>;

/** Skill mastery map: skill id -> 0..1. */
export type MasteryMap = Record<string, number>;

/** Mastery at or above this counts as "mastered" everywhere. */
export const MASTERY_THRESHOLD = 0.8;

/**
 * Learn v2 data model: catalogue (modules, topics, problems, projects) and the
 * student's state (intake, roadmap, schedule, projects). Every shape that is
 * stored, synced or produced by the model is a zod schema here.
 */
import { z } from 'zod';
import { ContentStatusSchema, RoleFamilyIdSchema, SlugSchema, UuidSchema } from '../types';

// ── Enums ───────────────────────────────────────────────────────────────────

export const STREAMS = ['dsa', 'core_cs', 'dev', 'aptitude', 'interview'] as const;
export const StreamSchema = z.enum(STREAMS);
export type Stream = z.infer<typeof StreamSchema>;

export const STREAM_LABELS: Record<Stream, string> = {
  dsa: 'DSA',
  core_cs: 'Core CS',
  dev: 'Development',
  aptitude: 'Aptitude',
  interview: 'Interview prep',
};

export const DSA_LANGUAGES = ['cpp', 'java', 'python'] as const;
export const DsaLanguageSchema = z.enum(DSA_LANGUAGES);
export type DsaLanguage = z.infer<typeof DsaLanguageSchema>;

export const AIMS = ['campus', 'internship', 'offcampus', 'switch'] as const;
export const AimSchema = z.enum(AIMS);
export type Aim = z.infer<typeof AimSchema>;

export const EMPHASES = ['light', 'standard', 'deep'] as const;
export const EmphasisSchema = z.enum(EMPHASES);
export type Emphasis = z.infer<typeof EmphasisSchema>;

export const TOPIC_TIERS = ['core', 'standard', 'optional'] as const;
export const TopicTierSchema = z.enum(TOPIC_TIERS);
export type TopicTier = z.infer<typeof TopicTierSchema>;

export const LEVELS = ['new', 'some', 'comfortable'] as const;
export const LevelSchema = z.enum(LEVELS);
export type Level = z.infer<typeof LevelSchema>;

export const TASK_KINDS = ['learn', 'read', 'solve', 'quiz', 'build', 'practice', 'revise', 'mock'] as const;
export const TaskKindSchema = z.enum(TASK_KINDS);
export type TaskKind = z.infer<typeof TaskKindSchema>;

export const PROJECT_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export const ProjectLevelSchema = z.enum(PROJECT_LEVELS);
export type ProjectLevel = z.infer<typeof ProjectLevelSchema>;

/** Calendar day, YYYY-MM-DD. */
export const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');
const IsoSchema = z.string().datetime({ offset: true });

const noUrls = (s: string) => !/https?:\/\/|www\./i.test(s);
/** Body text that must never carry links (links only come from curated resources). */
const Text = (max: number) => z.string().min(1).max(max).refine(noUrls, 'text must not contain URLs');

/** `lc:<slug>`: a problem in the LeetCode company dataset. */
export const ProblemRefSchema = z.string().regex(/^lc:[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be lc:<slug>');

// ── Catalogue ───────────────────────────────────────────────────────────────

export const ModulePrerequisiteSchema = z.object({
  module_id: SlugSchema,
  kind: z.enum(['hard', 'soft']).default('hard'),
});

export const LearnModuleSchema = z.object({
  id: SlugSchema,
  title: z.string().min(1).max(80),
  summary: Text(400),
  stream: StreamSchema,
  /** Empty = every role. */
  role_families: z.array(RoleFamilyIdSchema).default([]),
  /** Empty = every aim. */
  aims: z.array(AimSchema).default([]),
  /** Language modules are only planned for the student's DSA language. */
  language: DsaLanguageSchema.nullable().default(null),
  level: z.number().int().min(1).max(5),
  /** Catalogue order inside the stream (tie-breaker after prerequisites). */
  order: z.number().int().min(0),
  prerequisites: z.array(ModulePrerequisiteSchema).default([]),
  skill_ids: z.array(SlugSchema).default([]),
  status: ContentStatusSchema.default('draft'),
  ai_drafted: z.boolean().default(true),
  version: z.number().int().positive().default(1),
});
export type LearnModule = z.infer<typeof LearnModuleSchema>;

export const TopicTaskSchema = z.object({
  key: SlugSchema,
  kind: z.enum(['learn', 'read', 'build', 'practice']),
  title: z.string().min(1).max(140).refine(noUrls, 'text must not contain URLs'),
  minutes: z.number().int().min(5).max(90),
  optional: z.boolean().default(false),
});
export type TopicTask = z.infer<typeof TopicTaskSchema>;

export const LearnTopicSchema = z.object({
  id: SlugSchema,
  module_id: SlugSchema,
  order: z.number().int().min(0),
  title: z.string().min(1).max(100),
  summary_md: Text(1200),
  key_points: z.array(z.string().min(1).max(240).refine(noUrls, 'text must not contain URLs')).default([]),
  tier: TopicTierSchema,
  skill_ids: z.array(SlugSchema).default([]),
  resource_ids: z.array(SlugSchema).default([]),
  learn_minutes: z.number().int().min(5).max(90),
  learn_kind: z.enum(['learn', 'read']).default('learn'),
  problems: z
    .object({
      must: z.array(ProblemRefSchema).default([]),
      good: z.array(ProblemRefSchema).default([]),
      stretch: z.array(ProblemRefSchema).default([]),
    })
    .default({}),
  /** Dataset topic tags used for the company boost (e.g. "Sliding Window"). */
  lc_tags: z.array(z.string().min(1)).default([]),
  quiz_item_ids: z.array(SlugSchema).default([]),
  tasks: z.array(TopicTaskSchema).default([]),
  status: ContentStatusSchema.default('draft'),
  ai_drafted: z.boolean().default(true),
});
export type LearnTopic = z.infer<typeof LearnTopicSchema>;

export const ProblemDifficultySchema = z.enum(['easy', 'medium', 'hard']);
export type ProblemDifficulty = z.infer<typeof ProblemDifficultySchema>;

export const ProblemInfoSchema = z.object({
  ref: ProblemRefSchema,
  title: z.string().min(1),
  difficulty: ProblemDifficultySchema,
  link: z.string().regex(/^https:\/\/leetcode\.com\/problems\/[a-z0-9-]+\/?$/),
  /** Number of company lists in the dataset that include this problem. */
  companies: z.number().int().min(0),
  tags: z.array(z.string()).default([]),
  /** null = not checked. */
  paid_only: z.boolean().nullable().default(null),
});
export type ProblemInfo = z.infer<typeof ProblemInfoSchema>;

export const RepoRulesSchema = z.object({
  /** Simple globs (`*`, `**`), matched case-insensitively against repo paths. */
  paths: z.array(z.string().min(1).max(120)).max(10).default([]),
  readme_sections: z.array(z.string().min(1).max(60)).max(8).default([]),
  min_commits: z.number().int().min(0).max(50).default(1),
});
export type RepoRules = z.infer<typeof RepoRulesSchema>;

export const ProjectStepSchema = z.object({
  title: z.string().min(1).max(120).refine(noUrls, 'text must not contain URLs'),
  detail: Text(900),
  minutes: z.number().int().min(10).max(30),
});
export type ProjectStep = z.infer<typeof ProjectStepSchema>;

export const ProjectStageSchema = z.object({
  id: SlugSchema,
  order: z.number().int().min(0),
  title: z.string().min(1).max(80),
  goal: Text(240),
  topic_ids: z.array(SlugSchema).default([]),
  steps: z.array(ProjectStepSchema).min(3).max(8),
  hints: z.array(Text(300)).min(1).max(3),
  acceptance: z
    .array(z.object({ id: SlugSchema, text: Text(200) }))
    .min(3)
    .max(6),
  repo_rules: RepoRulesSchema.nullable().default(null),
  self_check: z.array(Text(240)).min(2).max(3),
  commit_suggestion: z.string().min(1).max(80),
  resource_ids: z.array(SlugSchema).default([]),
});
export type ProjectStage = z.infer<typeof ProjectStageSchema>;

export const ProjectSchema = z.object({
  id: SlugSchema,
  title: z.string().min(1).max(80),
  pitch: Text(500),
  role_families: z.array(RoleFamilyIdSchema).min(1),
  level: ProjectLevelSchema,
  skill_ids: z.array(SlugSchema).min(1),
  stacks: z.array(z.string().min(1).max(40)).min(1).max(6),
  /** Catalogue modules that should come first. */
  prerequisite_modules: z.array(SlugSchema).default([]),
  /** What the finished project looks like (text only). */
  outcome: Text(500),
  stages: z.array(ProjectStageSchema).min(3).max(12),
  finish: z.object({
    readme_sections: z.array(z.string().min(1).max(60)).min(1).max(10),
    deploy_steps: z.array(Text(240)).min(1).max(8),
    resume_verbs: z.array(z.string().min(1).max(30)).min(1).max(8),
  }),
  status: ContentStatusSchema.default('draft'),
  ai_drafted: z.boolean().default(true),
  version: z.number().int().positive().default(1),
  source_reference: z.string().max(200).nullable().default(null),
});
export type Project = z.infer<typeof ProjectSchema>;

// ── Student state ───────────────────────────────────────────────────────────

const minutesPerDay = z.number().int().min(0).max(600);

export const IntakeSchema = z
  .object({
    role: RoleFamilyIdSchema,
    aim: AimSchema,
    start_date: DateSchema,
    end_date: DateSchema,
    /** 0 = Sunday … 6 = Saturday. */
    study_days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    weekday_minutes: minutesPerDay,
    weekend_minutes: minutesPerDay,
    blackouts: z.array(DateSchema).max(60).default([]),
    streams: z.array(StreamSchema).min(1),
    levels: z
      .object({ dsa: LevelSchema, core_cs: LevelSchema, dev: LevelSchema, aptitude: LevelSchema })
      .default({ dsa: 'new', core_cs: 'new', dev: 'new', aptitude: 'new' }),
    language: DsaLanguageSchema.default('cpp'),
    known_skill_ids: z.array(SlugSchema).max(150).default([]),
    /** Company keys from the LeetCode dataset (e.g. "amazon"). */
    companies: z.array(z.string().min(1).max(60)).max(10).default([]),
    note: z.string().max(500).default(''),
  })
  .refine((i) => i.end_date > i.start_date, { message: 'end date must be after the start date', path: ['end_date'] });
export type Intake = z.infer<typeof IntakeSchema>;
export type IntakeInput = z.input<typeof IntakeSchema>;

export const CustomTaskSchema = z.object({
  key: SlugSchema,
  kind: z.enum(['learn', 'read', 'build', 'practice']),
  title: z.string().min(1).max(140),
  minutes: z.number().int().min(10).max(60),
});

export const CustomModuleSchema = z.object({
  title: z.string().min(1).max(80),
  summary: z.string().max(400).default(''),
  stream: StreamSchema,
  topics: z
    .array(
      z.object({
        key: SlugSchema,
        title: z.string().min(1).max(100),
        summary: z.string().max(600).default(''),
        tasks: z.array(CustomTaskSchema).min(1).max(6),
      })
    )
    .min(1)
    .max(8),
});
export type CustomModule = z.infer<typeof CustomModuleSchema>;

export const RoadmapModuleSchema = z.object({
  module_id: SlugSchema,
  emphasis: EmphasisSchema,
  skip_topics: z.array(SlugSchema).default([]),
  why: z.string().max(300).default(''),
  /** Set when the module was added because another module needs it. */
  added_for: z.string().nullable().default(null),
  custom: CustomModuleSchema.nullable().default(null),
});
export type RoadmapModule = z.infer<typeof RoadmapModuleSchema>;

export const RoadmapSchema = z.object({
  id: UuidSchema,
  version: z.literal(2).default(2),
  track_id: RoleFamilyIdSchema,
  intake: IntakeSchema,
  source: z.enum(['ai', 'rules']),
  summary: z.string().max(600).default(''),
  /** Percent of study time per stream (integers summing to 100). */
  streams: z.record(StreamSchema, z.number().int().min(0).max(100)),
  modules: z.array(RoadmapModuleSchema).min(1).max(80),
  projects: z
    .array(z.object({ project_id: SlugSchema, after_module: SlugSchema.nullable().default(null), why: z.string().max(300).default('') }))
    .max(4)
    .default([]),
  /** Extra problems from the student's target companies, per topic. */
  boosts: z.array(z.object({ topic_id: SlugSchema, problems: z.array(ProblemInfoSchema).max(6) })).default([]),
  warnings: z.array(z.string().max(300)).max(30).default([]),
  created_at: IsoSchema,
  accepted_at: IsoSchema.nullable().default(null),
});
export type Roadmap = z.infer<typeof RoadmapSchema>;
export type RoadmapInput = z.input<typeof RoadmapSchema>;

/** One unit of planned work, expanded from a roadmap (never stored; derived). */
export interface PlanTask {
  id: string;
  kind: TaskKind;
  title: string;
  minutes: number;
  stream: Stream;
  module_id: string;
  topic_id: string | null;
  optional: boolean;
  splittable: boolean;
  problem_ref?: string;
  project_id?: string;
  stage_id?: string;
  /** Indexes of the project steps this chunk covers. */
  steps?: number[];
  /** Why the task is here when it is not plain catalogue content (e.g. "On Amazon's list"). */
  note?: string;
}

export const DAY_KINDS = ['study', 'revision', 'buffer', 'mock', 'off'] as const;
export const DayKindSchema = z.enum(DAY_KINDS);
export type DayKind = z.infer<typeof DayKindSchema>;

export const ScheduleEntrySchema = z.object({
  task_id: z.string().min(1).max(200),
  minutes: z.number().int().min(1).max(600),
  stream: StreamSchema,
  part: z.number().int().min(1).default(1),
  parts: z.number().int().min(1).default(1),
});
export type ScheduleEntry = z.infer<typeof ScheduleEntrySchema>;

export const ScheduleDaySchema = z.object({
  date: DateSchema,
  kind: DayKindSchema,
  capacity: z.number().int().min(0).max(600),
  review_minutes: z.number().int().min(0).max(60).default(0),
  tasks: z.array(ScheduleEntrySchema).default([]),
});
export type ScheduleDay = z.infer<typeof ScheduleDaySchema>;

export const LeftOutSchema = z.object({
  task_id: z.string().min(1).max(200),
  minutes: z.number().int().min(0),
  reason: z.enum(['optional', 'emphasis', 'no_time']),
});
export type LeftOut = z.infer<typeof LeftOutSchema>;

export const ScheduleSchema = z.object({
  roadmap_id: UuidSchema,
  generated_at: IsoSchema,
  start_date: DateSchema,
  end_date: DateSchema,
  pace_factor: z.number().min(0.6).max(1.8).default(1),
  days: z.array(ScheduleDaySchema).max(400),
  left_out: z.array(LeftOutSchema).default([]),
});
export type Schedule = z.infer<typeof ScheduleSchema>;

export const UserProjectSchema = z.object({
  project_id: SlugSchema,
  status: z.enum(['active', 'done', 'abandoned']),
  repo_url: z.string().max(200).nullable().default(null),
  started_at: IsoSchema,
  finished_at: IsoSchema.nullable().default(null),
  stage_started_at: z.record(z.string(), IsoSchema).default({}),
  steps_done: z.array(z.string().max(80)).max(200).default([]),
  criteria_done: z.array(z.string().max(80)).max(200).default([]),
  hints_shown: z.record(z.string(), z.number().int().min(0).max(3)).default({}),
  stages_done: z.array(SlugSchema).max(20).default([]),
  /** Numbers the student typed for resume bullets (never invented). */
  resume_inputs: z.record(z.string(), z.string().max(200)).default({}),
  updated_at: IsoSchema,
});
export type UserProject = z.infer<typeof UserProjectSchema>;

export const ProblemNoteSchema = z.object({
  ref: ProblemRefSchema,
  note: z.string().max(2000).default(''),
  resolve_later: z.boolean().default(false),
  updated_at: IsoSchema,
});
export type ProblemNote = z.infer<typeof ProblemNoteSchema>;

/** Keys of the synced student-state documents. */
export const LEARN_STATE_KINDS = ['roadmap', 'schedule', 'projects', 'notes'] as const;
export type LearnStateKind = (typeof LEARN_STATE_KINDS)[number];

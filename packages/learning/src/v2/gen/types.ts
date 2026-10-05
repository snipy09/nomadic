/**
 * Shapes for the generated Project Library: app ideas, data/ML ideas, stacks
 * with their code kits, and stage templates. A project is one idea built on
 * one stack at one level; its stages come from the stack kind's templates.
 */
import type { RoleFamilyId } from '../../primitives';
import type { ProjectLevel } from '../types';

export type StackKind = 'frontend' | 'backend' | 'fullstack' | 'mobile' | 'cli' | 'data' | 'ml' | 'devops';

export type FieldType = 'text' | 'longtext' | 'number' | 'money' | 'date' | 'enum' | 'boolean';

export interface FieldDef {
  /** camelCase field name, e.g. `amount`, `dueDate`. */
  name: string;
  /** Lower-case label, e.g. "due date". */
  label: string;
  type: FieldType;
  /** For enums: 2–6 values, e.g. ['todo', 'doing', 'done']. */
  options?: string[];
  required?: boolean;
}

export interface EntityDef {
  /** Singular, lower case, may contain spaces: "expense", "study session". */
  name: string;
  /** Plural, lower case: "expenses", "study sessions". */
  plural: string;
  /** 3–6 fields; the first text field is the display title. */
  fields: FieldDef[];
}

/** An app that can be built as a frontend, an API, a full-stack app, a mobile app or a CLI. */
export interface AppIdea {
  /** Kebab-case, unique among ideas. */
  key: string;
  /** "Expense tracker". */
  title: string;
  /** One or two sentences: what it does and for whom (at most 220 characters). */
  pitch: string;
  /** Why it is a good portfolio piece (at most 160 characters). */
  why: string;
  entity: EntityDef;
  /**
   * Three idea-specific features for intermediate and advanced builds, as verb
   * phrases that complete "The app can …": "show the monthly total per category".
   */
  features: [string, string, string];
  /** Kinds this idea fits (subset of frontend, backend, fullstack, mobile, cli, devops). */
  kinds: StackKind[];
  /** Search words, e.g. ['finance', 'students']. */
  tags: string[];
}

export type MlTask = 'classification' | 'regression' | 'clustering' | 'text' | 'image' | 'recommendation' | 'forecasting';

/** A data analysis or machine-learning project on a public dataset described in words. */
export interface DataIdea {
  key: string;
  title: string;
  pitch: string;
  why: string;
  /** The dataset in words (no links): what one row is and its main columns. */
  dataset: string;
  /** How to get it without a link, e.g. "search Kaggle for 'IPL complete dataset'". */
  source: string;
  /** 4–6 questions the analysis answers. */
  questions: string[];
  /** For ML: what the model predicts, e.g. "whether a loan is repaid". */
  target?: string;
  task?: MlTask;
  /** Metric to report, e.g. "F1 score" or "MAE in rupees". */
  metric?: string;
  kinds: Array<'data' | 'ml'>;
  tags: string[];
}

/** Per-language naming helpers for an entity. */
export interface Names {
  /** "study session" */
  one: string;
  /** "study sessions" */
  many: string;
  /** "Study session" */
  One: string;
  /** "Study sessions" */
  Many: string;
  /** "studySession" */
  camel: string;
  /** "studySessions" */
  camelMany: string;
  /** "StudySession" */
  Pascal: string;
  /** "StudySessions" */
  PascalMany: string;
  /** "study_session" */
  snake: string;
  /** "study_sessions" */
  snakeMany: string;
  /** "study-sessions" */
  kebabMany: string;
}

export interface Ctx {
  idea: AppIdea;
  stack: StackDef;
  level: ProjectLevel;
  n: Names;
  fields: FieldDef[];
  /** The display field (first text field). */
  titleField: FieldDef;
}

export interface DataCtx {
  idea: DataIdea;
  stack: StackDef;
  level: ProjectLevel;
}

export interface StackDef {
  /** Kebab-case, unique among stacks. */
  key: string;
  /** "React + TypeScript (Vite)". */
  label: string;
  /** Short label for titles, e.g. "React". */
  short: string;
  kind: StackKind;
  /** Project.stacks: 1–6 technology names. */
  tech: string[];
  /** Skill ids from the skill graph. */
  skills: string[];
  roles: RoleFamilyId[];
  /** Catalogue modules that should come first. */
  modules: string[];
  levels: ProjectLevel[];
  /** Language of the code snippets (for display): 'tsx', 'python', 'java', 'go', 'bash', … */
  lang: string;
  /** Free hosting for the deploy stage, e.g. "Vercel or Netlify". */
  host: string;
}

/** One step as authored by a template (minutes come from the template). */
export interface StepDraft {
  title: string;
  detail: string;
  code?: string;
}

export interface StageDraft {
  title: string;
  goal: string;
  steps: StepDraft[];
  hints: string[];
  acceptance: string[];
  repo: { paths: string[]; readme?: string[] };
  self_check: string[];
  commit: string;
  topics?: string[];
}

/**
 * A stage template: fixed step minutes (so library summaries never render text)
 * and a builder for the text. `build` must return exactly `minutes.length` steps.
 */
export interface StageTemplate<C> {
  id: string;
  minutes: number[];
  build: (c: C) => StageDraft;
}

/** Templates for one kind: the stages each level gets, in order. */
export interface KindPlan<C> {
  kind: StackKind;
  stages: (level: ProjectLevel) => StageTemplate<C>[];
  /** Outcome text and finish kit for a project. */
  outcome: (c: C) => string;
  readme: (c: C) => string[];
  deploy: (c: C) => string[];
  verbs: string[];
}

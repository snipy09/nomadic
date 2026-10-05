/**
 * Authoring shapes for the Learn v2 catalogue. Seed sources write modules and
 * topics in this compact form; index.ts expands them into LearnModule,
 * LearnTopic and quiz PracticeItem rows. Text is AI-drafted (status draft,
 * ai_drafted true) and never contains URLs; links come only from resources.
 */
import type { Aim, DsaLanguage, Stream } from '../../../src/v2/types';
import type { RoleFamilyId } from '../../../src/primitives';

export interface QuizDef {
  q: string;
  options: string[];
  /** Index of the correct option (or several for "select all"). */
  answer: number | number[];
  why: string;
}

export interface TaskDef {
  key: string;
  kind: 'learn' | 'read' | 'build' | 'practice';
  title: string;
  minutes: number;
  optional?: boolean;
}

export interface TopicDef {
  key: string;
  title: string;
  tier?: 'core' | 'standard' | 'optional';
  /** Learn task minutes. */
  min: number;
  kind?: 'learn' | 'read';
  sum: string;
  pts: string[];
  /**
   * What to learn, in study order: 4-8 concrete items, each "Name: what exactly to know"
   * (at most 160 characters, no URLs). Shown as the topic's syllabus and split across the
   * days a long learn task spans.
   */
  learn?: string[];
  /** Space-separated LeetCode slugs. */
  must?: string;
  good?: string;
  stretch?: string;
  /** Dataset topic tags for the company boost. */
  tags?: string[];
  quiz?: QuizDef[];
  tasks?: TaskDef[];
  res?: string[];
  skills?: string[];
}

export interface ModuleDef {
  id: string;
  title: string;
  summary: string;
  stream: Stream;
  level: 1 | 2 | 3 | 4 | 5;
  order: number;
  pre?: string[];
  soft?: string[];
  roles?: RoleFamilyId[];
  aims?: Aim[];
  language?: DsaLanguage;
  skills: string[];
  /** Resources shown on every topic of the module (topic `res` come first). */
  res?: string[];
  topics: TopicDef[];
}

/**
 * One dev-stream topic of a skill's syllabus (scripts/seed-source/v2/dev/*.ts). The skill is
 * implied; `depth` marks topics that only deeper plans include ('standard': standard and deep
 * emphasis, 'optional': deep only). Resources are never authored here.
 */
export type DevTopicDef = Omit<TopicDef, 'skills' | 'res' | 'must' | 'good' | 'stretch' | 'tags' | 'tier'> & {
  depth?: 'standard' | 'optional';
};

/** Authored dev syllabus: skill id → its topics in study order (the first is keyed by the skill id). */
export type DevSyllabus = Record<string, DevTopicDef[]>;

/** SDE roles plus data-ml and devops: the audience of advanced DSA. */
export const ADVANCED_DSA_ROLES: RoleFamilyId[] = ['frontend', 'backend', 'fullstack', 'data-ml', 'devops'];

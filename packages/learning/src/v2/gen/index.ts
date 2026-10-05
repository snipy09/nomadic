/**
 * Generated Project Library: every app idea built on every stack of the
 * kinds it lists (frontend and backend so far), at each level the stack
 * supports, plus data-analysis projects on public datasets. Ideas already name
 * the other kinds (full stack, mobile, CLI, DevOps, ML); they appear once a
 * kind file exists for them. Summaries (for the library grid) never render stage text;
 * a full guided project is built on demand and cached.
 *
 * Ids: `g.<idea>.<stack>.<b|i|a>`. They are stable as long as idea and stack
 * keys do not change, because saved progress refers to them.
 */
import { ProjectSchema, type Project, type ProjectLevel, type ProjectStage } from '../types';
import type { RoleFamilyId } from '../../primitives';
import { APP_IDEAS } from './ideas';
import { DATA_IDEAS } from './dataIdeas';
import { clip, makeCtx } from './names';
import type { AppIdea, Ctx, DataCtx, DataIdea, KindPlan, StackDef, StackKind, StageDraft, StageTemplate } from './types';
import { BACKEND } from './kinds/backend';
import { CLI } from './kinds/cli';
import { DATA } from './kinds/data';
import { DEVOPS } from './kinds/devops';
import { FRONTEND } from './kinds/frontend';
import { FULLSTACK } from './kinds/fullstack';
import { ML } from './kinds/ml';
import { MOBILE } from './kinds/mobile';

export * from './types';
export { names, makeCtx } from './names';

interface AppKind {
  stacks: StackDef[];
  plan: KindPlan<Ctx>;
}
interface DataKind {
  stacks: StackDef[];
  plan: KindPlan<DataCtx>;
}

const APP_KINDS: AppKind[] = [FRONTEND, BACKEND, FULLSTACK, MOBILE, CLI, DEVOPS];
const DATA_KINDS: DataKind[] = [DATA, ML];

export const LEVEL_CODE: Record<ProjectLevel, string> = { beginner: 'b', intermediate: 'i', advanced: 'a' };
const LEVEL_OF: Record<string, ProjectLevel> = { b: 'beginner', i: 'intermediate', a: 'advanced' };

export const GENERATED_PREFIX = 'g.';

export function isGeneratedProjectId(id: string): boolean {
  return id.startsWith(GENERATED_PREFIX);
}

export function generatedProjectId(ideaKey: string, stackKey: string, level: ProjectLevel): string {
  return `${GENERATED_PREFIX}${ideaKey}.${stackKey}.${LEVEL_CODE[level]}`;
}

/** What the library grid needs, without rendering any stage text. */
export interface ProjectSummary {
  id: string;
  title: string;
  idea: string;
  pitch: string;
  kind: StackKind;
  stack: string;
  stack_label: string;
  level: ProjectLevel;
  tech: string[];
  roles: RoleFamilyId[];
  skill_ids: string[];
  minutes: number;
  stages: number;
  tags: string[];
  /** Lower-case text the search box matches. */
  search: string;
}

const LEVEL_BLURB: Record<ProjectLevel, string> = {
  beginner: 'A first build: you start from an empty folder and finish with something that works and is online.',
  intermediate: 'A fuller build with real features, validation and tests, the kind interviewers ask you to walk through.',
  advanced: 'A production-style build with tests, automation and deployment, ready to lead your resume.',
};

const titleOf = (ideaTitle: string, stack: StackDef) => clip(`${ideaTitle} (${stack.short})`, 80);
const pitchOf = (pitch: string, stack: StackDef, level: ProjectLevel) => clip(`${pitch} Built with ${stack.label}. ${LEVEL_BLURB[level]}`, 500);

function templateMinutes<C>(tpls: StageTemplate<C>[]): number {
  return tpls.reduce((n, t) => n + t.minutes.reduce((a, b) => a + b, 0), 0);
}

function fitsKind(idea: AppIdea, kind: StackKind): boolean {
  return idea.kinds.includes(kind);
}

let summaries: ProjectSummary[] | null = null;
const summaryById = new Map<string, ProjectSummary>();

/** Every generated project's summary, in a stable order (ideas, then kinds, stacks and levels). */
export function generatedSummaries(): ProjectSummary[] {
  if (summaries) return summaries;
  const out: ProjectSummary[] = [];
  const push = (s: Omit<ProjectSummary, 'search'>) => {
    const full: ProjectSummary = {
      ...s,
      search: [s.title, s.pitch, s.stack_label, ...s.tech, ...s.tags, ...s.skill_ids, s.kind, s.level].join(' ').toLowerCase(),
    };
    out.push(full);
    summaryById.set(full.id, full);
  };
  for (const idea of APP_IDEAS) {
    for (const k of APP_KINDS) {
      if (!fitsKind(idea, k.plan.kind)) continue;
      for (const stack of k.stacks) {
        for (const level of stack.levels) {
          const tpls = k.plan.stages(level);
          push({
            id: generatedProjectId(idea.key, stack.key, level),
            title: titleOf(idea.title, stack),
            idea: idea.key,
            pitch: pitchOf(idea.pitch, stack, level),
            kind: stack.kind,
            stack: stack.key,
            stack_label: stack.label,
            level,
            tech: stack.tech,
            roles: stack.roles,
            skill_ids: stack.skills,
            minutes: templateMinutes(tpls),
            stages: tpls.length,
            tags: idea.tags,
          });
        }
      }
    }
  }
  for (const idea of DATA_IDEAS) {
    for (const k of DATA_KINDS) {
      if (!idea.kinds.includes(k.plan.kind as 'data' | 'ml')) continue;
      for (const stack of k.stacks) {
        for (const level of stack.levels) {
          const tpls = k.plan.stages(level);
          push({
            id: generatedProjectId(idea.key, stack.key, level),
            title: titleOf(idea.title, stack),
            idea: idea.key,
            pitch: pitchOf(idea.pitch, stack, level),
            kind: stack.kind,
            stack: stack.key,
            stack_label: stack.label,
            level,
            tech: stack.tech,
            roles: stack.roles,
            skill_ids: stack.skills,
            minutes: templateMinutes(tpls),
            stages: tpls.length,
            tags: idea.tags,
          });
        }
      }
    }
  }
  summaries = out;
  return out;
}

export function generatedSummary(id: string): ProjectSummary | null {
  generatedSummaries();
  return summaryById.get(id) ?? null;
}

class TextTooLong extends Error {}

function fit(s: string, max: number, strict: boolean, what: string): string {
  if (s.length <= max) return s;
  if (strict) throw new TextTooLong(`${what} is ${s.length} characters (max ${max}): ${s.slice(0, 80)}…`);
  return clip(s, max);
}

function toStage<C>(tpl: StageTemplate<C>, d: StageDraft, order: number, strict: boolean): ProjectStage {
  if (d.steps.length !== tpl.minutes.length) {
    throw new Error(`stage ${tpl.id}: ${d.steps.length} steps but ${tpl.minutes.length} step minutes`);
  }
  const where = `stage ${tpl.id}`;
  return {
    id: tpl.id,
    order,
    title: fit(d.title, 80, strict, `${where} title`),
    goal: fit(d.goal, 240, strict, `${where} goal`),
    topic_ids: d.topics ?? [],
    steps: d.steps.map((s, j) => ({
      title: fit(s.title, 120, strict, `${where} step title`),
      detail: fit(s.detail, 900, strict, `${where} step detail`),
      minutes: tpl.minutes[j],
      ...(s.code ? { code: fit(s.code, 2500, strict, `${where} step code`) } : {}),
    })),
    hints: d.hints.slice(0, 3).map((h) => fit(h, 300, strict, `${where} hint`)),
    acceptance: d.acceptance.slice(0, 6).map((text, k) => ({ id: `a${k + 1}`, text: fit(text, 200, strict, `${where} check`) })),
    repo_rules: { paths: d.repo.paths.slice(0, 10), readme_sections: (d.repo.readme ?? []).slice(0, 8), min_commits: 1 },
    self_check: d.self_check.slice(0, 3).map((q) => fit(q, 240, strict, `${where} self-check`)),
    commit_suggestion: fit(d.commit, 80, strict, `${where} commit`),
    resource_ids: [],
  };
}

function assemble<C>(
  plan: KindPlan<C>,
  ctx: C,
  base: { id: string; title: string; pitch: string; stack: StackDef; level: ProjectLevel },
  strict: boolean
): Project {
  const stages = plan.stages(base.level).map((tpl, i) => toStage(tpl, tpl.build(ctx), i, strict));
  const project = {
    id: base.id,
    title: base.title,
    pitch: base.pitch,
    role_families: base.stack.roles,
    level: base.level,
    skill_ids: base.stack.skills,
    stacks: base.stack.tech.slice(0, 6),
    prerequisite_modules: base.stack.modules,
    outcome: fit(plan.outcome(ctx), 500, strict, 'outcome'),
    stages,
    finish: {
      readme_sections: plan.readme(ctx).slice(0, 10),
      deploy_steps: plan.deploy(ctx).slice(0, 8).map((s) => fit(s, 240, strict, 'deploy step')),
      resume_verbs: plan.verbs.slice(0, 8),
    },
    status: 'draft' as const,
    ai_drafted: true,
    version: 1,
    source_reference: 'generated',
  };
  return strict ? ProjectSchema.parse(project) : (project as Project);
}

function findApp(ideaKey: string, stackKey: string): { idea: AppIdea; kind: AppKind; stack: StackDef } | null {
  const idea = APP_IDEAS.find((i) => i.key === ideaKey);
  if (!idea) return null;
  for (const kind of APP_KINDS) {
    const stack = kind.stacks.find((s) => s.key === stackKey);
    if (stack && fitsKind(idea, kind.plan.kind)) return { idea, kind, stack };
  }
  return null;
}

function findData(ideaKey: string, stackKey: string): { idea: DataIdea; kind: DataKind; stack: StackDef } | null {
  const idea = DATA_IDEAS.find((i) => i.key === ideaKey);
  if (!idea) return null;
  for (const kind of DATA_KINDS) {
    const stack = kind.stacks.find((s) => s.key === stackKey);
    if (stack && idea.kinds.includes(kind.plan.kind as 'data' | 'ml')) return { idea, kind, stack };
  }
  return null;
}

const cache = new Map<string, Project>();
const CACHE_MAX = 40;

/**
 * The full guided project for a generated id (null when the id is unknown).
 * `strict` throws when a template overflows a text limit instead of clipping
 * (used by the tests).
 */
export function generatedProject(id: string, opts: { strict?: boolean } = {}): Project | null {
  const strict = !!opts.strict;
  if (!strict && cache.has(id)) return cache.get(id)!;
  if (!isGeneratedProjectId(id)) return null;
  const [ideaKey, stackKey, code] = id.slice(GENERATED_PREFIX.length).split('.');
  const level = LEVEL_OF[code];
  if (!ideaKey || !stackKey || !level) return null;
  let project: Project | null = null;
  const app = findApp(ideaKey, stackKey);
  if (app && app.stack.levels.includes(level)) {
    project = assemble(
      app.kind.plan,
      makeCtx(app.idea, app.stack, level),
      { id, title: titleOf(app.idea.title, app.stack), pitch: pitchOf(app.idea.pitch, app.stack, level), stack: app.stack, level },
      strict
    );
  } else {
    const data = findData(ideaKey, stackKey);
    if (data && data.stack.levels.includes(level)) {
      project = assemble(
        data.kind.plan,
        { idea: data.idea, stack: data.stack, level },
        { id, title: titleOf(data.idea.title, data.stack), pitch: pitchOf(data.idea.pitch, data.stack, level), stack: data.stack, level },
        strict
      );
    }
  }
  if (project && !strict) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(id, project);
  }
  return project;
}

/** All stacks by kind (for the library filters). */
export function generatorStacks(): StackDef[] {
  return [...APP_KINDS, ...DATA_KINDS].flatMap((k) => k.stacks);
}

export { APP_IDEAS, DATA_IDEAS };

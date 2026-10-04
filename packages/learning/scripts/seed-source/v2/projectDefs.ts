/** Compact authoring helpers for Learn v2 projects (see projects.ts). */
import type { RoleFamilyId } from '../../../src/primitives';
import type { z } from 'zod';
import type { ProjectSchema } from '../../../src/v2/types';

export type ProjectInput = z.input<typeof ProjectSchema>;
type Out = ProjectInput;

type Step = [title: string, detail: string, minutes: number];

export function stage(
  id: string,
  title: string,
  goal: string,
  steps: Step[],
  hints: string[],
  acceptance: string[],
  repo: { paths: string[]; readme: string[]; commits: number },
  selfCheck: string[],
  commit: string,
  topics: string[]
) {
  return {
    id,
    title,
    goal,
    topic_ids: topics,
    steps: steps.map(([t, detail, minutes]) => ({ title: t, detail, minutes })),
    hints,
    acceptance: acceptance.map((text, i) => ({ id: `a${i + 1}`, text })),
    repo_rules: { paths: repo.paths, readme_sections: repo.readme, min_commits: repo.commits },
    self_check: selfCheck,
    commit_suggestion: commit,
    resource_ids: [] as string[],
  };
}

export function project(p: {
  id: string;
  title: string;
  pitch: string;
  roles: RoleFamilyId[];
  level: 'beginner' | 'intermediate' | 'advanced';
  skills: string[];
  stacks: string[];
  pre: string[];
  outcome: string;
  source: string;
  stages: Array<ReturnType<typeof stage>>;
  readme: string[];
  deploy: string[];
  verbs: string[];
}): Out {
  return {
    id: p.id,
    title: p.title,
    pitch: p.pitch,
    role_families: p.roles,
    level: p.level,
    skill_ids: p.skills,
    stacks: p.stacks,
    prerequisite_modules: p.pre,
    outcome: p.outcome,
    stages: p.stages.map((s, order) => ({ ...s, order })),
    finish: { readme_sections: p.readme, deploy_steps: p.deploy, resume_verbs: p.verbs },
    status: 'draft',
    ai_drafted: true,
    version: 1,
    source_reference: p.source,
  };
}

/**
 * Guided projects: stage progress, start rules, repo-check rules (simple
 * globs, README sections, commits since the stage started) and the finish kit
 * (README template, deploy steps, resume bullets from the student's own
 * numbers, interview questions).
 */
import type { Project, ProjectStage, RepoRules, UserProject } from './types';

export const stepKey = (stageId: string, index: number) => `${stageId}:${index}`;
export const criterionKey = (stageId: string, criterionId: string) => `${stageId}:${criterionId}`;

export function stageMinutes(stage: ProjectStage): number {
  return stage.steps.reduce((n, s) => n + s.minutes, 0);
}

export function projectMinutes(project: Project): number {
  return project.stages.reduce((n, s) => n + stageMinutes(s), 0);
}

export function orderedStages(project: Project): ProjectStage[] {
  return [...project.stages].sort((a, b) => a.order - b.order);
}

export interface StageProgress {
  stage_id: string;
  steps_done: number;
  steps_total: number;
  criteria_done: number;
  criteria_total: number;
  /** Every acceptance criterion is ticked (the stage may be marked done). */
  ready: boolean;
  done: boolean;
}

export function stageProgress(project: Project, up: UserProject | null): StageProgress[] {
  const steps = new Set(up?.steps_done ?? []);
  const criteria = new Set(up?.criteria_done ?? []);
  const doneStages = new Set(up?.stages_done ?? []);
  return orderedStages(project).map((s) => {
    const criteria_done = s.acceptance.filter((c) => criteria.has(criterionKey(s.id, c.id))).length;
    return {
      stage_id: s.id,
      steps_done: s.steps.filter((_, i) => steps.has(stepKey(s.id, i))).length,
      steps_total: s.steps.length,
      criteria_done,
      criteria_total: s.acceptance.length,
      ready: criteria_done === s.acceptance.length,
      done: doneStages.has(s.id),
    };
  });
}

export interface ProjectProgress {
  stages_done: number;
  stages_total: number;
  percent: number;
  /** First stage not done yet (null when all are done). */
  current_stage_id: string | null;
  minutes_total: number;
  minutes_left: number;
}

export function projectProgress(project: Project, up: UserProject | null): ProjectProgress {
  const stages = orderedStages(project);
  const done = new Set(up?.stages_done ?? []);
  const left = stages.filter((s) => !done.has(s.id));
  const total = projectMinutes(project);
  return {
    stages_done: stages.length - left.length,
    stages_total: stages.length,
    percent: stages.length ? Math.round(((stages.length - left.length) / stages.length) * 100) : 0,
    current_stage_id: left[0]?.id ?? null,
    minutes_total: total,
    minutes_left: left.reduce((n, s) => n + stageMinutes(s), 0),
  };
}

/** A user project that was just started. */
export function startUserProject(projectId: string, now: Date, firstStageId?: string): UserProject {
  const iso = now.toISOString();
  return {
    project_id: projectId,
    status: 'active',
    repo_url: null,
    started_at: iso,
    finished_at: null,
    stage_started_at: firstStageId ? { [firstStageId]: iso } : {},
    steps_done: [],
    criteria_done: [],
    hints_shown: {},
    stages_done: [],
    resume_inputs: {},
    updated_at: iso,
  };
}

function toggle(list: string[], key: string, on: boolean): string[] {
  const has = list.includes(key);
  if (on && !has) return [...list, key];
  if (!on && has) return list.filter((k) => k !== key);
  return list;
}

export function setStepDone(up: UserProject, stageId: string, index: number, on: boolean, now: Date): UserProject {
  return { ...up, steps_done: toggle(up.steps_done, stepKey(stageId, index), on), updated_at: now.toISOString() };
}

export function setCriterionDone(up: UserProject, stageId: string, criterionId: string, on: boolean, now: Date): UserProject {
  return {
    ...up,
    criteria_done: toggle(up.criteria_done, criterionKey(stageId, criterionId), on),
    updated_at: now.toISOString(),
  };
}

/** Reveals the next hint of a stage (at most the number of hints). */
export function showNextHint(up: UserProject, stage: ProjectStage, now: Date): UserProject {
  const n = Math.min(stage.hints.length, (up.hints_shown[stage.id] ?? 0) + 1);
  return { ...up, hints_shown: { ...up.hints_shown, [stage.id]: n }, updated_at: now.toISOString() };
}

/**
 * Marks a stage done (all criteria must be ticked) and starts the next one.
 * When it was the last stage the project becomes done.
 */
export function completeStage(
  project: Project,
  up: UserProject,
  stageId: string,
  now: Date
): { project: UserProject; error: string | null; finished: boolean } {
  const stage = project.stages.find((s) => s.id === stageId);
  if (!stage) return { project: up, error: 'Unknown stage.', finished: false };
  const ticked = stage.acceptance.every((c) => up.criteria_done.includes(criterionKey(stageId, c.id)));
  if (!ticked) return { project: up, error: 'Tick every acceptance check first.', finished: false };
  const iso = now.toISOString();
  const stages_done = up.stages_done.includes(stageId) ? up.stages_done : [...up.stages_done, stageId];
  const next = orderedStages(project).find((s) => !stages_done.includes(s.id));
  const finished = !next;
  return {
    project: {
      ...up,
      stages_done,
      stage_started_at: next && !up.stage_started_at[next.id] ? { ...up.stage_started_at, [next.id]: iso } : up.stage_started_at,
      status: finished ? 'done' : up.status,
      finished_at: finished ? iso : up.finished_at,
      updated_at: iso,
    },
    error: null,
    finished,
  };
}

export interface ProjectLimits {
  /** Active projects allowed at once (Infinity = unlimited). */
  active: number;
  beginnerOnly: boolean;
}

/** Whether a project may be started under the plan's limits. */
export function canStartProject(
  project: Project,
  mine: UserProject[],
  limits: ProjectLimits
): { ok: true } | { ok: false; reason: string } {
  if (limits.beginnerOnly && project.level !== 'beginner') {
    return { ok: false, reason: 'The free plan includes beginner projects. Upgrade to Pro for all projects.' };
  }
  const existing = mine.find((p) => p.project_id === project.id);
  if (existing?.status === 'active') return { ok: true };
  const active = mine.filter((p) => p.status === 'active').length;
  if (active >= limits.active) {
    return {
      ok: false,
      reason:
        limits.active === 1
          ? 'The free plan allows 1 active project. Finish or stop it first, or upgrade.'
          : `Your plan allows ${limits.active} active projects. Finish or stop one first.`,
    };
  }
  return { ok: true };
}

// ── Repo check ──────────────────────────────────────────────────────────────

/** `owner/repo` from a GitHub URL (https://github.com/owner/repo[.git][/...]). */
export function parseGithubRepo(url: string): { owner: string; repo: string } | null {
  const m = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?(?:[#?].*|\/.*)?$/.exec(
    url.trim()
  );
  if (!m) return null;
  if (m[2] === '.' || m[2] === '..') return null;
  return { owner: m[1], repo: m[2] };
}

/** Simple glob (`**`, `*`, `?`) to an anchored, case-insensitive RegExp over `/` paths. */
export function globToRegExp(glob: string): RegExp {
  let re = '';
  const g = glob.trim().replace(/^\.?\//, '');
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        i++;
        if (g[i + 1] === '/') {
          i++;
          re += '(?:.*/)?';
        } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'i');
}

export function matchGlob(glob: string, paths: string[]): boolean {
  const re = globToRegExp(glob);
  // A pattern also matches a directory when any path lives under it.
  return paths.some((p) => re.test(p) || re.test(p.split('/').slice(0, -1).join('/')));
}

/** README headings (any level), lower-cased and trimmed. */
export function readmeHeadings(readme: string): string[] {
  return readme
    .split(/\r?\n/)
    .map((l) => /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(l)?.[1])
    .filter((x): x is string => !!x)
    .map((x) => x.toLowerCase().trim());
}

export interface RepoFacts {
  paths: string[];
  readme: string | null;
  commits_since_stage_start: number;
}

export interface RepoCheck {
  label: string;
  ok: boolean;
}

export function evaluateRepoRules(rules: RepoRules, facts: RepoFacts): { ok: boolean; checks: RepoCheck[] } {
  const checks: RepoCheck[] = [];
  for (const p of rules.paths) checks.push({ label: `Has ${p}`, ok: matchGlob(p, facts.paths) });
  if (rules.readme_sections.length) {
    const headings = facts.readme ? readmeHeadings(facts.readme) : [];
    for (const s of rules.readme_sections) {
      const want = s.toLowerCase().replace(/^#+\s*/, '').trim();
      checks.push({ label: `README has a "${s}" section`, ok: headings.some((h) => h === want || h.startsWith(want)) });
    }
  }
  if (rules.min_commits > 0) {
    checks.push({
      label: `${rules.min_commits} commit${rules.min_commits === 1 ? '' : 's'} since the stage started`,
      ok: facts.commits_since_stage_start >= rules.min_commits,
    });
  }
  return { ok: checks.every((c) => c.ok), checks };
}

// ── Finish kit ──────────────────────────────────────────────────────────────

export const RESUME_INPUTS = [
  { key: 'result', label: 'A measurable result you saw (for example: cut page load from 3 s to 1 s)' },
  { key: 'scale', label: 'Users, requests or records it handled (only if you measured it)' },
] as const;

export interface FinishKit {
  readme: string;
  deploy_steps: string[];
  resume_bullets: string[];
  interview_questions: string[];
}

/**
 * Finish outputs. Resume bullets use only what the student typed in
 * `resume_inputs`; with nothing typed, bullets carry no numbers.
 */
export function finishKit(project: Project, up: UserProject | null): FinishKit {
  const stages = orderedStages(project);
  const done = new Set(up?.stages_done ?? []);
  const features = stages.filter((s) => done.has(s.id)).map((s) => s.title);
  const sections = project.finish.readme_sections.map((s) => {
    const body =
      /feature/i.test(s) && features.length
        ? features.map((f) => `- ${f}`).join('\n')
        : /stack|tech/i.test(s)
          ? project.stacks.map((x) => `- ${x}`).join('\n')
          : '_Write this section._';
    return `## ${s}\n\n${body}`;
  });
  const readme = [`# ${project.title}`, '', project.pitch, '', ...sections.flatMap((s) => [s, ''])].join('\n').trim() + '\n';
  const typed = RESUME_INPUTS.map((i) => (up?.resume_inputs[i.key] ?? '').trim()).filter(Boolean);
  const stack = project.stacks.slice(0, 3).join(', ');
  const resume_bullets = project.finish.resume_verbs.slice(0, 3).map((verb, i) => {
    const what = i === 0 ? project.title : (features[i - 1] ?? project.title);
    const extra = typed[i] ? `; ${typed[i]}` : '';
    return `${verb} ${what} with ${stack}${extra}.`;
  });
  const interview_questions = stages.flatMap((s) => s.self_check);
  return { readme, deploy_steps: project.finish.deploy_steps, resume_bullets, interview_questions };
}

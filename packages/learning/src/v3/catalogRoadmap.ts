/**
 * The fallback when the AI cannot build a roadmap: for the built-in role
 * families, the same subjects → modules → topics tree made from the reviewed
 * catalogue, with its curated projects. Other roles have no fallback.
 */
import type { RoleFamilyId } from '../types';
import { orderModules, type CatalogIndex } from '../v2/catalog';
import { projectMinutes } from '../v2/projects';
import { ROLE_SHARES } from '../v2/roadmap';
import type { LearnModule, LearnTopic, Project, Stream } from '../v2/types';
import {
  CapstoneSchema,
  RoleRoadmapSchema,
  uniqueSlug,
  type Capstone,
  type RoleLevel,
  type RoleProject,
  type RoleRoadmap,
  type RoleRoadmapRequest,
  type RoleSubject,
} from './roleRoadmap';

const MATCHERS: Array<[RoleFamilyId, RegExp]> = [
  ['data-ml', /\b(data scien|machine learning|ml engineer|ai engineer|deep learning)/i],
  ['data-analyst', /\b(data analy|business analy|bi analy|analytics)/i],
  ['devops', /\b(devops|cloud|site reliability|sre|platform engineer|infrastructure)/i],
  ['product-manager', /\b(product manag|\bpm\b|product owner)/i],
  ['design', /\b(designer|ux|ui\b|ui\/ux|product design)/i],
  ['frontend', /\b(front[ -]?end|react|web developer|ui developer)/i],
  ['backend', /\b(back[ -]?end|api developer|server)/i],
  ['fullstack', /\b(full[ -]?stack|software (engineer|developer)|sde\b|programmer|web dev)/i],
];

/** The built-in role family a typed role matches, or null. */
export function matchRoleFamily(role: string): RoleFamilyId | null {
  for (const [id, re] of MATCHERS) if (re.test(role)) return id;
  return null;
}

const SUBJECT_TITLE: Record<Stream, string> = {
  dsa: 'Problem solving (DSA)',
  core_cs: 'Computer science fundamentals',
  dev: 'Role skills',
  aptitude: 'Aptitude',
  interview: 'Interview prep',
};
const SUBJECT_WHY: Record<Stream, string> = {
  dsa: 'Most technical interviews start with a coding round.',
  core_cs: 'Interviewers check the fundamentals behind the code you write.',
  dev: 'The day-to-day skills of the role.',
  aptitude: 'Campus drives and many online tests start with aptitude.',
  interview: 'How you present yourself and your work decides the offer.',
};
const SUBJECT_ORDER: Stream[] = ['dev', 'dsa', 'core_cs', 'aptitude', 'interview'];

const TIERS: Record<RoleLevel, Array<LearnTopic['tier']>> = {
  beginner: ['core', 'standard'],
  intermediate: ['core', 'standard'],
  advanced: ['core', 'standard', 'optional'],
};

function covers(t: LearnTopic): string {
  const names = (t.learn_items.length ? t.learn_items : t.key_points).map((x) => /^([^:]{2,60}):/.exec(x)?.[1] ?? x);
  let out = '';
  for (const n of names) {
    const next = out ? `${out}, ${n}` : n;
    if (next.length > 200) break;
    out = next;
  }
  return out;
}

const LEVEL: Record<Project['level'], RoleProject['level']> = { beginner: 'starter', intermediate: 'intermediate', advanced: 'stretch' };

export function catalogRoleRoadmap(
  req: RoleRoadmapRequest,
  index: CatalogIndex,
  opts: { id: string; now: Date; language?: 'cpp' | 'java' | 'python' }
): RoleRoadmap | null {
  const family = matchRoleFamily(req.role);
  if (!family) return null;
  const shares = ROLE_SHARES[family] ?? {};
  const language = opts.language ?? 'python';
  const fits = (m: LearnModule) =>
    (shares[m.stream] ?? 0) > 0 &&
    (m.role_families.length === 0 || m.role_families.includes(family)) &&
    (m.language === null || m.language === language) &&
    (m.aims.length === 0 || m.aims.includes('offcampus') || m.aims.includes('campus'));
  const ordered = orderModules(index, index.catalog.modules.filter(fits).map((m) => m.id));
  const tiers = new Set(TIERS[req.level]);
  const moduleIds = new Set<string>();
  const subjects: RoleSubject[] = [];
  const subjectIds = new Set<string>();
  for (const stream of SUBJECT_ORDER) {
    const modules = ordered
      .map((id) => index.modules.get(id)!)
      .filter((m) => m.stream === stream)
      .map((m) => {
        const topicIds = new Set<string>();
        const topics = (index.topicsByModule.get(m.id) ?? [])
          .filter((t) => tiers.has(t.tier))
          .map((t) => ({ id: uniqueSlug(t.title, topicIds, 'topic'), title: t.title, covers: covers(t), search: `${t.title} ${m.title}`.slice(0, 120) }));
        return topics.length ? { id: uniqueSlug(m.title, moduleIds, 'module'), title: m.title, summary: m.summary.slice(0, 240), topics } : null;
      })
      .filter((m): m is NonNullable<typeof m> => !!m);
    if (!modules.length) continue;
    subjects.push({
      id: uniqueSlug(SUBJECT_TITLE[stream], subjectIds, 'subject'),
      title: SUBJECT_TITLE[stream],
      why: SUBJECT_WHY[stream],
      modules,
    });
  }
  if (!subjects.length) return null;
  const byCatalog = new Map(subjects.flatMap((s) => s.modules).map((m) => [m.title, m.id]));
  const projectIds = new Set<string>();
  const projects: RoleProject[] = index.catalog.projects
    .filter((p) => p.role_families.includes(family))
    .slice(0, 5)
    .map((p) => ({
      id: uniqueSlug(p.title, projectIds, 'project'),
      title: p.title,
      brief: p.pitch.slice(0, 300),
      deliverable: p.outcome.slice(0, 300),
      level: LEVEL[p.level],
      hours: Math.max(1, Math.round(projectMinutes(p) / 60)),
      uses: p.prerequisite_modules.map((id) => byCatalog.get(index.modules.get(id)?.title ?? '')).filter((x): x is string => !!x).slice(0, 8),
      source: 'curated' as const,
    }));
  const parsed = RoleRoadmapSchema.safeParse({
    id: opts.id,
    version: 3,
    role: req.role.trim(),
    level: req.level,
    note: req.note,
    source: 'catalog',
    summary: '',
    created_at: opts.now.toISOString(),
    subjects,
    projects,
    capstone: null,
  });
  return parsed.success ? parsed.data : null;
}

/** The guided plan of a curated catalogue project, as a capstone (stages → milestones, steps, acceptance → "done when"). */
export function catalogCapstone(project: Project, projectId: string, now: Date): Capstone | null {
  const mIds = new Set<string>();
  const stepIds = new Set<string>();
  const milestones = project.stages.slice(0, 10).map((st) => ({
    id: uniqueSlug(st.title, mIds, 'milestone'),
    title: st.title.slice(0, 100),
    steps: st.steps.slice(0, 10).map((s, i) => ({
      id: uniqueSlug(s.title, stepIds, 'step'),
      title: s.title.slice(0, 140),
      detail: s.detail.slice(0, 400),
      done_when: (i === st.steps.length - 1 ? st.acceptance[0]?.text ?? st.goal : st.goal).slice(0, 240),
      search: `${s.title} ${project.stacks[0] ?? ''}`.trim().slice(0, 120),
    })),
  }));
  const parsed = CapstoneSchema.safeParse({ project_id: projectId, created_at: now.toISOString(), source: 'curated', milestones });
  return parsed.success ? parsed.data : null;
}

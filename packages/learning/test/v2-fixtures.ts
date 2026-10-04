/** Small, hand-made Learn v2 catalogue for engine tests. */
import {
  IntakeSchema,
  LearnModuleSchema,
  LearnTopicSchema,
  ProblemInfoSchema,
  ProjectSchema,
  indexCatalog,
  uuidV5,
  type Catalog,
  type IntakeInput,
  type LearningEvent,
  type LearnModule,
  type LearnTopic,
  type ProblemInfo,
  type Project,
} from '../src';

export const mod = (id: string, patch: Partial<Record<string, unknown>> = {}): LearnModule =>
  LearnModuleSchema.parse({
    id,
    title: id,
    summary: `Summary of ${id}.`,
    stream: 'dsa',
    level: 2,
    order: 0,
    ...patch,
  });

export const topic = (id: string, module_id: string, patch: Partial<Record<string, unknown>> = {}): LearnTopic =>
  LearnTopicSchema.parse({
    id,
    module_id,
    order: 0,
    title: id,
    summary_md: `About ${id}.`,
    tier: 'core',
    learn_minutes: 20,
    ...patch,
  });

export const prob = (slug: string, difficulty: 'easy' | 'medium' | 'hard', patch: Partial<ProblemInfo> = {}): ProblemInfo =>
  ProblemInfoSchema.parse({
    ref: `lc:${slug}`,
    title: slug.replace(/-/g, ' '),
    difficulty,
    link: `https://leetcode.com/problems/${slug}/`,
    companies: 5,
    tags: ['Array'],
    paid_only: false,
    ...patch,
  });

const stage = (id: string, order: number, stepMinutes: number[]) => ({
  id,
  order,
  title: `Stage ${id}`,
  goal: `Goal of ${id}.`,
  steps: stepMinutes.map((m, i) => ({ title: `Step ${i + 1}`, detail: `Do step ${i + 1}.`, minutes: m })),
  hints: ['Hint one.', 'Hint two.'],
  acceptance: [
    { id: 'a1', text: 'First check.' },
    { id: 'a2', text: 'Second check.' },
    { id: 'a3', text: 'Third check.' },
  ],
  repo_rules: { paths: ['src/**/*.ts', 'README.md'], readme_sections: ['Setup'], min_commits: 1 },
  self_check: [`Why ${id}?`, `How ${id}?`],
  commit_suggestion: `feat: ${id}`,
});

export const project = (id: string, patch: Partial<Record<string, unknown>> = {}): Project =>
  ProjectSchema.parse({
    id,
    title: `Project ${id}`,
    pitch: 'A small project.',
    role_families: ['frontend', 'fullstack'],
    level: 'beginner',
    skill_ids: ['javascript', 'react'],
    stacks: ['React', 'TypeScript'],
    prerequisite_modules: ['dev.js'],
    outcome: 'A working app.',
    stages: [stage('setup', 0, [20, 20, 30]), stage('core', 1, [30, 30, 30, 20]), stage('ship', 2, [15, 15, 15])],
    finish: { readme_sections: ['Features', 'Stack', 'Setup'], deploy_steps: ['Push to the host.'], resume_verbs: ['Built', 'Shipped'] },
    ...patch,
  });

export const PROBLEMS: ProblemInfo[] = [
  prob('two-sum', 'easy', { tags: ['Array', 'Hash Table'], companies: 50 }),
  prob('contains-duplicate', 'easy', { tags: ['Array', 'Hash Table'] }),
  prob('3sum', 'medium', { tags: ['Array', 'Two Pointers'] }),
  prob('trapping-rain-water', 'hard', { tags: ['Array', 'Two Pointers'] }),
  prob('number-of-islands', 'medium', { tags: ['Graph', 'Depth-First Search'] }),
  prob('course-schedule', 'medium', { tags: ['Graph'] }),
  prob('alien-dictionary', 'hard', { tags: ['Graph'], paid_only: true }),
  prob('valid-anagram', 'easy', { tags: ['Hash Table', 'String'] }),
];

export const MODULES: LearnModule[] = [
  mod('dsa.basics', { level: 1, order: 0, skill_ids: ['programming-fundamentals'] }),
  mod('dsa.arrays', { level: 2, order: 1, prerequisites: [{ module_id: 'dsa.basics', kind: 'hard' }], skill_ids: ['dsa'] }),
  mod('dsa.graphs', {
    level: 4,
    order: 2,
    prerequisites: [{ module_id: 'dsa.arrays', kind: 'hard' }],
    role_families: ['frontend', 'backend', 'fullstack', 'data-ml', 'devops'],
    skill_ids: ['dsa'],
  }),
  mod('lang.cpp', { language: 'cpp', level: 1, order: 0, skill_ids: ['programming-fundamentals'] }),
  mod('lang.java', { language: 'java', level: 1, order: 0, skill_ids: ['programming-fundamentals'] }),
  mod('cs.oop', { stream: 'core_cs', level: 2, order: 0, skill_ids: ['oop'] }),
  mod('dev.js', { stream: 'dev', level: 2, order: 0, role_families: ['frontend', 'fullstack'], skill_ids: ['javascript'] }),
  mod('dev.react', {
    stream: 'dev',
    level: 3,
    order: 1,
    role_families: ['frontend', 'fullstack'],
    prerequisites: [{ module_id: 'dev.js', kind: 'hard' }],
    skill_ids: ['react'],
  }),
  mod('dev.backend', { stream: 'dev', level: 3, order: 2, role_families: ['backend', 'fullstack'], skill_ids: ['nodejs'] }),
  mod('apt.quant', { stream: 'aptitude', level: 1, order: 0, aims: ['campus'], skill_ids: ['aptitude-quant'] }),
  mod('int.hr', { stream: 'interview', level: 1, order: 0, skill_ids: ['behavioral-interviews'] }),
];

export const TOPICS: LearnTopic[] = [
  topic('dsa.basics.complexity', 'dsa.basics', { learn_minutes: 30, quiz_item_ids: ['q1', 'q2'] }),
  topic('dsa.basics.loops', 'dsa.basics', { order: 1, tier: 'standard', learn_minutes: 15 }),
  topic('dsa.arrays.hashing', 'dsa.arrays', {
    learn_minutes: 20,
    lc_tags: ['Hash Table'],
    problems: { must: ['lc:two-sum'], good: ['lc:contains-duplicate'], stretch: ['lc:valid-anagram'] },
    quiz_item_ids: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'],
  }),
  topic('dsa.arrays.two-pointers', 'dsa.arrays', {
    order: 1,
    learn_minutes: 25,
    lc_tags: ['Two Pointers'],
    problems: { must: ['lc:3sum', 'lc:two-sum'], good: ['lc:trapping-rain-water'], stretch: [] },
  }),
  topic('dsa.arrays.extra', 'dsa.arrays', { order: 2, tier: 'optional', learn_minutes: 15 }),
  topic('dsa.graphs.bfs', 'dsa.graphs', {
    learn_minutes: 30,
    lc_tags: ['Graph'],
    problems: { must: ['lc:number-of-islands', 'lc:alien-dictionary'], good: ['lc:course-schedule'], stretch: [] },
  }),
  topic('lang.cpp.stl', 'lang.cpp', { learn_minutes: 40 }),
  topic('lang.java.collections', 'lang.java', { learn_minutes: 40 }),
  topic('cs.oop.pillars', 'cs.oop', {
    learn_kind: 'read',
    learn_minutes: 30,
    tasks: [{ key: 'mcq', kind: 'practice', title: 'OOP questions', minutes: 15 }],
  }),
  topic('cs.oop.solid', 'cs.oop', { order: 1, tier: 'standard', learn_minutes: 25 }),
  topic('dev.js.basics', 'dev.js', {
    learn_minutes: 45,
    tasks: [
      { key: 'build', kind: 'build', title: 'Build a to-do list', minutes: 45 },
      { key: 'extra', kind: 'practice', title: 'Extra drills', minutes: 20, optional: true },
    ],
  }),
  topic('dev.react.components', 'dev.react', { learn_minutes: 40, tasks: [{ key: 'b', kind: 'build', title: 'Build a card', minutes: 30 }] }),
  topic('dev.react.hooks', 'dev.react', { order: 1, tier: 'standard', learn_minutes: 40 }),
  topic('dev.backend.rest', 'dev.backend', { learn_minutes: 40 }),
  topic('apt.quant.percent', 'apt.quant', { learn_minutes: 20, tasks: [{ key: 'drill', kind: 'practice', title: 'Percent drill', minutes: 20 }] }),
  topic('int.hr.star', 'int.hr', { learn_minutes: 20 }),
];

export const PROJECTS: Project[] = [
  project('todo-app'),
  project('dashboard', { level: 'intermediate', prerequisite_modules: ['dev.js', 'dev.react'] }),
  project('api-server', { role_families: ['backend', 'fullstack'], level: 'beginner', prerequisite_modules: ['dev.backend'] }),
];

export const CATALOG: Catalog = { modules: MODULES, topics: TOPICS, problems: PROBLEMS, projects: PROJECTS };
export const INDEX = indexCatalog(CATALOG);

export const intake = (patch: Partial<IntakeInput> = {}) =>
  IntakeSchema.parse({
    role: 'frontend',
    aim: 'campus',
    start_date: '2026-10-05', // a Monday
    end_date: '2026-12-27',
    study_days: [0, 1, 2, 3, 4, 5, 6],
    weekday_minutes: 60,
    weekend_minutes: 150,
    streams: ['dsa', 'core_cs', 'dev', 'aptitude', 'interview'],
    ...patch,
  });

let n = 0;
export function ev(type: LearningEvent['type'], at: string, patch: Partial<LearningEvent> = {}): LearningEvent {
  return {
    id: uuidV5(`v2-${n++}`),
    user_id: 'u1',
    type,
    skill_id: null,
    item_id: null,
    payload: {},
    duration_s: 0,
    created_at: at,
    ...patch,
  };
}

export const NOW = new Date('2026-10-05T06:00:00Z');

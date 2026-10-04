/**
 * Learn v2 dev stream, built from the existing skill graph: every skill
 * becomes one topic that reuses its lesson text, key points, curated
 * resources and practice items. A module is offered to a role when the role
 * weights its skills (any skill >= 0.7, or a summed weight >= 1.0); a topic's
 * tier comes from the highest weight among those roles (>= 0.7 core,
 * >= 0.4 standard, else optional).
 */
import type { RoleFamilyId } from '../../../src/primitives';
import { ROLE_DEFS } from '../roles';
import { SKILL_DEFS } from '../skills';
import type { ModuleDef, TopicDef } from './defs';

interface DevGroup {
  id: string;
  title: string;
  summary: string;
  level: 1 | 2 | 3 | 4 | 5;
  skills: string[];
  pre?: string[];
  soft?: string[];
}

const GROUPS: DevGroup[] = [
  { id: 'dev.web-foundations', title: 'Web foundations', summary: 'HTML, CSS, layout, responsive design and accessibility.', level: 1, skills: ['html', 'css', 'css-layout', 'responsive-design', 'accessibility'] },
  { id: 'dev.javascript', title: 'JavaScript and TypeScript', summary: 'The language of the web: core JavaScript, the DOM, async code and TypeScript.', level: 2, skills: ['javascript', 'dom-apis', 'async-javascript', 'typescript'], soft: ['dev.web-foundations'] },
  { id: 'dev.react', title: 'React and its ecosystem', summary: 'Components, state, Next.js and utility-first styling.', level: 3, skills: ['react', 'react-state-management', 'nextjs', 'tailwind-css'], pre: ['dev.javascript'] },
  { id: 'dev.frontend-engineering', title: 'Frontend engineering', summary: 'Build tools, testing, performance and other frameworks.', level: 3, skills: ['build-tools', 'frontend-testing', 'web-performance', 'vue', 'angular'], pre: ['dev.javascript'], soft: ['dev.react'] },
  { id: 'dev.dev-tools', title: 'Developer tools and HTTP', summary: 'Git, the command line, HTTP, testing basics and first deployments.', level: 1, skills: ['git', 'cli-basics', 'http-fundamentals', 'testing-fundamentals', 'deployment-basics'] },
  { id: 'dev.backend-core', title: 'Backend core', summary: 'A server language and framework, REST API design, authentication and GraphQL.', level: 2, skills: ['nodejs', 'python', 'python-web-frameworks', 'java-spring', 'go', 'rest-api-design', 'authentication', 'graphql'], soft: ['dev.dev-tools'] },
  { id: 'dev.databases', title: 'Databases for developers', summary: 'SQL, data modelling, PostgreSQL, NoSQL stores and ORMs.', level: 2, skills: ['sql', 'advanced-sql', 'database-design', 'postgresql', 'nosql', 'orms'] },
  { id: 'dev.backend-scale', title: 'Scaling and securing backends', summary: 'Caching, queues, microservices, full-stack architecture and web security.', level: 4, skills: ['caching', 'message-queues', 'microservices', 'fullstack-architecture', 'web-security'], pre: ['dev.databases'], soft: ['dev.backend-core'] },
  { id: 'dev.linux-networking', title: 'Linux and networking', summary: 'Linux, shell scripting, networking and web servers.', level: 2, skills: ['linux', 'bash-scripting', 'networking', 'nginx'] },
  { id: 'dev.containers-ci', title: 'Containers and delivery', summary: 'Docker, Kubernetes, CI/CD and GitOps.', level: 3, skills: ['docker', 'kubernetes', 'ci-cd', 'gitops'], soft: ['dev.linux-networking'] },
  { id: 'dev.cloud-ops', title: 'Cloud and operations', summary: 'Cloud platforms, infrastructure as code, observability, SRE and security.', level: 4, skills: ['cloud-platforms', 'terraform', 'observability', 'sre-practices', 'devsecops'], pre: ['dev.containers-ci'] },
  { id: 'dev.data-analysis', title: 'Data analysis', summary: 'Spreadsheets, statistics, data cleaning, NumPy and pandas.', level: 1, skills: ['excel', 'statistics', 'data-cleaning', 'numpy', 'pandas'] },
  { id: 'dev.data-communication', title: 'Visualisation and analytics engineering', summary: 'Charts, BI tools, data stories and analytics engineering.', level: 2, skills: ['data-visualization', 'bi-tools', 'data-storytelling', 'analytics-engineering'], pre: ['dev.data-analysis'] },
  { id: 'dev.experiments', title: 'Experiments and product analytics', summary: 'A/B testing and product metrics.', level: 3, skills: ['ab-testing', 'product-analytics'], soft: ['dev.data-analysis'] },
  { id: 'dev.ml', title: 'Machine learning', summary: 'Maths for ML, classical ML, deep learning and computer vision.', level: 3, skills: ['math-for-ml', 'ml-fundamentals', 'deep-learning', 'computer-vision'], pre: ['dev.data-analysis'] },
  { id: 'dev.llm', title: 'NLP and LLM applications', summary: 'Transformers, LLM apps, retrieval and fine-tuning.', level: 4, skills: ['nlp-transformers', 'llm-applications', 'rag-vector-search', 'llm-fine-tuning'], pre: ['dev.ml'] },
  { id: 'dev.ml-ops', title: 'MLOps and data pipelines', summary: 'Shipping and running models and data pipelines.', level: 4, skills: ['mlops', 'data-pipelines'], soft: ['dev.ml'] },
  { id: 'dev.product-discovery', title: 'Product sense and discovery', summary: 'Product sense, discovery, market research and PRDs.', level: 1, skills: ['product-sense', 'product-discovery', 'market-research', 'prd-writing'] },
  { id: 'dev.product-delivery', title: 'Prioritisation and delivery', summary: 'Prioritisation, agile delivery, strategy and stakeholders.', level: 2, skills: ['prioritization', 'agile-delivery', 'product-strategy', 'stakeholder-management'], soft: ['dev.product-discovery'] },
  { id: 'dev.design-foundations', title: 'Visual design foundations', summary: 'Design principles, typography, colour and grids.', level: 1, skills: ['design-principles', 'typography', 'color-theory', 'grid-systems'] },
  { id: 'dev.figma', title: 'Figma and design systems', summary: 'Figma, auto layout and design systems.', level: 2, skills: ['figma', 'figma-auto-layout', 'design-systems'], soft: ['dev.design-foundations'] },
  { id: 'dev.ux', title: 'UX design', summary: 'Wireframes, prototypes, interaction design, research, IA and UX writing.', level: 2, skills: ['wireframing', 'prototyping', 'interaction-design', 'usability-testing', 'information-architecture', 'ux-writing'], soft: ['dev.figma'] },
  { id: 'dev.design-portfolio', title: 'Design portfolio', summary: 'Case studies that show your process.', level: 2, skills: ['design-portfolio'], soft: ['dev.ux'] },
];

const skillById = new Map(SKILL_DEFS.map((s) => [s.id, s]));

function weight(role: RoleFamilyId, skill: string): number {
  return ROLE_DEFS.find((r) => r.id === role)?.weights[skill] ?? 0;
}

export function rolesFor(skills: string[]): RoleFamilyId[] {
  return ROLE_DEFS.filter((r) => {
    const ws = skills.map((s) => r.weights[s] ?? 0);
    return ws.some((w) => w >= 0.7) || ws.reduce((a, b) => a + b, 0) >= 1.0;
  }).map((r) => r.id);
}

function tierFor(roles: RoleFamilyId[], skill: string): TopicDef['tier'] {
  const w = Math.max(0, ...roles.map((r) => weight(r, skill)));
  return w >= 0.7 ? 'core' : w >= 0.4 ? 'standard' : 'optional';
}

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

export function buildDevModules(): ModuleDef[] {
  return GROUPS.map((g, order) => {
    const roles = rolesFor(g.skills);
    // An empty list would mean "every role", so a module no role weights is an authoring error.
    if (!roles.length) throw new Error(`dev module ${g.id} matches no role`);
    const topics: TopicDef[] = g.skills.map((id) => {
      const s = skillById.get(id);
      if (!s) throw new Error(`dev module ${g.id} references unknown skill ${id}`);
      const practice = s.hours >= 30 ? 3 : s.hours >= 12 ? 2 : 1;
      return {
        key: id,
        title: s.name,
        tier: tierFor(roles, id),
        min: Math.max(10, Math.min(45, Math.round(s.hours * 3))),
        sum: clip(s.lesson, 1200),
        pts: s.points.map((p) => clip(p, 240)),
        skills: [id],
        tasks: s.points.slice(0, practice).map((p, i) => ({
          key: `hands-on-${i + 1}`,
          kind: 'practice' as const,
          title: clip(`Hands-on: ${p}`, 140),
          minutes: 40,
        })),
      };
    });
    return {
      id: g.id,
      title: g.title,
      summary: g.summary,
      stream: 'dev' as const,
      level: g.level,
      order,
      pre: g.pre,
      soft: g.soft,
      roles,
      skills: g.skills,
      topics,
    };
  });
}

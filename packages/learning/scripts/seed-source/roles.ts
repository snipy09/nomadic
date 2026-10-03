/**
 * The 8 launch role families and their weighted skill sets.
 * Weights: 1.0 = defining skill, 0.7-0.9 = core, 0.4-0.6 = important, <0.4 = bonus.
 * Derived from roadmaps.ts milestones and jobRolesDataset.ts track skill lists.
 */
import type { RoleFamilyId } from '../../src/types';

export interface RoleDef {
  id: RoleFamilyId;
  name: string;
  description: string;
  legacy: string[];
  titles: string[];
  weights: Record<string, number>;
}

export const ROLE_DEFS: RoleDef[] = [
  {
    id: 'frontend',
    name: 'Frontend Engineer',
    description: 'Build responsive, accessible, fast web interfaces with modern JavaScript, TypeScript and React.',
    legacy: ['frontend'],
    titles: ['Frontend Engineer', 'Frontend Developer', 'React Developer', 'UI Engineer', 'Web Developer'],
    weights: {
      javascript: 1.0, html: 0.9, css: 0.9, react: 0.9, 'css-layout': 0.8, 'dom-apis': 0.8, 'async-javascript': 0.8,
      typescript: 0.8, 'responsive-design': 0.7, accessibility: 0.7, git: 0.7, 'programming-fundamentals': 0.6,
      'http-fundamentals': 0.6, 'react-state-management': 0.6, nextjs: 0.6, 'frontend-testing': 0.6, 'web-performance': 0.6,
      'tailwind-css': 0.5, 'build-tools': 0.5, 'testing-fundamentals': 0.5, dsa: 0.5, 'web-security': 0.4,
      'rest-api-design': 0.4, 'cli-basics': 0.4, 'deployment-basics': 0.4, 'behavioral-interviews': 0.4, vue: 0.3, angular: 0.3,
    },
  },
  {
    id: 'backend',
    name: 'Backend Engineer',
    description: 'Design APIs, data models and services that are secure, fast and reliable.',
    legacy: ['backend'],
    titles: ['Backend Engineer', 'Backend Developer', 'Node.js Developer', 'API Engineer', 'Software Engineer (Backend)'],
    weights: {
      'rest-api-design': 1.0, sql: 0.9, nodejs: 0.8, authentication: 0.8, 'database-design': 0.8, postgresql: 0.8,
      'system-design': 0.8, 'http-fundamentals': 0.8, caching: 0.7, 'testing-fundamentals': 0.7, git: 0.7, 'web-security': 0.7,
      'programming-fundamentals': 0.6, python: 0.6, 'message-queues': 0.6, microservices: 0.6, docker: 0.6, dsa: 0.6,
      javascript: 0.6, 'async-javascript': 0.6, nosql: 0.5, orms: 0.5, typescript: 0.5, linux: 0.5, 'cli-basics': 0.5,
      graphql: 0.4, 'ci-cd': 0.4, 'python-web-frameworks': 0.4, 'cloud-platforms': 0.4, 'behavioral-interviews': 0.4,
      go: 0.3, 'java-spring': 0.3,
    },
  },
  {
    id: 'fullstack',
    name: 'Full Stack Engineer',
    description: 'Ship features end to end, from React components to APIs, databases and deployment.',
    legacy: ['fullstack'],
    titles: ['Full Stack Engineer', 'Full Stack Developer', 'Software Engineer', 'MERN Stack Developer'],
    weights: {
      javascript: 0.9, react: 0.9, nodejs: 0.9, 'rest-api-design': 0.9, 'fullstack-architecture': 0.9, typescript: 0.8, sql: 0.8,
      html: 0.7, css: 0.7, 'async-javascript': 0.7, nextjs: 0.7, authentication: 0.7, 'database-design': 0.7, postgresql: 0.7,
      'deployment-basics': 0.7, git: 0.7, 'http-fundamentals': 0.7, 'css-layout': 0.6, 'testing-fundamentals': 0.6,
      'web-security': 0.6, 'dom-apis': 0.6, 'programming-fundamentals': 0.6, 'responsive-design': 0.5, orms: 0.5, caching: 0.5,
      docker: 0.5, 'system-design': 0.5, dsa: 0.5, 'react-state-management': 0.5, 'tailwind-css': 0.4, 'ci-cd': 0.4,
      'frontend-testing': 0.4, accessibility: 0.4, 'cli-basics': 0.4, 'build-tools': 0.4, 'behavioral-interviews': 0.4,
    },
  },
  {
    id: 'data-analyst',
    name: 'Data Analyst',
    description: 'Turn raw data into decisions with SQL, spreadsheets, statistics and dashboards.',
    legacy: [],
    titles: ['Data Analyst', 'Business Analyst', 'Product Analyst', 'BI Analyst', 'Analytics Engineer'],
    weights: {
      sql: 1.0, excel: 0.9, statistics: 0.9, 'data-visualization': 0.9, 'advanced-sql': 0.8, 'data-cleaning': 0.8,
      'bi-tools': 0.8, pandas: 0.7, 'data-storytelling': 0.7, python: 0.6, 'ab-testing': 0.6, 'product-analytics': 0.6,
      numpy: 0.4, 'analytics-engineering': 0.4, 'database-design': 0.4, 'programming-fundamentals': 0.4,
      'stakeholder-management': 0.4, 'behavioral-interviews': 0.4, git: 0.3,
    },
  },
  {
    id: 'data-ml',
    name: 'Data Scientist / ML Engineer',
    description: 'Build, evaluate and deploy machine learning and LLM-powered systems.',
    legacy: ['ai'],
    titles: ['Machine Learning Engineer', 'Data Scientist', 'AI Engineer', 'LLM Application Developer', 'MLOps Engineer'],
    weights: {
      python: 1.0, 'ml-fundamentals': 1.0, numpy: 0.8, pandas: 0.8, statistics: 0.8, 'math-for-ml': 0.8, 'deep-learning': 0.8,
      'llm-applications': 0.7, sql: 0.7, 'nlp-transformers': 0.6, 'rag-vector-search': 0.6, mlops: 0.6, 'data-cleaning': 0.6,
      git: 0.6, 'programming-fundamentals': 0.6, 'data-pipelines': 0.5, 'data-visualization': 0.5, docker: 0.5, dsa: 0.5,
      'computer-vision': 0.4, 'llm-fine-tuning': 0.4, 'cloud-platforms': 0.4, 'rest-api-design': 0.4, 'ab-testing': 0.4,
      'cli-basics': 0.4, 'behavioral-interviews': 0.4,
    },
  },
  {
    id: 'product-manager',
    name: 'Product Manager',
    description: 'Discover the right problems, define solutions, and lead teams to measurable outcomes.',
    legacy: ['product-management'],
    titles: ['Product Manager', 'Associate Product Manager', 'Technical Product Manager', 'Product Owner', 'Technical Program Manager'],
    weights: {
      'product-discovery': 1.0, 'prd-writing': 0.9, 'product-analytics': 0.9, prioritization: 0.8, 'agile-delivery': 0.8,
      'product-strategy': 0.8, 'stakeholder-management': 0.8, 'product-sense': 0.8, 'market-research': 0.7, 'ab-testing': 0.7,
      sql: 0.6, wireframing: 0.6, 'behavioral-interviews': 0.6, 'usability-testing': 0.5, 'data-storytelling': 0.5, excel: 0.5,
      figma: 0.4, statistics: 0.4, 'http-fundamentals': 0.4, 'system-design': 0.3, 'data-visualization': 0.3,
    },
  },
  {
    id: 'design',
    name: 'Product Designer (UI/UX)',
    description: 'Design usable, accessible, system-driven interfaces backed by research.',
    legacy: ['ui-ux-design'],
    titles: ['Product Designer', 'UI/UX Designer', 'UX Designer', 'UI Designer', 'Interaction Designer', 'UX Researcher'],
    weights: {
      'design-principles': 1.0, figma: 1.0, typography: 0.9, 'color-theory': 0.8, 'grid-systems': 0.8, 'figma-auto-layout': 0.8,
      'design-systems': 0.8, wireframing: 0.8, prototyping: 0.8, 'product-discovery': 0.8, 'usability-testing': 0.8,
      accessibility: 0.8, 'design-portfolio': 0.8, 'interaction-design': 0.7, 'information-architecture': 0.7,
      'ux-writing': 0.5, 'responsive-design': 0.5, 'stakeholder-management': 0.4, 'behavioral-interviews': 0.4,
      html: 0.3, css: 0.3, 'product-analytics': 0.3,
    },
  },
  {
    id: 'devops',
    name: 'DevOps / Cloud Engineer',
    description: 'Automate delivery, run containers at scale and keep cloud systems reliable.',
    legacy: ['devops'],
    titles: ['DevOps Engineer', 'Cloud Engineer', 'Site Reliability Engineer', 'Platform Engineer', 'Cloud Architect'],
    weights: {
      linux: 1.0, docker: 1.0, 'ci-cd': 0.9, kubernetes: 0.9, 'cloud-platforms': 0.9, 'cli-basics': 0.8, 'bash-scripting': 0.8,
      networking: 0.8, git: 0.8, terraform: 0.8, observability: 0.8, 'sre-practices': 0.6, devsecops: 0.6, nginx: 0.6,
      'http-fundamentals': 0.6, gitops: 0.5, python: 0.5, 'programming-fundamentals': 0.5, 'system-design': 0.5,
      'deployment-basics': 0.4, 'web-security': 0.4, 'behavioral-interviews': 0.4, go: 0.3,
    },
  },
];

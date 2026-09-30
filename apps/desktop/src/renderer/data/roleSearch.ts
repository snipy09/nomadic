import { CURATED_JOB_TITLES } from './curatedJobTitles';

/** Popular roles that the curated list misses or words differently; always searched first. */
const CORE_ROLES = [
  'Software Engineer', 'Frontend Engineer', 'Frontend Developer', 'React Developer', 'Backend Engineer', 'Backend Developer',
  'Full Stack Engineer', 'Full Stack Developer', 'Mobile Engineer', 'iOS Developer', 'Android Developer', 'DevOps Engineer',
  'Site Reliability Engineer', 'Cloud Engineer', 'Data Engineer', 'Data Analyst', 'Data Scientist', 'Machine Learning Engineer',
  'AI Engineer', 'QA Engineer', 'Security Engineer', 'Product Manager', 'Product Designer', 'UI/UX Designer', 'Engineering Manager',
  'Business Analyst', 'Marketing Associate', 'Growth Marketer', 'Sales Development Representative', 'Customer Success Manager',
].map((title) => ({ title, searchable: title.toLowerCase() }));

const ALL_TITLES = [...CORE_ROLES, ...CURATED_JOB_TITLES];

const ALIASES: Record<string, string[]> = {
  react: ['frontend', 'front end', 'web developer'],
  vue: ['frontend', 'front end'],
  angular: ['frontend', 'front end'],
  node: ['backend', 'back end'],
  python: ['backend', 'data'],
  ai: ['machine learning', 'artificial intelligence', 'data scientist'],
  ml: ['machine learning', 'data scientist'],
  devops: ['devops', 'site reliability', 'cloud'],
  sde: ['software engineer', 'software developer'],
};

/** Case-insensitive role-title suggestions from the curated list (prefix matches first). */
export function searchRoleTitles(query: string, limit = 8): string[] {
  const q = String(query ?? '').toLowerCase().trim().slice(0, 80);
  if (q.length < 2) return [];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const t of ALL_TITLES) {
    if (t.searchable.startsWith(q)) starts.push(t.title);
    else if (t.searchable.includes(q)) contains.push(t.title);
    if (starts.length >= limit) break;
  }
  const found = [...starts, ...contains];
  if (found.length < limit) {
    for (const alt of ALIASES[q] || []) {
      for (const t of ALL_TITLES) {
        if (t.searchable.includes(alt) && !found.includes(t.title)) found.push(t.title);
        if (found.length >= limit) break;
      }
    }
  }
  return Array.from(new Set(found)).slice(0, limit);
}

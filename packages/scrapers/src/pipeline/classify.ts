import type { EmploymentType, RoleFamily, Seniority } from '../job-schema.js';

/**
 * Rule-based classification. Families match the eight Learn role families so
 * readiness/job-match can use the same ids. Order matters: the first rule
 * whose pattern matches the title wins.
 */
const TITLE_RULES: Array<[RoleFamily, RegExp]> = [
  ['full_stack', /\bfull[\s-]?stack\b/],
  [
    'data_ml',
    /\b(machine learning|ml engineer|mlops|ai engineer|ai\/ml|deep learning|data scientist|data science|nlp|computer vision|llm|research scientist|applied scientist|ai researcher)\b/,
  ],
  [
    'data_analyst',
    /\b(data analyst|business analyst|analytics|business intelligence|bi (developer|analyst|engineer)|reporting analyst|insights analyst|product analyst)\b/,
  ],
  [
    'devops',
    /\b(devops|devsecops|sre|site reliability|platform engineer|infrastructure|cloud engineer|systems engineer|kubernetes|release engineer|build engineer|network engineer)\b/,
  ],
  ['design', /\b(designer|ux|ui\/ux|user experience|product design|visual design|interaction design|design lead)\b/],
  [
    'product_manager',
    /\b(product manager|product owner|product lead|head of product|apm|associate product manager|group product manager|product management)\b/,
  ],
  ['frontend', /\b(front[\s-]?end|react|angular|vue|ui engineer|ui developer|web developer|javascript developer)\b/],
  [
    'backend',
    /\b(back[\s-]?end|api engineer|golang|go developer|java developer|node(\.js)? developer|python developer|ruby|rails|php|django|spring|\.net|c# developer|data engineer|database engineer)\b/,
  ],
];

const GENERIC_ENGINEERING = /\b(software|engineer|developer|sde|programmer|swe)\b/;

const FRONTEND_SIGNALS = /\b(react|vue|angular|css|html|typescript|next\.js|frontend|front-end|ui)\b/g;
const BACKEND_SIGNALS =
  /\b(api|microservices|postgres|mysql|database|java|golang|node\.js|django|spring|kafka|backend|back-end|distributed systems)\b/g;

function countMatches(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

export function classifyRoleFamily(title: string, description = ''): RoleFamily {
  const t = title.toLowerCase();
  for (const [family, pattern] of TITLE_RULES) {
    if (pattern.test(t)) return family;
  }
  if (!GENERIC_ENGINEERING.test(t)) return 'other';

  // Generic "Software Engineer": let the description break the tie.
  const d = description.toLowerCase().slice(0, 5000);
  const fe = countMatches(d, FRONTEND_SIGNALS);
  const be = countMatches(d, BACKEND_SIGNALS);
  if (fe >= 3 && be >= 3 && Math.abs(fe - be) <= Math.max(fe, be) * 0.3) return 'full_stack';
  if (fe > be) return 'frontend';
  // Most generic SWE postings are backend/general; that is also the safest default.
  return 'backend';
}

export function classifySeniority(title: string, employmentType: EmploymentType): Seniority {
  // "Member of Technical Staff" is a title (Adobe, Salesforce, Oracle): AMTS is entry, SMTS/LMTS/PMTS senior.
  const t = title.toLowerCase().replace(/\b(member of (the )?technical staff|mts)\b/g, ' mts ');
  if (employmentType === 'internship' || /\b(intern|internship|trainee|apprentice)\b/.test(t)) return 'intern';
  if (/\b(associate mts|amts)\b/.test(t)) return 'entry';
  if (/\b(lmts|pmts|cmts)\b/.test(t)) return 'lead';
  if (/\bsmts\b/.test(t)) return 'senior';
  // "Manager" alone is a role (Product Manager), not a seniority signal.
  if (/\b(principal|staff|lead|head of|director|vp|vice president|architect)\b/.test(t)) return 'lead';
  if (/\b(senior|sr\.?|iii|level 3|l5|sde[\s-]?3)\b/.test(t)) return 'senior';
  if (/\b(junior|jr\.?|graduate|new grad|entry|fresher|associate|sde[\s-]?1|level 1|i)\b/.test(t)) return 'entry';
  if (/\b(ii|sde[\s-]?2|level 2|mid)\b/.test(t)) return 'mid';
  return 'unknown';
}

/** Fills an unknown employment type from the seniority (interns are internships). */
export function refineEmploymentType(current: EmploymentType, seniority: Seniority): EmploymentType {
  if (current === 'unknown' && seniority === 'intern') return 'internship';
  return current;
}

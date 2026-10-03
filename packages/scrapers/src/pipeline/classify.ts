import type { EmploymentType } from './schema.ts';

/** Rule-based classification: role family, seniority, internship vs job. */

export const ROLE_FAMILIES = [
  'frontend', 'backend', 'fullstack', 'mobile', 'devops', 'data-engineering', 'data-science',
  'ml-ai', 'security', 'qa', 'embedded', 'design', 'product', 'engineering-management',
  'sales', 'marketing', 'customer-success', 'operations', 'finance', 'hr', 'other-engineering', 'other',
] as const;
export type RoleFamily = (typeof ROLE_FAMILIES)[number];

export const SENIORITIES = ['intern', 'entry', 'mid', 'senior', 'lead', 'executive'] as const;
export type Seniority = (typeof SENIORITIES)[number];

export interface Classification {
  roleFamily: RoleFamily;
  seniority: Seniority;
  isInternship: boolean;
  /** Collapsed value stored in `jobs.employment_type` (what the desktop feed filters on). */
  feedType: 'internship' | 'job';
  /** Legacy `jobs.experience_level` values used by the desktop UI. */
  experienceLevel: 'entry' | 'mid' | 'senior';
}

// Ordered: first match wins, so specific families come before generic ones.
const FAMILY_RULES: Array<[RoleFamily, RegExp]> = [
  ['engineering-management', /\b(engineering manager|head of engineering|director of engineering|vp,? engineering|vp of engineering|cto)\b/i],
  ['ml-ai', /\b(machine learning|ml engineer|mlops|ai engineer|ai\/ml|deep learning|llm|nlp|computer vision|research scientist|applied scientist|ai research)\b/i],
  ['data-science', /\b(data scien\w*|data analyst|analytics|business intelligence|bi analyst|statistician|quantitative)\b/i],
  ['data-engineering', /\b(data engineer\w*|analytics engineer|etl|data platform|big data)\b/i],
  ['security', /\b(security|appsec|infosec|penetration|pentest\w*|soc analyst|cyber)\b/i],
  ['devops', /\b(devops|site reliability|sre|platform engineer|infrastructure|cloud engineer|systems engineer|release engineer|devsecops)\b/i],
  ['mobile', /\b(ios|android|mobile|flutter|react native|swift developer|kotlin developer)\b/i],
  ['qa', /\b(qa|quality assurance|test engineer|sdet|tester|automation tester|test automation)\b/i],
  ['embedded', /\b(embedded|firmware|fpga|hardware engineer|robotics)\b/i],
  ['fullstack', /\b(full[\s-]?stack|mern|mean stack)\b/i],
  ['frontend', /\b(front[\s-]?end|ui engineer|ui developer|react developer|angular developer|vue developer|web developer|javascript developer)\b/i],
  ['backend', /\b(back[\s-]?end|api engineer|server[\s-]side|java developer|python developer|golang|go developer|node\.?js developer|php developer|ruby developer|\.net developer)\b/i],
  ['design', /\b(designer|ux|ui\/ux|product design|visual design|graphic design|illustrator)\b/i],
  ['product', /\b(product manager|product owner|program manager|technical program|product lead|\bpm\b)\b/i],
  ['sales', /\b(sales|account executive|business development|bdr|sdr|account manager|partnerships)\b/i],
  ['marketing', /\b(marketing|growth|seo|content writer|copywriter|social media|brand|communications|community manager)\b/i],
  ['customer-success', /\b(customer success|customer support|support engineer|technical support|customer experience|solutions engineer|implementation)\b/i],
  ['finance', /\b(finance|accountant|accounting|controller|fp&a|tax|treasury|payroll)\b/i],
  ['hr', /\b(recruiter|talent acquisition|people partner|hr\b|human resources|people operations)\b/i],
  ['operations', /\b(operations|ops manager|office manager|supply chain|logistics|chief of staff)\b/i],
  ['other-engineering', /\b(engineer|developer|programmer|sde|swe|software)\b/i],
];

export function classifyRoleFamily(title: string, description = ''): RoleFamily {
  for (const [family, re] of FAMILY_RULES) {
    if (re.test(title)) return family;
  }
  // Fall back to the first 400 chars of the description for vague titles ("Engineer II").
  const head = description.slice(0, 400);
  if (/\b(engineer|developer|sde|swe)\b/i.test(title)) {
    for (const [family, re] of FAMILY_RULES) {
      if (family !== 'other-engineering' && re.test(head)) return family;
    }
    return 'other-engineering';
  }
  return 'other';
}

export function classifySeniority(title: string, employmentType: EmploymentType, description = ''): Seniority {
  const t = title.toLowerCase();
  if (employmentType === 'internship' || /\b(intern|internship|trainee|apprentice)\b/.test(t)) return 'intern';
  if (/\b(chief|vp|vice president|head of|director|cto|ceo|cfo|coo)\b/.test(t)) return 'executive';
  if (/\b(lead|principal|staff|architect|manager)\b/.test(t)) return 'lead';
  if (/\b(senior|sr\.?|iii|iv|level 3|l5|l6)\b/.test(t)) return 'senior';
  if (/\b(junior|jr\.?|entry|graduate|grad|new grad|fresher|associate|i\b|level 1|l3)\b/.test(t)) return 'entry';
  if (/\b(ii|mid|intermediate|level 2|l4)\b/.test(t)) return 'mid';
  const yrs = description.match(/(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?years?/i);
  if (yrs) {
    const n = Number(yrs[1]);
    if (n <= 1) return 'entry';
    if (n >= 6) return 'senior';
  }
  return 'mid';
}

export function classifyJob(input: { title: string; description: string; employmentType: EmploymentType }): Classification {
  const roleFamily = classifyRoleFamily(input.title, input.description);
  const seniority = classifySeniority(input.title, input.employmentType, input.description);
  const isInternship = input.employmentType === 'internship' || seniority === 'intern';
  const experienceLevel = seniority === 'intern' || seniority === 'entry' ? 'entry' : seniority === 'mid' ? 'mid' : 'senior';
  return { roleFamily, seniority, isInternship, feedType: isInternship ? 'internship' : 'job', experienceLevel };
}

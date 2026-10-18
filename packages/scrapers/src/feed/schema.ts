import { z } from 'zod';

/**
 * What the feed scraper publishes (migration 031): India-open openings at famous companies and upcoming
 * hackathons. Every value comes from the source; unknown stays null / 'unknown'.
 */

export const OPENING_SOURCES = ['greenhouse', 'lever', 'ashby', 'workday', 'smartrecruiters', 'eightfold', 'oracle', 'amazon', 'google'] as const;
export type OpeningSource = (typeof OPENING_SOURCES)[number];

export const OPENING_KINDS = ['internship', 'full_time', 'other', 'unknown'] as const;
export type OpeningKind = (typeof OPENING_KINDS)[number];

export const LEVELS = ['entry', 'experienced', 'unknown'] as const;
export type Level = (typeof LEVELS)[number];

export const ROLE_FAMILIES = ['software', 'data', 'ml', 'devops', 'security', 'qa', 'design', 'product', 'hardware', 'other'] as const;
export type RoleFamily = (typeof ROLE_FAMILIES)[number];

export const HACKATHON_SOURCES = ['devfolio', 'unstop', 'devpost', 'hackerearth', 'hack2skill', 'mlh', 'codeforces'] as const;
export type HackathonSource = (typeof HACKATHON_SOURCES)[number];

/** Hackathons, and coding contests (Codeforces) shown alongside them. */
export const EVENT_KINDS = ['hackathon', 'contest'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const HACKATHON_MODES = ['online', 'in_person', 'hybrid', 'unknown'] as const;
export type HackathonMode = (typeof HACKATHON_MODES)[number];

const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      return false;
    }
  }, 'must be an absolute http(s) URL');

const iso = z.iso.datetime({ offset: true }).nullable();
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v ? v : null));

export const OpeningSchema = z.object({
  companySlug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  source: z.enum(OPENING_SOURCES),
  sourceJobId: z.string().trim().min(1).max(300),
  title: z.string().trim().min(1).max(300),
  kind: z.enum(OPENING_KINDS),
  level: z.enum(LEVELS),
  roleFamily: z.enum(ROLE_FAMILIES),
  location: z.string().trim().max(300),
  remote: z.boolean(),
  url: httpUrl,
  postedAt: iso,
});
export type OpeningCandidate = z.input<typeof OpeningSchema>;
export type Opening = z.output<typeof OpeningSchema>;

export const HackathonSchema = z.object({
  source: z.enum(HACKATHON_SOURCES),
  kind: z.enum(EVENT_KINDS).default('hackathon'),
  sourceId: z.string().trim().min(1).max(300),
  title: z.string().trim().min(1).max(300),
  organiser: optionalText(200),
  url: httpUrl,
  mode: z.enum(HACKATHON_MODES),
  city: optionalText(120),
  country: optionalText(120),
  inIndia: z.boolean(),
  startsAt: iso,
  endsAt: iso,
  registrationEndsAt: iso,
  themes: z.array(z.string().trim().min(1).max(80)).max(12),
  prizeText: optionalText(200),
});
export type HackathonCandidate = z.input<typeof HackathonSchema>;
export type Hackathon = z.output<typeof HackathonSchema>;

export type Parsed<T> = { ok: true; value: T } | { ok: false; issues: string[] };

function parseWith<T>(schema: z.ZodType<T>, candidate: unknown): Parsed<T> {
  const result = schema.safeParse(candidate);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, issues: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
}

export const parseOpening = (c: unknown) => parseWith(OpeningSchema, c);
export const parseHackathon = (c: unknown) => parseWith(HackathonSchema, c);

// ── Classification (title and the source's own type hint only) ───────────────

const INTERN = /\b(intern|interns|internship|summer analyst|co-?op)\b/i;
const FULL_TIME_HINT = /full[\s_-]?time|permanent|regular/i;
const OTHER_HINT = /part[\s_-]?time|contract|temporary|freelance|fixed[\s_-]?term/i;

export function classifyKind(title: string, typeHint?: string | null): OpeningKind {
  const hint = typeHint ?? '';
  if (INTERN.test(title) || /intern/i.test(hint)) return 'internship';
  if (OTHER_HINT.test(hint) || /\b(contract|contractor|part[\s-]?time|temporary)\b/i.test(title)) return 'other';
  if (FULL_TIME_HINT.test(hint) || /\bfull[\s-]?time\b/i.test(title)) return 'full_time';
  // Most listings without a stated type are full time, but that is a guess: keep it unknown.
  return 'unknown';
}

const EXPERIENCED =
  /\b(senior|sr\.?|staff|principal|lead|manager|director|head|vp|vice president|architect|distinguished|fellow|ii|iii|iv|[2-6])\b|\bsde[\s-]?(ii|iii|2|3)\b|\b\d+\+?\s*years\b/i;
const ENTRY =
  /\b(intern|internship|new grad|new graduate|graduate|grad|fresher|freshers|campus|entry[\s-]?level|junior|jr\.?|trainee|apprentice|early career|university|associate software|sde[\s-]?(i|1)|engineer[\s-]?(i|1)|analyst[\s-]?(i|1)|summer analyst|0-[12] years)\b/i;

/**
 * "Member of Technical Staff" (Adobe, Salesforce, Oracle) is a job title, not a staff-level seniority: AMTS is entry,
 * a plain MTS is not senior, and SMTS/LMTS/PMTS are.
 */
const ASSOCIATE_MTS = /\b(associate member of technical staff|amts)\b/i;
const SENIOR_MTS = /\b(smts|lmts|pmts|cmts)\b/i;
const withoutMts = (title: string) => title.replace(/\b(member of (the )?technical staff|mts)\b/gi, ' ');

export function classifyLevel(title: string, levelHint?: string | null): Level {
  const hint = levelHint ?? '';
  if (/entry|intern|graduate|student|associate$/i.test(hint)) return 'entry';
  if (/mid|senior|director|executive|experienced/i.test(hint)) return 'experienced';
  if (ASSOCIATE_MTS.test(title)) return 'entry';
  if (SENIOR_MTS.test(title)) return 'experienced';
  title = withoutMts(title);
  // "Software Engineer I" ends in a lone "I"; "Senior Associate" and "Engineer II" are experienced.
  if (/\b(engineer|developer|analyst|sde)\s+i$/i.test(title.trim())) return 'entry';
  if (EXPERIENCED.test(title)) return INTERN.test(title) ? 'entry' : 'experienced';
  if (ENTRY.test(title)) return 'entry';
  return 'unknown';
}

const FAMILY_RULES: [RoleFamily, RegExp][] = [
  ['ml', /\b(machine learning|ml|ai|artificial intelligence|deep learning|nlp|computer vision|llm|genai|applied scientist|research scientist)\b/i],
  ['data', /\b(data|analytics|analyst|business intelligence|bi|statistic\w*)\b/i],
  ['security', /\b(security|infosec|appsec|cyber\w*|penetration)\b/i],
  ['devops', /\b(devops|sre|site reliability|cloud|infrastructure|platform engineer|kubernetes|network engineer)\b/i],
  ['qa', /\b(qa|quality assurance|quality engineer|test|tester|testing|sdet|automation engineer)\b/i],
  ['hardware', /\b(hardware|asic|vlsi|rtl|silicon|soc|fpga|embedded|firmware|analog|circuit|physical design|dft)\b/i],
  ['design', /\b(designer|design|ux|ui|user research\w*)\b/i],
  ['product', /\b(product manager|product management|program manager|tpm|product owner)\b/i],
  ['software', /\b(software|developer|sde|swe|programmer|engineer|engineering|frontend|front-end|backend|back-end|full[\s-]?stack|android|ios|mobile|web)\b/i],
];

export function classifyRoleFamily(title: string): RoleFamily {
  for (const [family, re] of FAMILY_RULES) if (re.test(title)) return family;
  return 'other';
}

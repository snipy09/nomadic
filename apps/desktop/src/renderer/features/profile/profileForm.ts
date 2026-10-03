import type { AppUser, MasterProfile, OpportunityType, WorkspaceMode } from '../../types';

/** Editable view of the profile. `null` / '' means "the user has not told us": nothing is ever invented. */
export interface ProfileForm {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  portfolio: string;
  targetRole: string;
  yearsOfExperience: number | null;
  skills: string[];
  expectedSalary: string;
  noticePeriod: string;
  requiresSponsorship: boolean;
  workAuthorized: boolean;
  workspaceMode: WorkspaceMode;
  targetOpportunityType: OpportunityType;
  answers: Record<string, string>;
}

export type FieldErrors = Partial<Record<'fullName' | 'email' | 'phone' | 'linkedin' | 'github' | 'portfolio' | 'yearsOfExperience', string>>;

const AUTHORIZED_KEY = 'work_authorized';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function parseSkills(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    const t = typeof s === 'string' ? s.trim() : '';
    if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); out.push(t); }
  }
  return out;
}

export function toForm(
  profile: Partial<MasterProfile> | null,
  user?: Pick<AppUser, 'fullName' | 'email'> | null,
  saved?: { workspaceMode?: WorkspaceMode | null; opportunityType?: OpportunityType | null },
): ProfileForm {
  const p: Record<string, any> = profile ?? {};
  const joined = `${asString(p.firstName)} ${asString(p.lastName)}`.trim();
  const answers = { ...(p.customAnswers ?? {}) } as Record<string, string>;
  const authorized = answers[AUTHORIZED_KEY];
  delete answers[AUTHORIZED_KEY];
  const years = typeof p.yearsOfExperience === 'number' && p.yearsOfExperience >= 0 ? p.yearsOfExperience : null;
  return {
    fullName: joined || asString(p.fullName) || asString(user?.fullName),
    email: asString(p.email) || asString(user?.email),
    phone: asString(p.phone),
    location: asString(p.location),
    linkedin: asString(p.linkedin),
    github: asString(p.github),
    portfolio: asString(p.portfolio),
    targetRole: asString(p.desiredTitle),
    yearsOfExperience: years,
    skills: parseSkills(p.skills ?? p.techStack),
    expectedSalary: asString(p.desiredSalary),
    noticePeriod: asString(p.noticePeriod),
    requiresSponsorship: asString(p.sponsorship).toLowerCase() === 'yes',
    workAuthorized: authorized ? authorized.toLowerCase() === 'yes' : true,
    workspaceMode: p.workspaceMode ?? saved?.workspaceMode ?? 'unified',
    targetOpportunityType: p.targetOpportunityType ?? saved?.opportunityType ?? 'both',
    answers,
  };
}

/** Merge the form over the stored profile. Fields the form does not own are preserved untouched. */
export function toMasterProfile(form: ProfileForm, base: Partial<MasterProfile> | null): MasterProfile {
  const [firstName = '', ...rest] = form.fullName.trim().split(/\s+/).filter(Boolean);
  return {
    ...(base as MasterProfile),
    firstName,
    lastName: rest.join(' '),
    email: form.email.trim(),
    phone: form.phone.trim(),
    linkedin: form.linkedin.trim(),
    github: form.github.trim(),
    desiredTitle: form.targetRole.trim(),
    techStack: form.skills.join(', '),
    desiredSalary: form.expectedSalary.trim(),
    noticePeriod: form.noticePeriod.trim(),
    sponsorship: form.requiresSponsorship ? 'Yes' : 'No',
    customAnswers: { ...form.answers, [AUTHORIZED_KEY]: form.workAuthorized ? 'Yes' : 'No' },
    workspaceMode: form.workspaceMode,
    targetOpportunityType: form.targetOpportunityType,
    askBeforeSubmit: true, // Apply always waits for the user's review.
    resumeText: base?.resumeText ?? '',
  } as MasterProfile;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hostOk = (v: string, hosts?: string[]) => {
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return u.hostname.includes('.') && (!hosts || hosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`)));
  } catch { return false; }
};

export function validate(form: ProfileForm): FieldErrors {
  const e: FieldErrors = {};
  if (!form.fullName.trim()) e.fullName = 'Enter your name.';
  if (!form.email.trim()) e.email = 'Enter your email.';
  else if (!EMAIL.test(form.email.trim())) e.email = 'Enter a valid email address.';
  if (form.phone.trim() && form.phone.replace(/\D/g, '').length < 7) e.phone = 'Enter a valid phone number.';
  if (form.linkedin.trim() && !hostOk(form.linkedin.trim(), ['linkedin.com'])) e.linkedin = 'Enter a linkedin.com link.';
  if (form.github.trim() && !hostOk(form.github.trim(), ['github.com'])) e.github = 'Enter a github.com link.';
  if (form.portfolio.trim() && !hostOk(form.portfolio.trim())) e.portfolio = 'Enter a valid link.';
  if (form.yearsOfExperience !== null && (form.yearsOfExperience < 0 || form.yearsOfExperience > 60)) e.yearsOfExperience = 'Enter 0 to 60.';
  return e;
}

export const COMPLETENESS_ITEMS = ['Name', 'Email', 'Target role', 'Skills', 'Profile link'] as const;

export function completeness(form: ProfileForm): { percent: number; missing: string[] } {
  const done = [
    Boolean(form.fullName.trim()),
    Boolean(form.email.trim()),
    Boolean(form.targetRole.trim()),
    form.skills.length > 0,
    Boolean(form.linkedin.trim() || form.github.trim()),
  ];
  return {
    percent: Math.round((done.filter(Boolean).length / done.length) * 100),
    missing: COMPLETENESS_ITEMS.filter((_, i) => !done[i]),
  };
}

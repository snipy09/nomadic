/**
 * Pure onboarding logic. The form shape, mapping and validation are the profile
 * feature's (profileForm.ts); this file only decides which fields each step owns
 * and offers suggestions from the shared skill catalogue (never invented values).
 */
import { ROLE_SUGGESTIONS } from '../learn/roleSetupLogic';
import { roles, role_skills, skills } from '@job-automator/learning/seed/bundle.json';
import type { MasterProfile, ResumeRecord } from '../../types';
import { inferRole } from '../feed/match';
import { toMasterProfile, validate, type FieldErrors, type ProfileForm } from '../profile/profileForm';
import { IS_MOBILE } from '../../platform';

const ALL_STEPS = [
  { id: 'about', label: 'About you' },
  { id: 'links', label: 'Links' },
  { id: 'resume', label: 'Resume' },
  { id: 'target', label: 'Role and skills' },
  { id: 'answers', label: 'Answers' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'roadmap', label: 'Your roadmap' },
] as const;

export type StepId = (typeof ALL_STEPS)[number]['id'];

/** The phone app cannot read resume files, so its onboarding has no resume step (resumes are added on the desktop). */
export const STEPS: ReadonlyArray<(typeof ALL_STEPS)[number]> = IS_MOBILE ? ALL_STEPS.filter((s) => s.id !== 'resume') : ALL_STEPS;

/** Steps the user may skip: nothing on them is required to get value from the app. Skipping the last step finishes setup. */
export const SKIPPABLE: ReadonlySet<StepId> = new Set<StepId>(['links', 'target', 'resume', 'answers', 'roadmap']);

const STEP_FIELDS: Record<StepId, Array<keyof FieldErrors>> = {
  about: ['fullName', 'email', 'phone'],
  links: ['linkedin', 'github', 'portfolio'],
  target: [],
  resume: [],
  answers: [],
  workspace: [],
  roadmap: [],
};

const MAX_RESUME_SKILLS = 15;

/**
 * The form with what a resume or LinkedIn export showed filled into empty slots only
 * (what the user typed always wins). Skills found are added after the user's own, up to 15.
 */
export function applyResumeFacts(
  form: ProfileForm,
  facts: { phone?: string; linkedin?: string; github?: string; portfolio?: string; skills: string[] },
): ProfileForm {
  const next = { ...form };
  if (!next.phone.trim() && facts.phone) next.phone = facts.phone;
  if (!next.linkedin.trim() && facts.linkedin) next.linkedin = facts.linkedin;
  if (!next.github.trim() && facts.github) next.github = facts.github;
  if (!next.portfolio.trim() && facts.portfolio) next.portfolio = facts.portfolio;
  const have = new Set(next.skills.map((s) => s.toLowerCase()));
  const added = facts.skills.filter((s) => !have.has(s.toLowerCase())).slice(0, Math.max(0, MAX_RESUME_SKILLS - next.skills.length));
  if (added.length) next.skills = [...next.skills, ...added];
  return next;
}

/** Validation errors for the fields shown on one step. */
export function stepErrors(step: StepId, form: ProfileForm): FieldErrors {
  const all = validate(form);
  const out: FieldErrors = {};
  for (const k of STEP_FIELDS[step]) if (all[k]) out[k] = all[k];
  return out;
}

export type ApplyReadinessErrors = Pick<FieldErrors, 'fullName' | 'email' | 'phone'> & { resume?: string };

/** What an application form needs before Nomadic can pre-fill it: name, email, phone and a resume. */
export function applyReadinessErrors(form: ProfileForm, hasResume: boolean): ApplyReadinessErrors {
  const v = validate(form);
  const out: ApplyReadinessErrors = {};
  if (v.fullName) out.fullName = v.fullName;
  if (v.email) out.email = v.email;
  if (!form.phone.trim()) out.phone = 'Enter your phone number. Application forms require it.';
  else if (v.phone) out.phone = v.phone;
  if (!hasResume) out.resume = 'Upload a resume. Applications attach it.';
  return out;
}

/** Role families from the shared catalogue (the same ones Feed matching and Learn use). */
/** Role chips: examples across fields; the field takes any role. */
export const ROLE_OPTIONS: string[] = [...ROLE_SUGGESTIONS];

const skillNames = new Map((skills as Array<{ id: string; name: string }>).map((s) => [s.id, s.name]));
const roleIdByName = new Map((roles as Array<{ id: string; name: string }>).map((r) => [r.name.toLowerCase(), r.id]));

/** Top catalogue skills for a role family, by weight. Empty when the role is not a catalogue family. */
export function suggestedSkills(roleName: string, limit = 10): string[] {
  const id = roleIdByName.get(roleName.trim().toLowerCase());
  if (!id) return [];
  return (role_skills as Array<{ role_id: string; skill_id: string; weight: number }>)
    .filter((rs) => rs.role_id === id)
    .sort((a, b) => b.weight - a.weight)
    .map((rs) => skillNames.get(rs.skill_id))
    .filter((n): n is string => Boolean(n))
    .slice(0, limit);
}

export function toggleSkill(list: string[], skill: string): string[] {
  const has = list.some((s) => s.toLowerCase() === skill.toLowerCase());
  return has ? list.filter((s) => s.toLowerCase() !== skill.toLowerCase()) : [...list, skill];
}

/**
 * The profile onboarding saves: the form merged over what is stored, with the default
 * resume's path when one was uploaded. Only values the user gave are included.
 */
export function buildOnboardingProfile(
  form: ProfileForm,
  base: Partial<MasterProfile> | null,
  resumes: ResumeRecord[],
): MasterProfile {
  const profile = toMasterProfile(form, base);
  const def = resumes.find((r) => r.isDefault) ?? resumes[0];
  if (def?.filePath) profile.resumeFilePath = def.filePath;
  return profile;
}

/** Role family for the roadmap step: the picked catalogue role, else one inferred from a typed title, else none. */
export function roadmapRoleFor(targetRole: string): string {
  return roleIdByName.get(targetRole.trim().toLowerCase()) ?? inferRole(targetRole) ?? '';
}

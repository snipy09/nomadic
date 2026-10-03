/**
 * Pure onboarding logic. The form shape, mapping and validation are the profile
 * feature's (profileForm.ts); this file only decides which fields each step owns
 * and offers suggestions from the shared skill catalogue (never invented values).
 */
import { roles, role_skills, skills } from '@job-automator/learning/seed/bundle.json';
import type { MasterProfile, ResumeRecord } from '../../types';
import { toMasterProfile, validate, type FieldErrors, type ProfileForm } from '../profile/profileForm';

export const STEPS = [
  { id: 'about', label: 'About you' },
  { id: 'target', label: 'Role and skills' },
  { id: 'resume', label: 'Resume' },
  { id: 'workspace', label: 'Workspace' },
] as const;

export type StepId = (typeof STEPS)[number]['id'];

/** Steps the user may skip: nothing on them is required to get value from the app. */
export const SKIPPABLE: ReadonlySet<StepId> = new Set<StepId>(['target', 'resume']);

const STEP_FIELDS: Record<StepId, Array<keyof FieldErrors>> = {
  about: ['fullName', 'email', 'phone'],
  target: [],
  resume: [],
  workspace: [],
};

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
export const ROLE_OPTIONS: string[] = (roles as Array<{ name: string }>).map((r) => r.name);

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

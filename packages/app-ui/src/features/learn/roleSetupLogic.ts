/** Pure helpers for the role setup (Learn and onboarding). */
import type { RoleLevel } from '@job-automator/learning';

/** Examples across fields. They only fill the box: any role can be typed. */
export const ROLE_SUGGESTIONS = [
  'Software engineer',
  'Data analyst',
  'Data scientist',
  'Product manager',
  'UX designer',
  'Quant trader',
  'Financial analyst',
  'Chartered accountant',
  'Investment banking analyst',
  'Digital marketer',
  'Business analyst',
  'Mechanical design engineer',
  'Civil site engineer',
  'HR generalist',
  'Content writer',
  'Sales executive',
] as const;

export const LEVELS: Array<{ value: RoleLevel; label: string; hint: string }> = [
  { value: 'beginner', label: 'Beginner', hint: 'New to most of this' },
  { value: 'intermediate', label: 'Some basics', hint: 'I know a few parts' },
  { value: 'advanced', label: 'Experienced', hint: 'I want the advanced parts' },
];

export function roleProblem(role: string): string | null {
  const t = role.trim();
  if (t.length < 2) return 'Type the role you want to prepare for.';
  if (t.length > 80) return 'Keep the role under 80 characters.';
  return null;
}

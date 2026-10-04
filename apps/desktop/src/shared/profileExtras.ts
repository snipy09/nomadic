/**
 * Profile facts with no column of their own in `master_profile`. They travel inside
 * `custom_answers_json` under reserved keys, so they are saved locally and synced to the
 * account like the other application answers, without a schema change.
 */
export const PROFILE_EXTRA_KEYS = {
  location: '__profile_location',
  country: '__profile_country',
  preferredName: '__profile_preferred_name',
  portfolio: '__profile_portfolio',
  yearsOfExperience: '__profile_years',
} as const;

export type ProfileExtraName = keyof typeof PROFILE_EXTRA_KEYS;
export type ProfileExtras = Partial<Record<ProfileExtraName, string>>;

const RESERVED = new Set<string>(Object.values(PROFILE_EXTRA_KEYS));

/** Splits stored answers into profile extras and the user's own question/answer pairs. */
export function splitProfileExtras(answers: Record<string, unknown> | null | undefined): { extras: ProfileExtras; answers: Record<string, string> } {
  const extras: ProfileExtras = {};
  const rest: Record<string, string> = {};
  for (const [k, v] of Object.entries(answers ?? {})) {
    if (typeof v !== 'string') continue;
    if (RESERVED.has(k)) {
      const name = (Object.keys(PROFILE_EXTRA_KEYS) as ProfileExtraName[]).find((n) => PROFILE_EXTRA_KEYS[n] === k)!;
      if (v.trim()) extras[name] = v.trim();
    } else {
      rest[k] = v;
    }
  }
  return { extras, answers: rest };
}

/** Writes non-empty extras back into an answers map (empty values are left out). */
export function mergeProfileExtras(answers: Record<string, string>, extras: ProfileExtras): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(answers)) if (!RESERVED.has(k)) out[k] = v;
  for (const name of Object.keys(PROFILE_EXTRA_KEYS) as ProfileExtraName[]) {
    const v = extras[name]?.trim();
    if (v) out[PROFILE_EXTRA_KEYS[name]] = v;
  }
  return out;
}

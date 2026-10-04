/**
 * Candidate profile: the single source of truth for every fact the form engine
 * is allowed to write into an application form.
 *
 * Moved here from `packages/automation/src/auto-apply-engine.ts` (which now
 * re-exports it). Nothing in this module imports from the automation package.
 */
import { z } from 'zod';

export const ResumeItemSchema = z.object({
  name: z.string(),
  targetRole: z.string(),
  filePath: z.string(),
  isDefault: z.boolean(),
});

/**
 * Optional self-identification answers. When a field here is empty the policy
 * in `policy.ts` decides (default: "decline to self-identify"). The model is
 * never asked these questions.
 */
export const EeoAnswersSchema = z.object({
  gender: z.string().optional(),
  race: z.string().optional(),
  hispanicLatino: z.string().optional(),
  veteranStatus: z.string().optional(),
  disabilityStatus: z.string().optional(),
  sexualOrientation: z.string().optional(),
  pronouns: z.string().optional(),
});

const looseEmail = z
  .string()
  .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), { message: 'Invalid email address' });

const optionalUrl = z
  .string()
  .refine((v) => v === '' || /^(https?:\/\/)?[^\s]+\.[^\s]+/i.test(v), { message: 'Invalid URL' })
  .optional();

export const MasterProfileSchema = z.object({
  // Identity and contact
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string().optional(),
  preferredName: z.string().optional(),
  email: looseEmail,
  phone: z.string(),
  location: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
  address: z.string().optional(),

  // Links
  linkedin: optionalUrl,
  github: optionalUrl,
  portfolio: optionalUrl,
  projectsUrl: optionalUrl,
  twitter: optionalUrl,

  // Work eligibility and logistics. `sponsorship` is the legacy free-text field
  // ("Yes"/"No"); `requiresSponsorship` / `workAuthorized` are the typed versions.
  sponsorship: z.string().optional(),
  requiresSponsorship: z.boolean().optional(),
  workAuthorized: z.boolean().optional(),
  willingToRelocate: z.boolean().optional(),
  openToHybrid: z.boolean().optional(),
  openToOnsite: z.boolean().optional(),
  salary: z.string().optional(),
  desiredSalary: z.string().optional(),
  noticePeriod: z.string().optional(),
  earliestStartDate: z.string().optional(),
  availableFullTime: z.boolean().optional(),

  // Experience and education
  desiredTitle: z.string().optional(),
  currentTitle: z.string().optional(),
  currentCompany: z.string().optional(),
  yearsOfExperience: z.number().nonnegative().optional(),
  techStack: z.string().optional(),
  summaryText: z.string().optional(),
  coverLetter: z.string().optional(),
  university: z.string().optional(),
  degree: z.string().optional(),
  fieldOfStudy: z.string().optional(),
  gpa: z.string().optional(),
  graduationYear: z.string().optional(),
  languages: z.array(z.string()).optional(),

  // Self-identification (see policy.ts)
  eeo: EeoAnswersSchema.optional(),

  // Files
  resumeFilePath: z.string().optional(),
  resumes: z.array(ResumeItemSchema).optional(),

  // Answer memory
  customAnswers: z.record(z.string()).optional(),
  cachedAnswers: z.record(z.string()).optional(),
  /** Answers to COMMON_QUESTIONS by id (commonQuestions.ts), reused wherever a form asks them. */
  commonAnswers: z.record(z.string()).optional(),
  onAnswerResolved: z
    .custom<(question: string, answer: string) => void>((v) => v === undefined || typeof v === 'function')
    .optional(),

  // Provider keys (never written into forms)
  groqApiKey: z.string().optional(),
  geminiApiKey: z.string().optional(),
});

export type ResumeItem = z.infer<typeof ResumeItemSchema>;
export type EeoAnswers = z.infer<typeof EeoAnswersSchema>;
export type MasterProfile = z.infer<typeof MasterProfileSchema>;

export interface ProfileValidationResult {
  success: boolean;
  profile?: MasterProfile;
  errors: Array<{ path: string; message: string }>;
}

/** Validate an unknown value as a profile without throwing. */
export function validateProfile(input: unknown): ProfileValidationResult {
  const parsed = MasterProfileSchema.safeParse(input);
  if (parsed.success) return { success: true, profile: parsed.data, errors: [] };
  return {
    success: false,
    errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  };
}

/** Parse a profile, throwing a readable error when it is invalid. */
export function parseProfile(input: unknown): MasterProfile {
  const res = validateProfile(input);
  if (!res.success || !res.profile) {
    throw new Error(`Invalid profile: ${res.errors.map((e) => `${e.path || '(root)'}: ${e.message}`).join('; ')}`);
  }
  return res.profile;
}

/** "First Last", falling back to fullName. */
export function profileFullName(p: MasterProfile): string {
  return (p.fullName || `${p.firstName || ''} ${p.lastName || ''}`).trim();
}

/** Tri-state sponsorship answer derived from typed and legacy fields. */
export function profileRequiresSponsorship(p: MasterProfile): boolean | undefined {
  if (typeof p.requiresSponsorship === 'boolean') return p.requiresSponsorship;
  const s = (p.sponsorship || '').trim().toLowerCase();
  if (!s) return undefined;
  if (/^(no|false|not required|none|n)\b/.test(s)) return false;
  if (/^(yes|true|required|y)\b/.test(s)) return true;
  return undefined;
}

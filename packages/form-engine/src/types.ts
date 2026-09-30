export type FieldKind = 'text' | 'textarea' | 'select' | 'combobox' | 'radio' | 'checkbox' | 'date' | 'file' | 'richtext';

export interface FormField {
  /** Stable id assigned to the element(s) in the page (data-nmd-id). */
  id: string;
  kind: FieldKind;
  /** Human question/label text. */
  label: string;
  /** name + id + placeholder + autocomplete, used for classification. */
  hints: string;
  inputType: string;
  required: boolean;
  /** Options for select/radio/checkbox groups/combobox (visible text). */
  options: string[];
  /** For radio groups / checkbox groups: per-option element ids, aligned with options. */
  optionIds: string[];
  frameIndex: number;
  value: string;
  checked: boolean;
  invalid: boolean;
}

export type FieldKey =
  | 'firstName' | 'lastName' | 'fullName' | 'email' | 'phone' | 'linkedin' | 'github' | 'portfolio' | 'twitter'
  | 'location' | 'address' | 'postalCode' | 'state' | 'currentSalary' | 'city' | 'country' | 'currentCompany' | 'currentTitle' | 'yearsExperience' | 'salary' | 'noticePeriod'
  | 'resume' | 'coverLetterFile' | 'coverLetterText' | 'summary'
  | 'sponsorship' | 'workAuthorization' | 'relocate' | 'consent' | 'eeoGender' | 'eeoRace' | 'eeoVeteran' | 'eeoDisability'
  | 'referral' | 'pronouns' | 'unknown';

export interface FormProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  twitter?: string;
  city?: string;
  country?: string;
  location?: string;
  currentCompany?: string;
  currentTitle?: string;
  yearsExperience?: string;
  salary?: string;
  currentSalary?: string;
  address?: string;
  postalCode?: string;
  state?: string;
  noticePeriod?: string;
  summary?: string;
  resumeFilePath?: string;
  coverLetterText?: string;
  /** "No" (default) when the candidate does NOT need visa sponsorship. */
  needsSponsorship?: boolean;
  authorizedToWork?: boolean;
  willingToRelocate?: boolean;
  referralSource?: string;
  /** question text (case-insensitive substring) -> answer */
  customAnswers?: Record<string, string>;
}

export type FieldStatus = 'filled' | 'needs_user' | 'skipped' | 'failed';

export interface FieldOutcome {
  label: string;
  key: FieldKey;
  kind: FieldKind;
  status: FieldStatus;
  value?: string;
  reason?: string;
}

export interface FillReport {
  fields: FieldOutcome[];
  filled: number;
  needsUser: number;
  failed: number;
  /** Required fields still empty/invalid after verification. */
  unresolvedRequired: string[];
  durationMs: number;
}

/** Optional hook for questions the rules cannot answer (e.g. Groq free tier). Return null when unsure. */
export type UnknownAnswerer = (field: FormField) => Promise<string | null>;

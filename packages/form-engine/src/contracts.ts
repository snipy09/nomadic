/**
 * Form-engine contracts. Pipeline:
 *
 *   Profile -> FormReader -> FieldClassifier -> Answerer -> FieldWriter -> Verifier
 *
 * Every stage is an interface so it can be unit-tested and swapped.
 */
import type { Page } from 'playwright';
import type { MasterProfile } from './profile.ts';

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'select'
  | 'combobox'
  | 'radio'
  | 'checkbox'
  | 'date'
  | 'file'
  | 'richtext';

export interface FieldOption {
  /** Visible text of the option. */
  label: string;
  /** Underlying value (option value / input value), if any. */
  value: string;
  /** Selector for the clickable element of this option (radio/checkbox groups). */
  selector?: string;
}

/** A normalized, ATS-agnostic description of one question on the page. */
export interface FormField {
  /** Stable id for this read (unique within one FormReader.read result). */
  id: string;
  kind: FieldKind;
  /** Best human-readable label (aria-label, <label for>, wrapping label, legend, nearby text). */
  label: string;
  /** Extra descriptive text (help text, long legal paragraph above an acknowledgement). */
  description?: string;
  /** name attribute of the underlying control (e.g. `_systemfield_email`, `urls[LinkedIn]`). */
  name?: string;
  /** id attribute of the underlying control. */
  domId?: string;
  /** input type attribute (email, tel, url, number...). */
  inputType?: string;
  placeholder?: string;
  autocomplete?: string;
  required: boolean;
  /** Options for select / radio / checkbox groups / comboboxes (when knowable up front). */
  options?: FieldOption[];
  /** Section or fieldset heading the field belongs to. */
  group?: string;
  /** True for a multi-select checkbox group (vs. a single boolean checkbox). */
  multiple?: boolean;
  /** Stable selector for the control, scoped to `frameIndex` and (if set) `shadowHostPath`. */
  selector: string;
  /** Index into page.frames(); 0 = main frame. */
  frameIndex: number;
  /** URL of the frame that owns the field (for diagnostics). */
  frameUrl?: string;
  /** Chain of selectors of open shadow-root hosts, outermost first. */
  shadowHostPath?: string[];
  /** Value currently in the control (as read). */
  currentValue?: string;
  visible: boolean;
  disabled?: boolean;
}

/** What a field means. `profileKey` and `questionType` are mutually informative. */
export type QuestionType =
  | 'profile'          // maps directly to a profile key
  | 'work_authorization'
  | 'sponsorship'
  | 'relocation'
  | 'onsite'
  | 'eeo_gender'
  | 'eeo_race'
  | 'eeo_hispanic'
  | 'eeo_veteran'
  | 'eeo_disability'
  | 'eeo_orientation'
  | 'legal_arbitration'
  | 'legal_certification'
  | 'consent_privacy'
  | 'consent_marketing'
  | 'source'           // how did you hear about us
  | 'resume'
  | 'cover_letter'
  | 'open_ended'
  | 'unknown';

export interface Classification {
  fieldId: string;
  questionType: QuestionType;
  /** Profile key (or derived key like `fullName`, `city`) when questionType === 'profile'. */
  profileKey?: string;
  /** Which rule matched (for debugging / reports). */
  rule: string;
  confidence: number;
}

export type AnswerSource = 'profile' | 'custom' | 'cache' | 'policy' | 'llm' | 'derived';

export type Answer =
  | {
      fieldId: string;
      status: 'answered';
      /** For checkbox: 'true'/'false'. For multi-select: values joined in `values`. For file: path. */
      value: string;
      values?: string[];
      source: AnswerSource;
      /** Fingerprint used for the answer cache. */
      fingerprint?: string;
    }
  | {
      fieldId: string;
      status: 'needs_user';
      reason: string;
      fingerprint?: string;
    }
  | {
      fieldId: string;
      status: 'skip';
      reason: string;
    };

export interface WriteResult {
  fieldId: string;
  ok: boolean;
  /** Value read back from the DOM after writing. */
  actual?: string;
  error?: string;
}

export interface VerifyIssue {
  fieldId: string;
  kind: 'value_mismatch' | 'validation_error' | 'required_empty';
  message: string;
}

export interface FieldOutcome {
  field: FormField;
  classification?: Classification;
  answer?: Answer;
  write?: WriteResult;
  status: 'filled' | 'needs_user' | 'skipped' | 'failed';
  reason?: string;
  attempts: number;
}

export interface FillReport {
  url: string;
  startedAt: string;
  durationMs: number;
  fields: FieldOutcome[];
  filled: number;
  needsUser: number;
  failed: number;
  skipped: number;
  /** Required fields that are still empty / failing after verification. */
  unresolvedRequired: FieldOutcome[];
  /** Validation messages visible on the page after the final pass. */
  pageErrors: string[];
  /** Number of LLM calls made (target: <= 1 per form). */
  llmCalls: number;
  /** Detected walls (login, captcha, email verification) the user must clear. */
  walls: Array<'login' | 'captcha' | 'email_verification'>;
  /** True when it is safe to call FormEngine.submit(). */
  readyToSubmit: boolean;
}

// ── Stage interfaces ────────────────────────────────────────────────────────

export interface FormReader {
  read(page: Page): Promise<FormField[]>;
}

export interface FieldClassifier {
  classify(fields: FormField[]): Classification[];
}

export interface AnswerContext {
  jobTitle?: string;
  company?: string;
  jobDescription?: string;
}

export interface Answerer {
  /** Must make at most ONE LLM call per invocation. */
  answer(
    fields: FormField[],
    classifications: Classification[],
    profile: MasterProfile,
    ctx?: AnswerContext
  ): Promise<{ answers: Answer[]; llmCalls: number }>;
}

export interface FieldWriter {
  readonly kinds: FieldKind[];
  /** Write `answer` into `field`, read it back, and report success. */
  write(page: Page, field: FormField, answer: Extract<Answer, { status: 'answered' }>): Promise<WriteResult>;
}

export interface Verifier {
  verify(page: Page, outcomes: FieldOutcome[]): Promise<{ issues: VerifyIssue[]; pageErrors: string[] }>;
}

// ── Progress events (consumed by the desktop app) ───────────────────────────

export type FormEngineEvent =
  | { type: 'field_filled'; fieldId: string; label: string; kind: FieldKind; value: string; source: AnswerSource; attempt: number }
  | { type: 'needs_user'; fieldId?: string; label?: string; reason: string; required?: boolean; wall?: 'login' | 'captcha' | 'email_verification' }
  | { type: 'error'; fieldId?: string; label?: string; message: string }
  | { type: 'status'; phase: 'reading' | 'classifying' | 'answering' | 'writing' | 'verifying' | 'done' | 'submitting' | 'submitted'; message: string };

export type FormEngineListener = (event: FormEngineEvent) => void;

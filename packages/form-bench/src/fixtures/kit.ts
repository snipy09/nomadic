/**
 * Fixture kit: types and helpers shared by the per-ATS fixture builders.
 *
 * Fixtures are generated into `packages/form-bench/fixtures/<id>/` as static
 * HTML plus `expected.json` (the answer key). Re-generate with
 * `npx tsx packages/form-bench/src/fixtures/build.ts`.
 */

/** How the scorer reads the final value of a field from the DOM. */
export type ReadMode =
  | 'value'      // input/textarea .value
  | 'select'     // native <select>: selected option text
  | 'radio'      // radio group (selector matches all radios): checked option's label text
  | 'checkbox'   // single checkbox: 'true' | 'false'
  | 'checkboxes' // checkbox group: labels of checked boxes
  | 'file'       // file input: '@file' when a file is attached
  | 'pressed'    // Ashby yes/no button group: text of aria-pressed=true button
  | 'rselect'    // react-select container: .select__single-value text
  | 'wdselect'   // Workday listbox button: value attribute
  | 'text';      // contenteditable: innerText

/** Why the answer is what it is (used for per-category scoring). */
export type Category =
  | 'profile'  // fact present in the candidate profile
  | 'policy'   // legal / consent: answered from policy config
  | 'eeo'      // self-identification: decline unless profile says otherwise
  | 'open'     // open-ended, needs generation (any non-empty answer accepted)
  | 'trap'     // the profile does NOT contain the answer: must be left empty
  | 'file';    // resume upload

/**
 * Expected value:
 *  - string: normalized comparison (case/whitespace-insensitive; URLs and phones normalized)
 *  - boolean: checkbox state
 *  - string[]: exact set of checked options
 *  - '@file': a file is attached
 *  - '@nonempty': any non-empty answer
 *  - '@empty': the field must be left empty / unselected
 */
export type Expected = string | boolean | string[];

export interface KeyEntry {
  expected: Expected;
  selector: string;
  read: ReadMode;
  category: Category;
  required?: boolean;
  /** Substring of the owning frame's URL (iframes). */
  frame?: string;
  /** Selectors of open shadow-root hosts, outermost first. */
  shadow?: string[];
}

export interface AnswerKey {
  id: string;
  ats: 'ashby' | 'greenhouse' | 'lever' | 'internshala' | 'workday' | 'other';
  title: string;
  /** Representative live URL pattern this fixture replicates. */
  sourceUrl: string;
  /** Profile file in profiles/ used for this fixture. */
  profile: string;
  /** Walls the engine is expected to report. */
  walls: Array<'login' | 'captcha' | 'email_verification'>;
  notes?: string;
  fields: Record<string, KeyEntry>;
}

export interface Fixture {
  key: AnswerKey;
  /** filename -> contents (index.html is the entry page). */
  files: Record<string, string>;
}

export const esc = (s: string): string =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const json = (v: unknown): string => esc(JSON.stringify(v));

export const idSel = (id: string): string => `[id="${id}"]`;
export const nameSel = (name: string, tag = 'input'): string => `${tag}[name="${name}"]`;

let uuidCounter = 0;
/** Deterministic UUID-looking ids (Ashby/Lever custom questions use UUIDs). */
export function fakeUuid(seed: string): string {
  let h = 2166136261;
  const s = `${seed}:${uuidCounter++}`;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  const a = hex(h), b = hex(Math.imul(h, 2654435761)), c = hex(Math.imul(h ^ 0x5bd1e995, 40503));
  return `${a}-${b.slice(0, 4)}-4${b.slice(5, 8)}-a${c.slice(1, 4)}-${c}${a.slice(0, 4)}`;
}
export function resetUuid(): void { uuidCounter = 0; }

export function page(title: string, body: string, opts: { head?: string; bodyClass?: string; depth?: number } = {}): string {
  const up = '../'.repeat(opts.depth ?? 1);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="${up}_shared/fixture.css">
<script src="${up}_shared/runtime.js"></script>
${opts.head || ''}
</head>
<body class="${opts.bodyClass || ''}">
${body}
</body>
</html>
`;
}

/** Collects answer-key entries while a builder emits markup. */
export class KeyCollector {
  fields: Record<string, KeyEntry> = {};
  add(label: string, entry: KeyEntry): void {
    if (this.fields[label]) throw new Error(`Duplicate answer-key label: ${label}`);
    this.fields[label] = entry;
  }
}

/** Common answer sets. */
export const EEO = {
  gender: ['Male', 'Female', 'Non-binary', 'Decline to self-identify'],
  hispanic: ['Yes', 'No', 'Decline to self-identify'],
  race: [
    'American Indian or Alaskan Native',
    'Asian',
    'Black or African American',
    'Hispanic or Latino',
    'White',
    'Native Hawaiian or Other Pacific Islander',
    'Two or More Races',
    'Decline to self-identify',
  ],
  veteran: [
    'I am a veteran',
    'I identify as one or more of the classifications of protected veteran',
    'I am not a protected veteran',
    "I don't wish to answer",
  ],
  disability: [
    'Yes, I have a disability (or previously had a disability)',
    "No, I don't have a disability",
    "I don't wish to answer",
  ],
};

export const LOCATIONS = [
  'Austin, Texas, United States',
  'Austin, Minnesota, United States',
  'San Francisco, California, United States',
  'New York, New York, United States',
  'Bengaluru, Karnataka, India',
  'London, England, United Kingdom',
];

export const ARBITRATION_TEXT =
  'Mutual Arbitration Agreement. As a condition of being considered for employment, you and the Company agree that any dispute, claim or controversy arising out of or relating to your application, employment or the termination of your employment shall be resolved exclusively by final and binding arbitration before a neutral arbitrator, and you waive the right to a jury trial or to participate in a class action. Please open, read and acknowledge the full agreement (link) before submitting.';

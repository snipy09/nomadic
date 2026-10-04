/**
 * FieldClassifier: deterministic rules first (question text, then attribute
 * aliases). Anything it cannot place is 'open_ended' (long text) or 'unknown'.
 * The LLM is never used for classification.
 */
import type { Classification, FieldClassifier, FormField, QuestionType } from './contracts.js';
import { aliasKeyForAttrs } from './aliases.js';
import { norm } from './dom.js';

interface Ctx {
  field: FormField;
  /** normalized label */
  l: string;
  /** label + description + option text */
  t: string;
  options: string[];
}

type Result = { questionType: QuestionType; profileKey?: string };
interface Rule { name: string; test: (c: Ctx) => boolean; result: Result | ((c: Ctx) => Result) }

const re = (src: string) => new RegExp(src, 'i');
const has = (rx: RegExp, s: string) => rx.test(s);

const SPOKEN = ['english', 'spanish', 'french', 'german', 'hindi', 'mandarin', 'chinese', 'japanese', 'portuguese', 'arabic', 'italian', 'russian', 'korean', 'bengali', 'tamil', 'telugu', 'marathi', 'dutch'];
const isChoice = (f: FormField) => ['radio', 'select', 'combobox', 'checkbox'].includes(f.kind);
const isLong = (f: FormField) => f.kind === 'textarea' || f.kind === 'richtext';

/** Rules run on the label first; `tOnly` rules may look at description too. */
const RULES: Rule[] = [
  { name: 'password', test: (c) => c.field.inputType === 'password', result: { questionType: 'unknown', profileKey: '__password' } },
  { name: 'file-cover', test: (c) => c.field.kind === 'file' && has(/cover letter/, c.l), result: { questionType: 'cover_letter' } },
  { name: 'file-resume', test: (c) => c.field.kind === 'file', result: { questionType: 'resume' } },

  // self-identification (label only, so section paragraphs do not leak in)
  { name: 'eeo-hispanic', test: (c) => has(/hispanic|latino|latinx/, c.l), result: { questionType: 'eeo_hispanic' } },
  { name: 'eeo-orientation', test: (c) => has(/sexual orientation/, c.l), result: { questionType: 'eeo_orientation' } },
  { name: 'eeo-gender', test: (c) => has(/\bgender\b|\bsex\b/, c.l) && !has(/pronoun/, c.l), result: { questionType: 'eeo_gender' } },
  { name: 'eeo-race', test: (c) => has(/\brace\b|ethnicit/, c.l), result: { questionType: 'eeo_race' } },
  { name: 'eeo-veteran', test: (c) => has(/veteran/, c.l), result: { questionType: 'eeo_veteran' } },
  { name: 'eeo-disability', test: (c) => has(/disabilit/, c.l), result: { questionType: 'eeo_disability' } },

  // legal / consent (label + description + option text)
  { name: 'arbitration', test: (c) => has(/arbitration/, c.t), result: { questionType: 'legal_arbitration' } },
  { name: 'certification', test: (c) => has(/\bcertif(y|ication)\b|true and correct|accurate and complete|withheld|\battest\b|information (i have )?provided is (true|accurate)/, c.t) && (c.field.kind === 'checkbox' || isChoice(c.field)), result: { questionType: 'legal_certification' } },
  { name: 'marketing', test: (c) => (c.field.kind === 'checkbox' || isChoice(c.field)) && has(/future (job )?(opportunit|opening|role|position)|job alerts?|talent (community|network|pool)|newsletter|marketing|keep me (informed|updated|posted)|contact me about|occasional emails|subscribe|company news/, c.t), result: { questionType: 'consent_marketing' } },
  { name: 'privacy', test: (c) => (c.field.kind === 'checkbox' || isChoice(c.field)) && has(/privacy (notice|policy|statement)|data privacy|personal data|processing (of )?my (data|personal|application)|terms (and|&) conditions|terms of (use|service)|gdpr|data protection/, c.t), result: { questionType: 'consent_privacy' } },

  // eligibility & logistics
  { name: 'sponsorship', test: (c) => has(/sponsor|visa status|\bh-?1b\b|work visa/, c.l), result: { questionType: 'sponsorship' } },
  { name: 'work-auth', test: (c) => has(/authori[sz]ed to work|eligib(le|ility) to work|right to work|work authori[sz]ation|legally (able|permitted|allowed) to work|permitted to work/, c.l), result: { questionType: 'work_authorization' } },
  { name: 'relocation', test: (c) => has(/relocat/, c.l), result: { questionType: 'relocation' } },
  { name: 'onsite', test: (c) => isChoice(c.field) && has(/\boffice\b|on-?site|in-person|\bhybrid\b|days (per|a) week|commute/, c.l), result: (c) => ({ questionType: 'onsite', profileKey: has(/hybrid/, c.l) ? 'openToHybrid' : 'openToOnsite' }) },
  { name: 'availability', test: (c) => c.field.kind === 'radio' && has(/availability|available to (join|start)|join immediately/, c.t), result: { questionType: 'profile', profileKey: '__availability' } },
  { name: 'source', test: (c) => has(/how did you (hear|find|learn)|hear about|where did you (hear|find)|^source$|referral source/, c.l), result: { questionType: 'source' } },

  // skills / languages multi-selects
  { name: 'languages-multi', test: (c) => c.field.kind === 'checkbox' && !!c.field.multiple && c.options.some((o) => SPOKEN.includes(norm(o))), result: { questionType: 'profile', profileKey: 'languages' } },
  { name: 'skills-multi', test: (c) => c.field.kind === 'checkbox' && !!c.field.multiple && has(/technolog|tools|skills|frameworks|languages|stack/, c.l), result: { questionType: 'profile', profileKey: 'techStack' } },

  // profile facts
  { name: 'phone-type', test: (c) => has(/device type|phone type|type of phone/, c.l), result: { questionType: 'unknown' } },
  { name: 'country-code', test: (c) => has(/country code|dial(ing)? code|phone code|calling code/, c.l) || (c.field.kind === 'select' && c.options.length > 1 && c.options.filter((o) => /^\+\d/.test(o)).length >= c.options.length - 1), result: { questionType: 'profile', profileKey: 'phoneCountryCode' } },
  { name: 'preferred-name', test: (c) => has(/preferred (first )?name|nick ?name|name (you|you'?d|you would) (prefer|like to be called|go by)|prefer(red)? to be (called|addressed)|\bgo by\b/, c.l), result: { questionType: 'profile', profileKey: 'preferredName' } },
  { name: 'first-name', test: (c) => has(/first name|given name|forename/, c.l), result: { questionType: 'profile', profileKey: 'firstName' } },
  { name: 'last-name', test: (c) => has(/last name|family name|surname/, c.l), result: { questionType: 'profile', profileKey: 'lastName' } },
  { name: 'full-name', test: (c) => has(/^(full |legal |full legal |your |candidate |applicant )?name$|^full name|^legal name/, c.l), result: { questionType: 'profile', profileKey: 'fullName' } },
  { name: 'email', test: (c) => has(/e-?mail/, c.l) || c.field.inputType === 'email', result: { questionType: 'profile', profileKey: 'email' } },
  { name: 'linkedin', test: (c) => has(/linked ?in/, c.l), result: { questionType: 'profile', profileKey: 'linkedin' } },
  { name: 'github', test: (c) => has(/git ?hub/, c.l), result: { questionType: 'profile', profileKey: 'github' } },
  { name: 'twitter', test: (c) => has(/twitter|\bx\.com\b/, c.l), result: { questionType: 'profile', profileKey: 'twitter' } },
  { name: 'portfolio', test: (c) => has(/portfolio|website|personal site|home ?page|\bblog\b/, c.l), result: { questionType: 'profile', profileKey: 'portfolio' } },
  { name: 'phone', test: (c) => has(/phone|mobile|\bcell\b|telephone|contact number/, c.l) || c.field.inputType === 'tel', result: { questionType: 'profile', profileKey: 'phone' } },
  { name: 'salary', test: (c) => has(/salary|compensation|\bctc\b|pay expectation|stipend|base pay/, c.l), result: { questionType: 'profile', profileKey: 'desiredSalary' } },
  { name: 'years', test: (c) => has(/years? of (\w+ ){0,4}experience|how many years|experience \(years\)|years experience/, c.l), result: { questionType: 'profile', profileKey: 'yearsOfExperience' } },
  { name: 'notice', test: (c) => has(/notice period/, c.l), result: { questionType: 'profile', profileKey: 'noticePeriod' } },
  { name: 'start-date', test: (c) => has(/start date|available from|availability date|when can you start|date available|earliest start/, c.l), result: (c) => ({ questionType: 'profile', profileKey: c.field.kind === 'date' ? 'earliestStartDate' : 'noticePeriod' }) },
  { name: 'gpa', test: (c) => has(/\bc?gpa\b|grade point/, c.l), result: { questionType: 'profile', profileKey: 'gpa' } },
  { name: 'graduation', test: (c) => has(/graduat/, c.l), result: { questionType: 'profile', profileKey: 'graduationYear' } },
  { name: 'degree', test: (c) => has(/\bdegree\b|level of education|education level|highest education/, c.l), result: { questionType: 'profile', profileKey: 'degree' } },
  { name: 'field-of-study', test: (c) => has(/\bmajor\b|discipline|field of study|area of study/, c.l), result: { questionType: 'profile', profileKey: 'fieldOfStudy' } },
  { name: 'university', test: (c) => has(/universit|\bschool\b|college|institution/, c.l), result: { questionType: 'profile', profileKey: 'university' } },
  { name: 'company', test: (c) => has(/current (company|employer|organi[sz]ation)|^(company|employer)( name)?$|most recent (company|employer)/, c.l), result: { questionType: 'profile', profileKey: 'currentCompany' } },
  { name: 'title', test: (c) => has(/current (job )?(title|role|position)|^job title$/, c.l), result: { questionType: 'profile', profileKey: 'currentTitle' } },
  { name: 'city', test: (c) => has(/\bcity\b|\btown\b/, c.l), result: { questionType: 'profile', profileKey: 'city' } },
  { name: 'postal', test: (c) => has(/postal|\bzip\b|post ?code/, c.l), result: { questionType: 'profile', profileKey: 'postalCode' } },
  { name: 'address', test: (c) => has(/address( line)?( 1)?$|street/, c.l) && !has(/e-?mail/, c.l), result: { questionType: 'profile', profileKey: 'address' } },
  { name: 'state', test: (c) => has(/^(state|province|region)( or province)?$/, c.l), result: { questionType: 'profile', profileKey: 'state' } },
  { name: 'country', test: (c) => has(/\bcountry\b/, c.l), result: { questionType: 'profile', profileKey: 'country' } },
  { name: 'location', test: (c) => has(/location|where are you (based|located)|current residence/, c.l), result: { questionType: 'profile', profileKey: 'location' } },
  { name: 'pronouns', test: (c) => has(/pronoun/, c.l), result: { questionType: 'profile', profileKey: 'pronouns' } },

  // long-form
  { name: 'cover-letter', test: (c) => isLong(c.field) && has(/cover letter|why should (you|we) (be hired|hire)|additional information|anything else (you('d)? like|you want) to share/, c.t + ' ' + norm(c.field.placeholder)), result: { questionType: 'cover_letter' } },
];

// "Are you subject to agreements with your current employer?" is a yes/no question, not the
// current-company fact; profile-fact rules never answer such questions.
const YES_NO_QUESTION = /^(are|do|did|have|has|will|would|is|can|could|were|was) (you|your)\b/;
const FACT_RULES = new Set(['preferred-name', 'first-name', 'last-name', 'full-name', 'email', 'linkedin', 'github', 'twitter', 'portfolio', 'phone', 'salary', 'years', 'notice', 'start-date', 'gpa', 'graduation', 'degree', 'field-of-study', 'university', 'company', 'title', 'city', 'postal', 'address', 'state', 'country', 'location', 'pronouns']);

function attrRule(field: FormField): Result | undefined {
  const key = aliasKeyForAttrs([field.name, field.domId, field.autocomplete]);
  if (!key) return undefined;
  if (key === 'phone' && field.kind === 'select') return undefined;
  return { questionType: 'profile', profileKey: key };
}

export class RuleClassifier implements FieldClassifier {
  classify(fields: FormField[]): Classification[] {
    return fields.map((f) => this.classifyOne(f));
  }

  classifyOne(field: FormField): Classification {
    const options = (field.options || []).map((o) => o.label);
    const l = norm(field.label);
    const t = norm([field.label, field.description, ...options].filter(Boolean).join(' '));
    const ctx: Ctx = { field, l, t, options };
    const yesNo = YES_NO_QUESTION.test(l);
    for (const rule of RULES) {
      if (yesNo && FACT_RULES.has(rule.name)) continue;
      if (rule.test(ctx)) {
        const r = typeof rule.result === 'function' ? rule.result(ctx) : rule.result;
        return { fieldId: field.id, ...r, rule: rule.name, confidence: 0.9 };
      }
    }
    const byAttr = attrRule(field);
    if (byAttr) return { fieldId: field.id, ...byAttr, rule: 'attr-alias', confidence: 0.75 };
    // label could be a placeholder-only field: run the rules on placeholder text
    if (field.placeholder && norm(field.placeholder) !== l) {
      const alt = this.classifyOne({ ...field, label: field.placeholder, placeholder: undefined });
      if (alt.questionType !== 'unknown' && alt.questionType !== 'open_ended') return { ...alt, rule: `placeholder:${alt.rule}` };
    }
    if (isLong(field)) return { fieldId: field.id, questionType: 'open_ended', rule: 'long-text', confidence: 0.6 };
    return { fieldId: field.id, questionType: 'unknown', rule: 'none', confidence: 0 };
  }
}

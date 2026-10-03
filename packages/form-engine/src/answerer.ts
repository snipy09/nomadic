/**
 * Answerer: profile -> custom/cached answers -> policy -> ONE batched LLM call.
 *
 * Rules:
 *  - Facts about the candidate come only from the profile (or answers the user
 *    gave before: customAnswers / cachedAnswers). Never from the model.
 *  - Legal / consent / EEO answers come from policy.ts.
 *  - The model only writes open-ended prose (cover letters, "why us"), grounded
 *    in the profile, and may decline (null) -> needs_user.
 *  - Unknown short questions -> needs_user (required) or skip (optional).
 */
import crypto from 'crypto';
import type { Answer, AnswerContext, Answerer, Classification, FormField } from './contracts.js';
import type { MasterProfile } from './profile.js';
import { profileFullName, profileRequiresSponsorship } from './profile.js';
import { DEFAULT_POLICY, POLICY_OPTION_PATTERNS, type FormPolicy } from './policy.js';
import { yesNo, type OptionQuery } from './options.js';
import type { AnswerLlm, FormAnswerRequest } from './llm.js';
import { GroqClient, isFormAnswerClient } from './llm.js';
import { ensureResumeFile } from './resume-pdf.js';
import { norm } from './dom.js';

export interface AnswerCache {
  get(fingerprint: string): string | undefined;
  set(fingerprint: string, answer: string): void;
}

export class MemoryAnswerCache implements AnswerCache {
  private map = new Map<string, string>();
  get(fp: string) { return this.map.get(fp); }
  set(fp: string, a: string) { this.map.set(fp, a); }
}

export interface AnswererOptions {
  policy?: FormPolicy;
  /**
   * LLM client (prompt-level LlmClient, or a FormAnswerClient such as the Nomadic AI proxy);
   * defaults to Groq with profile.groqApiKey when present. `null` disables the LLM.
   */
  llm?: AnswerLlm | null;
  cache?: AnswerCache;
  /** Directory for generated resume PDFs (tests). */
  resumeDir?: string;
}

/** Stable fingerprint of a question: normalized label + kind + options. */
export function questionFingerprint(field: Pick<FormField, 'label' | 'kind' | 'options'>): string {
  const opts = (field.options || []).map((o) => norm(o.label)).sort().join('|');
  const basis = `${norm(field.label).replace(/[^a-z0-9 ]/g, '')}::${field.kind}::${opts}`;
  return 'q_' + crypto.createHash('sha1').update(basis).digest('hex').slice(0, 16);
}

type Answered = Extract<Answer, { status: 'answered' }>;

const COUNTRY_CODES = ['1', '7', '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46', '47', '48', '49', '51', '52', '53', '54', '55', '56', '57', '58', '60', '61', '62', '63', '64', '65', '66', '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98', '212', '234', '254', '351', '353', '358', '380', '852', '880', '886', '971', '972', '974'];

export function splitPhone(phone: string): { code?: string; national: string } {
  const p = phone.trim();
  const spaced = p.match(/^\+(\d{1,3})[\s-]+(.+)$/);
  if (spaced) return { code: `+${spaced[1]}`, national: spaced[2].trim() };
  const digits = p.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) {
    for (const len of [3, 2, 1]) {
      const c = digits.slice(1, 1 + len);
      if (COUNTRY_CODES.includes(c)) return { code: `+${c}`, national: digits.slice(1 + len) };
    }
  }
  return { national: p };
}

function lookupUserAnswer(field: FormField, fp: string, profile: MasterProfile, cache?: AnswerCache): { value: string; source: 'custom' | 'cache' } | null {
  const l = norm(field.label);
  for (const [src, map] of [['custom', profile.customAnswers], ['cache', profile.cachedAnswers]] as const) {
    if (!map) continue;
    for (const [k, v] of Object.entries(map)) {
      if (!v) continue;
      if (k === fp || norm(k) === l) return { value: v, source: src };
    }
  }
  const c = cache?.get(fp);
  if (c) return { value: c, source: 'cache' };
  return null;
}

export class ProfileAnswerer implements Answerer {
  private readonly policy: FormPolicy;
  constructor(private readonly opts: AnswererOptions = {}) {
    this.policy = opts.policy || DEFAULT_POLICY;
  }

  async answer(fields: FormField[], classes: Classification[], profile: MasterProfile, ctx: AnswerContext = {}): Promise<{ answers: Answer[]; llmCalls: number }> {
    const byId = new Map(classes.map((c) => [c.fieldId, c]));
    const hasCountryCode = classes.some((c) => c.profileKey === 'phoneCountryCode');
    const answers: Answer[] = [];
    const llmQueue: Array<{ field: FormField; fp: string; kind: 'cover_letter' | 'open_ended' }> = [];

    for (const field of fields) {
      const c = byId.get(field.id);
      const fp = questionFingerprint(field);
      if (!c) { answers.push({ fieldId: field.id, status: 'skip', reason: 'not classified' }); continue; }
      const a = this.answerOne(field, c, profile, fp, hasCountryCode);
      if (a === 'llm') {
        llmQueue.push({ field, fp, kind: c.questionType === 'cover_letter' ? 'cover_letter' : 'open_ended' });
        continue;
      }
      answers.push(a);
    }

    let llmCalls = 0;
    if (llmQueue.length) {
      const llm = this.opts.llm === undefined ? (profile.groqApiKey ? new GroqClient(profile.groqApiKey) : null) : this.opts.llm;
      let generated: Record<string, string | null> = {};
      if (llm) {
        llmCalls = 1;
        generated = await this.batch(llm, llmQueue, profile, ctx);
      }
      for (const q of llmQueue) {
        const text = generated[q.field.id];
        if (text && text.trim()) {
          const value = text.trim();
          answers.push({ fieldId: q.field.id, status: 'answered', value, source: 'llm', fingerprint: q.fp });
          this.opts.cache?.set(q.fp, value);
          try { profile.onAnswerResolved?.(q.field.label, value); } catch { /* listener errors are not ours */ }
        } else {
          answers.push(this.unknown(q.field, llm ? 'The model could not answer from the profile' : 'Open-ended question needs your answer (no LLM configured)', q.fp));
        }
      }
    }
    // keep input order
    const order = new Map(fields.map((f, i) => [f.id, i]));
    answers.sort((a, b) => (order.get(a.fieldId) ?? 0) - (order.get(b.fieldId) ?? 0));
    return { answers, llmCalls };
  }

  private unknown(field: FormField, reason: string, fp?: string): Answer {
    return field.required ? { fieldId: field.id, status: 'needs_user', reason, fingerprint: fp } : { fieldId: field.id, status: 'skip', reason };
  }

  private ok(field: FormField, value: string, source: Answered['source'], extra: Partial<Answered> = {}): Answered {
    return { fieldId: field.id, status: 'answered', value, source, ...extra };
  }

  private choice(field: FormField, q: OptionQuery, source: Answered['source']): Answered {
    return this.ok(field, q.value, source, { values: q.values, match: q.match, numeric: q.numeric });
  }

  private policyAnswer(field: FormField, action: 'accept' | 'decline' | 'needs_user', what: string): Answer {
    if (action === 'needs_user') return { fieldId: field.id, status: 'needs_user', reason: `${what}: policy requires your decision` };
    if (field.kind === 'checkbox' && !field.multiple) return this.ok(field, action === 'accept' ? 'true' : 'false', 'policy');
    if (action === 'accept') return this.choice(field, { value: 'Yes', match: POLICY_OPTION_PATTERNS.accept }, 'policy');
    return this.choice(field, { value: 'No', match: POLICY_OPTION_PATTERNS.decline }, 'policy');
  }

  /** Returns an answer, or 'llm' when the question should go to the batched model call. */
  answerOne(field: FormField, c: Classification, p: MasterProfile, fp: string, hasCountryCode = false): Answer | 'llm' {
    // A previous explicit answer from the user wins for non-policy questions.
    const policyTypes = ['legal_arbitration', 'legal_certification', 'consent_privacy', 'consent_marketing'];
    if (!policyTypes.includes(c.questionType) && c.profileKey !== '__password') {
      const prior = lookupUserAnswer(field, fp, p, this.opts.cache);
      if (prior) return this.ok(field, prior.value, prior.source, { fingerprint: fp, values: prior.value.includes('|') && field.multiple ? prior.value.split('|') : undefined });
    }

    switch (c.questionType) {
      case 'legal_arbitration': return this.policyAnswer(field, this.policy.arbitration, 'Arbitration agreement');
      case 'legal_certification': return this.policyAnswer(field, this.policy.certification, 'Certification');
      case 'consent_privacy': return this.policyAnswer(field, this.policy.privacyConsent, 'Privacy consent');
      case 'consent_marketing': return this.policyAnswer(field, this.policy.marketingOptIn, 'Marketing opt-in');
      case 'eeo_gender': case 'eeo_race': case 'eeo_hispanic': case 'eeo_veteran': case 'eeo_disability': case 'eeo_orientation': {
        const key = ({ eeo_gender: 'gender', eeo_race: 'race', eeo_hispanic: 'hispanicLatino', eeo_veteran: 'veteranStatus', eeo_disability: 'disabilityStatus', eeo_orientation: 'sexualOrientation' } as const)[c.questionType];
        const own = p.eeo?.[key];
        if (own) return this.choice(field, { value: own }, 'profile');
        if (this.policy.selfIdentification === 'needs_user') return { fieldId: field.id, status: 'needs_user', reason: 'Self-identification: policy requires your decision' };
        return this.choice(field, { value: 'Decline to self-identify', match: POLICY_OPTION_PATTERNS.selfIdDecline }, 'policy');
      }
      case 'work_authorization':
        return typeof p.workAuthorized === 'boolean' ? this.choice(field, yesNo(p.workAuthorized), 'profile') : this.unknown(field, 'Work authorization is not in your profile');
      case 'sponsorship': {
        const s = profileRequiresSponsorship(p);
        return typeof s === 'boolean' ? this.choice(field, yesNo(s), 'profile') : this.unknown(field, 'Sponsorship need is not in your profile');
      }
      case 'relocation':
        return typeof p.willingToRelocate === 'boolean' ? this.choice(field, yesNo(p.willingToRelocate), 'profile') : this.unknown(field, 'Relocation preference is not in your profile');
      case 'onsite': {
        const v = c.profileKey === 'openToHybrid' ? p.openToHybrid ?? p.openToOnsite : p.openToOnsite ?? p.openToHybrid;
        return typeof v === 'boolean' ? this.choice(field, yesNo(v), 'profile') : this.unknown(field, 'On-site / hybrid preference is not in your profile');
      }
      case 'source': {
        const entry = Object.entries({ ...(p.cachedAnswers || {}), ...(p.customAnswers || {}) })
          .find(([k, v]) => v && /how did you (hear|find|learn)|hear about|^source$|referral source/i.test(k));
        return entry ? this.choice(field, { value: entry[1] }, 'custom') : this.unknown(field, '"How did you hear about us" is not in your profile (add it to custom answers)');
      }
      case 'resume': {
        const file = ensureResumeFile(p, this.policy.generateResumeWhenMissing, this.opts.resumeDir);
        return file ? this.ok(field, file, 'profile') : this.unknown(field, 'No resume file in your profile');
      }
      case 'cover_letter':
        if (p.coverLetter) return this.ok(field, p.coverLetter, 'profile');
        return 'llm';
      case 'open_ended': return 'llm';
      case 'profile': return this.profileFact(field, c.profileKey || '', p, hasCountryCode);
      default:
        return c.profileKey === '__password' ? { fieldId: field.id, status: 'skip', reason: 'Password fields are never filled' } : this.unknown(field, 'This question is not covered by your profile');
    }
  }

  private profileFact(field: FormField, key: string, p: MasterProfile, hasCountryCode: boolean): Answer {
    const missing = (what: string) => this.unknown(field, `${what} is not in your profile`);
    const text = (v: string | undefined | null, what: string) => (v && String(v).trim() ? this.ok(field, String(v).trim(), 'profile') : missing(what));
    switch (key) {
      case 'fullName': return text(profileFullName(p), 'Name');
      case 'firstName': return text(p.firstName, 'First name');
      case 'lastName': return text(p.lastName, 'Last name');
      case 'preferredName': return text(p.preferredName, 'Preferred name');
      case 'email': return text(p.email, 'Email');
      case 'phone': {
        if (!p.phone) return missing('Phone');
        return this.ok(field, hasCountryCode ? splitPhone(p.phone).national : p.phone, hasCountryCode ? 'derived' : 'profile');
      }
      case 'phoneCountryCode': {
        const code = p.phone ? splitPhone(p.phone).code : undefined;
        if (!code) return missing('Phone country code');
        const esc = code.replace('+', '\\+');
        return this.choice(field, { value: code, match: [`^${esc}(\\D|$)`, `\\(${esc}\\)`, `${esc}(\\D|$)`] }, 'derived');
      }
      case 'location': {
        if (!p.location && !p.city) return missing('Location');
        const value = p.location || [p.city, p.state, p.country].filter(Boolean).join(', ');
        const city = p.city || value.split(',')[0].trim();
        const escRx = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const matchers = [p.state ? `${escRx(city)}.*${escRx(p.state)}` : '', escRx(city)].filter(Boolean);
        return this.ok(field, value, 'profile', { searchText: city, match: matchers });
      }
      case 'city': return text(p.city || (p.location ? p.location.split(',')[0] : ''), 'City');
      case 'state': return text(p.state, 'State');
      case 'country': return p.country ? this.choice(field, { value: p.country, match: [`^${p.country}`] }, 'profile') : missing('Country');
      case 'postalCode': return text(p.postalCode, 'Postal code');
      case 'address': return text(p.address, 'Address');
      case 'linkedin': return text(p.linkedin, 'LinkedIn');
      case 'github': return text(p.github || (/portfolio|website/i.test(field.label) ? p.portfolio : ''), 'GitHub');
      case 'portfolio': return text(p.portfolio || p.projectsUrl, 'Portfolio');
      case 'twitter': return text(p.twitter, 'Twitter');
      case 'currentCompany': return text(p.currentCompany, 'Current company');
      case 'currentTitle': return text(p.currentTitle, 'Current title');
      case 'yearsOfExperience':
        return typeof p.yearsOfExperience === 'number' ? this.ok(field, String(p.yearsOfExperience), 'profile', { numeric: true }) : missing('Years of experience');
      case 'desiredSalary': return text(p.desiredSalary || p.salary, 'Desired salary');
      case 'noticePeriod': return text(p.noticePeriod, 'Notice period');
      case 'earliestStartDate': return text(p.earliestStartDate, 'Earliest start date');
      case 'university': return text(p.university, 'University');
      case 'degree': return p.degree ? this.choice(field, { value: p.degree, match: degreeMatchers(p.degree) }, 'profile') : missing('Degree');
      case 'fieldOfStudy': return text(p.fieldOfStudy, 'Field of study');
      case 'gpa': return text(p.gpa, 'GPA');
      case 'graduationYear': return text(p.graduationYear, 'Graduation year');
      case 'pronouns': return text(p.eeo?.pronouns, 'Pronouns');
      case 'languages': {
        const langs = (p.languages || []).map(norm);
        if (!langs.length) return missing('Languages');
        const picked = (field.options || []).filter((o) => langs.includes(norm(o.label))).map((o) => o.label);
        return picked.length ? this.ok(field, picked.join('|'), 'profile', { values: picked }) : missing('Matching languages');
      }
      case 'techStack': {
        const stack = (p.techStack || '').split(/[,;/|]+/).map((s) => norm(s)).filter(Boolean);
        if (!stack.length) return missing('Tech stack');
        const picked = (field.options || []).filter((o) => stack.includes(norm(o.label))).map((o) => o.label);
        return picked.length ? this.ok(field, picked.join('|'), 'profile', { values: picked }) : this.unknown(field, 'None of the options are in your tech stack');
      }
      case '__availability': {
        const immediate = /immediate|^0\b|right away|now/i.test(p.noticePeriod || '');
        if (immediate) return this.choice(field, { value: 'Yes', match: ['immediately', '^yes\\b'] }, 'derived');
        return this.unknown(field, `Availability: your notice period is "${p.noticePeriod || 'unknown'}"`);
      }
      default: return missing(key || 'Answer');
    }
  }

  /** The facts and questions for one batched call. Only these profile facts leave the device. */
  static formAnswerRequest(queue: Array<{ field: FormField; kind: string }>, p: MasterProfile, ctx: AnswerContext): FormAnswerRequest {
    const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    const candidate = {
      name: s(profileFullName(p)),
      current_title: s(p.currentTitle), current_company: s(p.currentCompany), desired_title: s(p.desiredTitle),
      years_of_experience: typeof p.yearsOfExperience === 'number' ? p.yearsOfExperience : undefined,
      skills: s(p.techStack), summary: s(p.summaryText)?.slice(0, 4000),
      education: s([p.degree, p.fieldOfStudy, p.university, p.graduationYear].filter(Boolean).join(', ')),
      location: s(p.location),
    };
    for (const k of Object.keys(candidate) as Array<keyof typeof candidate>) if (candidate[k] === undefined) delete candidate[k];
    return {
      candidate,
      job: { title: s(ctx.jobTitle)?.slice(0, 300), company: s(ctx.company)?.slice(0, 300), description: s(ctx.jobDescription)?.slice(0, 2000) },
      questions: queue.map((q) => ({
        id: q.field.id,
        question: q.field.label.slice(0, 1000),
        type: q.kind === 'cover_letter' ? 'cover_letter' as const : 'open_ended' as const,
        max_chars: q.kind === 'cover_letter' ? 1200 : 700,
      })),
    };
  }

  private async batch(llm: AnswerLlm, queue: Array<{ field: FormField; kind: string }>, p: MasterProfile, ctx: AnswerContext): Promise<Record<string, string | null>> {
    const req = ProfileAnswerer.formAnswerRequest(queue, p, ctx);
    const out: Record<string, string | null> = {};
    if (isFormAnswerClient(llm)) {
      const res = await llm.answerForm(req).catch(() => null);
      for (const q of queue) {
        const v = res?.[q.field.id];
        out[q.field.id] = typeof v === 'string' ? v : null;
      }
      return out;
    }
    const facts = {
      name: req.candidate.name,
      currentTitle: p.currentTitle, currentCompany: p.currentCompany, desiredTitle: p.desiredTitle,
      yearsOfExperience: p.yearsOfExperience, skills: p.techStack, summary: p.summaryText,
      education: req.candidate.education,
      location: p.location,
    };
    const questions = req.questions.map((q) => ({ id: q.id, question: q.question, type: q.type, maxChars: q.max_chars }));
    const system = [
      'You write job-application answers on behalf of a candidate, in first person.',
      'Use ONLY the facts in CANDIDATE. Never invent employers, dates, numbers, degrees, projects or skills.',
      'If the facts are not enough to answer a question honestly, return null for it.',
      'Return JSON: {"answers": {"<id>": "<answer or null>"}}.',
    ].join(' ');
    const user = JSON.stringify({ CANDIDATE: facts, JOB: { title: ctx.jobTitle, company: ctx.company, description: ctx.jobDescription?.slice(0, 2000) }, QUESTIONS: questions });
    const res = (await llm.completeJson(system, user)) as { answers?: Record<string, unknown> } | null;
    const answers = res && typeof res === 'object' && res.answers && typeof res.answers === 'object' ? res.answers : {};
    for (const q of queue) {
      const v = (answers as Record<string, unknown>)[q.field.id];
      out[q.field.id] = typeof v === 'string' ? v : null;
    }
    return out;
  }
}

function degreeMatchers(degree: string): string[] {
  const d = norm(degree);
  if (/bachelor|b\.?s\b|b\.?a\b|b\.?tech|b\.?e\b/.test(d)) return ['bachelor', '\\bb\\.?(s|a|sc|tech|e)\\b'];
  if (/master|m\.?s\b|m\.?tech|mba/.test(d)) return ['master', '\\bm\\.?(s|a|sc|tech|ba)\\b'];
  if (/phd|doctor/.test(d)) return ['doctor', 'ph\\.?d'];
  if (/associate/.test(d)) return ['associate'];
  if (/high school|secondary/.test(d)) return ['high school', 'secondary'];
  return [];
}

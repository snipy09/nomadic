import type { Page } from 'playwright';
import { canSubmit, fillForm, type FillReport, type FormField, type FormProfile, type UnknownAnswerer } from '@job-automator/form-engine';
import type { MasterProfile } from './auto-apply-engine.js';

/** Map the app's MasterProfile onto the form engine's profile. Only real data is passed; nothing is invented. */
export function toFormProfile(p: MasterProfile): FormProfile {
  const resume = p.resumeFilePath || p.resumes?.find((r) => r.isDefault)?.filePath || p.resumes?.[0]?.filePath;
  const sponsorship = (p.sponsorship || '').toLowerCase();
  const custom = { ...(p.customAnswers || {}) };
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    email: p.email,
    phone: p.phone,
    linkedin: p.linkedin,
    github: p.github,
    portfolio: p.portfolio || p.projectsUrl,
    salary: p.salary || p.desiredSalary,
    noticePeriod: p.noticePeriod,
    currentTitle: p.desiredTitle,
    location: p.location,
    yearsExperience: p.yearsOfExperience,
    summary: p.summaryText ? p.summaryText.replace(/\s+/g, ' ').trim().slice(0, 900) : undefined,
    resumeFilePath: resume,
    coverLetterText: p.coverLetterText,
    authorizedToWork: p.authorizedToWork,
    willingToRelocate: p.willingToRelocate,
    needsSponsorship: /^(yes|true|require|need)/.test(sponsorship),
    customAnswers: { ...custom, ...(p.cachedAnswers || {}) },
  };
}

/**
 * Free-tier Groq answerer for open-ended questions only. Answers strictly from the candidate's own
 * profile text and returns null when the profile doesn't support an answer (no canned filler text).
 */
export function makeGroqAnswerer(p: MasterProfile): UnknownAnswerer | undefined {
  const key = p.groqApiKey;
  if (!key) return undefined;
  const context = [
    `Name: ${p.firstName} ${p.lastName}`,
    p.desiredTitle && `Target role: ${p.desiredTitle}`,
    p.techStack && `Skills: ${p.techStack}`,
    p.summaryText && `Resume: ${p.summaryText.slice(0, 2500)}`,
  ].filter(Boolean).join('\n');
  return async (f: FormField) => {
    if (f.kind !== 'text' && f.kind !== 'textarea') return null;
    if (!f.label || f.label.length < 6) return null;
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          temperature: 0.2,
          max_tokens: 220,
          messages: [
            {
              role: 'system',
              content:
                'You fill job application questions for a candidate. Answer in first person, concisely, using ONLY facts in the candidate context. If the context does not contain what is needed, reply with exactly UNKNOWN. Never invent employers, dates, numbers or credentials.',
            },
            { role: 'user', content: `Candidate context:\n${context}\n\nQuestion: ${f.label}` },
          ],
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const text = data.choices?.[0]?.message?.content?.trim() || '';
      return !text || /^unknown\b/i.test(text) ? null : text;
    } catch {
      return null;
    }
  };
}

export interface NewEngineOutcome {
  report: FillReport;
  /** True when at least one field was found on the page (otherwise the caller should keep navigating). */
  foundForm: boolean;
  safeToSubmit: boolean;
}

export async function runNewFormEngine(page: Page, profile: MasterProfile): Promise<NewEngineOutcome> {
  const report = await fillForm(page, toFormProfile(profile), { unknownAnswerer: makeGroqAnswerer(profile) });
  return { report, foundForm: report.fields.length > 0, safeToSubmit: report.filled > 0 && canSubmit(report) };
}

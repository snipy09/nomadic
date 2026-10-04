/**
 * Facts read straight off resume or LinkedIn text, on this computer, without AI.
 * Only values that appear in the text are returned; anything not found stays undefined.
 * The AI drafts (main process, `draft-profile-answers`) fill what these rules miss.
 */
import { tagSkills, type ContentBundle } from '@job-automator/learning';
import { skills } from '@job-automator/learning/seed/bundle.json';
import { skillName } from '../feed/match';

export interface ResumeFacts {
  email?: string;
  phone?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  /** Application answers by `APP_ANSWERS` id. */
  answers: Record<string, string>;
  skills: string[];
}

const catalogueSkills = skills as unknown as ContentBundle['skills'];

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(?:\+?91[\s-]?)?(?:\(?0\)?[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b|\+\d{1,3}[\s-]?\d{3,4}[\s-]?\d{3,4}[\s-]?\d{3,4}/;
const URL_RE = /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s)|,;]*)?/gi;
const NOT_PORTFOLIO = /(linkedin|github|gmail|yahoo|outlook|hotmail|leetcode|hackerrank|codechef|codeforces|geeksforgeeks|google|youtube|coursera|udemy)\./i;

const DEGREES: Array<[RegExp, string]> = [
  [/\bB\.?\s?Tech\b/i, 'B.Tech'],
  [/\bM\.?\s?Tech\b/i, 'M.Tech'],
  [/\bB\.?\s?E\.?(?=[\s,(-]|$)/, 'B.E.'],
  [/\bM\.?\s?E\.?(?=[\s,(-]|$)/, 'M.E.'],
  [/\bBCA\b/, 'BCA'],
  [/\bMCA\b/, 'MCA'],
  [/\bB\.?\s?Sc\b/i, 'B.Sc'],
  [/\bM\.?\s?Sc\b/i, 'M.Sc'],
  [/\bMBA\b/, 'MBA'],
  [/\bDual Degree\b/i, 'Dual Degree'],
  [/\bBachelor of [A-Z][A-Za-z]+(?: (?:and|&|of|in) [A-Z][A-Za-z]+| [A-Z][A-Za-z]+)*/, ''],
  [/\bMaster of [A-Z][A-Za-z]+(?: (?:and|&|of|in) [A-Z][A-Za-z]+| [A-Z][A-Za-z]+)*/, ''],
];

const BRANCHES = [
  'Computer Science and Engineering', 'Computer Science & Engineering', 'Computer Science', 'Computer Engineering',
  'Information Technology', 'Artificial Intelligence and Data Science', 'Artificial Intelligence and Machine Learning',
  'Data Science', 'Electronics and Communication Engineering', 'Electronics & Communication Engineering',
  'Electronics and Communication', 'Electrical and Electronics Engineering', 'Electrical Engineering',
  'Electronics Engineering', 'Mechanical Engineering', 'Civil Engineering', 'Chemical Engineering',
  'Instrumentation Engineering', 'Biotechnology', 'Mathematics and Computing', 'Engineering Physics',
];

const INSTITUTE = /\b(Indian Institute of [A-Za-z ]+|IIT|NIT|IIIT|BITS|University|Institute|College|Vidyapeeth|Vishwavidyalaya)\b/;

function clean(s: string, max = 120): string {
  return s.replace(/\s+/g, ' ').replace(/^[\s,;:|•\-–—]+|[\s,;:|•\-–—]+$/g, '').slice(0, max).trim();
}

function normaliseUrl(raw: string): string {
  const u = raw.replace(/[.)\]]+$/, '');
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

function findDegree(text: string): { value: string; index: number } | undefined {
  let best: { value: string; index: number } | undefined;
  for (const [re, label] of DEGREES) {
    const m = re.exec(text);
    if (m && (!best || m.index < best.index)) best = { value: label || clean(m[0], 80), index: m.index };
  }
  return best;
}

/** Facts found in the text. `now` bounds plausible graduation years. */
export function extractResumeFacts(text: string, now = new Date()): ResumeFacts {
  const out: ResumeFacts = { answers: {}, skills: [] };
  if (!text.trim()) return out;
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const email = EMAIL.exec(text)?.[0];
  if (email) out.email = email;
  const phone = PHONE.exec(text)?.[0];
  if (phone && phone.replace(/\D/g, '').length >= 10) out.phone = phone.trim();

  for (const m of text.matchAll(URL_RE)) {
    const raw = m[0];
    if (raw.includes('@') || /@$/.test(text.slice(Math.max(0, m.index! - 1), m.index))) continue;
    const url = normaliseUrl(raw);
    if (!out.linkedin && /linkedin\.com\/in\/[^/\s]+/i.test(url)) out.linkedin = url;
    else if (!out.github && /github\.com\/[A-Za-z0-9-]+/i.test(url) && !/github\.com\/?$/i.test(url)) out.github = url.replace(/(github\.com\/[A-Za-z0-9-]+).*/i, '$1');
    else if (!out.portfolio && !NOT_PORTFOLIO.test(url) && !/\.(pdf|png|jpg)$/i.test(url) && /\.(dev|me|io|app|in|com|site|tech|xyz|page|vercel\.app|netlify\.app)(\/|$)/i.test(url)) {
      if (!EMAIL.test(raw) && !/^https?:\/\/[^/]*\d+\.\d+/.test(url)) out.portfolio = url;
    }
  }

  const degree = findDegree(text);
  if (degree) out.answers.degree = degree.value;

  const branch = BRANCHES.find((b) => new RegExp(`\\b${b.replace(/[&]/g, '\\&')}\\b`, 'i').test(text));
  if (branch) out.answers.field_of_study = branch.replace(' & ', ' and ');

  const instLine = lines.find((l) => INSTITUTE.test(l) && l.length <= 160 && !/@/.test(l));
  if (instLine) {
    const name = clean(instLine.replace(/\b(19|20)\d{2}\b.*$/, '').replace(/\s[|–—-]\s.*$/, ''));
    if (name.length >= 3) out.answers.university = name;
  }

  // Graduation year: the latest plausible year on the degree's line or the two after it.
  const maxYear = now.getFullYear() + 6;
  const degLine = lines.findIndex((l) => DEGREES.some(([re]) => re.test(l)) || (instLine !== undefined && l === instLine));
  if (degLine >= 0) {
    const years = lines.slice(degLine, degLine + 3).join(' ').match(/\b(19[89]\d|20\d{2})\b/g)?.map(Number).filter((y) => y <= maxYear) ?? [];
    if (years.length) out.answers.graduation_year = String(Math.max(...years));
  }

  const gpa = /\b(?:CGPA|GPA|CPI|SGPA)\b\s*[:\-–]?\s*(\d{1,2}(?:\.\d{1,2})?)\s*(?:\/\s*(10|4(?:\.0)?))?/i.exec(text)
    ?? /(\d{1,2}\.\d{1,2})\s*\/\s*(10)\b/.exec(text);
  if (gpa) {
    const v = Number(gpa[1]);
    const scale = gpa[2] ? Number(gpa[2]) : v <= 4 ? 4 : 10;
    if (v > 0 && v <= scale) out.answers.gpa = `${gpa[1]} / ${scale}`;
  } else {
    const pct = /\b(\d{2}(?:\.\d{1,2})?)\s*%/.exec(lines.slice(Math.max(0, degLine), Math.max(0, degLine) + 3).join(' '));
    if (degLine >= 0 && pct && Number(pct[1]) <= 100) out.answers.gpa = `${pct[1]}%`;
  }

  const langLine = lines.find((l) => /^languages?\s*(spoken|known)?\s*[:\-–]/i.test(l));
  if (langLine) {
    const spoken = langLine.replace(/^[^:\-–]*[:\-–]\s*/, '');
    if (/\b(English|Hindi|Tamil|Telugu|Kannada|Marathi|Bengali|Gujarati|Malayalam|Punjabi|Odia|Urdu)\b/i.test(spoken)) out.answers.languages = clean(spoken);
  }

  out.skills = tagSkills(text, catalogueSkills).map(skillName);
  return out;
}

/** Fills only empty slots: what the user already typed always wins. */
export function mergeMissing<T extends Record<string, string>>(current: T, found: Record<string, string | undefined>): T {
  const out: Record<string, string> = { ...current };
  for (const [k, v] of Object.entries(found)) if (v && !(out[k] ?? '').trim()) out[k] = v;
  return out as T;
}

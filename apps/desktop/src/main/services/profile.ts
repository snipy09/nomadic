import { syncPushUserProfile } from '@job-automator/supabase';
import type { MasterProfile } from '@job-automator/automation';
import { getDb, persistDb, saveCachedFormAnswerDb } from '../db.js';
import { log } from './app-context.js';
import { getActiveSyncSession } from './session.js';
import { getAnonSupabase } from './supabase.js';
import { overlaySecrets, readSecret, writeSecret } from './secrets.js';

/**
 * Reads the `master_profile` row as a column -> value map with secrets
 * (Groq key, SMTP password, Gemini key) decrypted back into their original
 * keys. `null` when no row exists.
 */
export function getMasterProfileRow(): Record<string, unknown> | null {
  const db = getDb();
  const results = db.exec('SELECT * FROM master_profile WHERE id = 1');
  if (!results.length || !results[0].values.length) return null;
  const cols = results[0].columns;
  const row = results[0].values[0];
  return overlaySecrets(Object.fromEntries(cols.map((c, i) => [c, row[i]])));
}

export function getCandidateEmail(): string {
  try {
    const db = getDb();
    const profEmail = db.exec('SELECT email FROM master_profile WHERE id = 1');
    if (profEmail.length && profEmail[0].values.length) {
      return String(profEmail[0].values[0][0] || '');
    }
  } catch {}
  return '';
}

/** The persisted `onboarding_completed` flag (0 when there is no row yet). */
function readStoredOnboardingFlag(db: ReturnType<typeof getDb>): number {
  const res = db.exec('SELECT onboarding_completed FROM master_profile WHERE id = 1');
  return res.length && res[0].values.length ? Number(res[0].values[0][0]) === 1 ? 1 : 0 : 0;
}

/** Onboarding counts as done only once a save persisted the flag. */
export function isOnboardingCompleted(): boolean {
  let hasCompleted = false;
  try {
    const db = getDb();
    hasCompleted = readStoredOnboardingFlag(db) === 1;
  } catch {}
  return hasCompleted;
}

/** Seeds name/email for a brand new account without overwriting existing values. */
export function seedProfileIdentity(givenName: string, familyName: string, email: string): void {
  const db = getDb();
  db.run(
    `INSERT INTO master_profile (id, first_name, last_name, email, sponsorship, onboarding_completed)
     VALUES (1, ?, ?, ?, 'No', 0)
     ON CONFLICT(id) DO UPDATE SET
       first_name = CASE WHEN master_profile.first_name IS NULL OR master_profile.first_name = '' THEN excluded.first_name ELSE master_profile.first_name END,
       last_name = CASE WHEN master_profile.last_name IS NULL OR master_profile.last_name = '' THEN excluded.last_name ELSE master_profile.last_name END,
       email = excluded.email`,
    [givenName, familyName, email]
  );
  persistDb();
}

const PROFILE_UPSERT_SQL = `
  INSERT INTO master_profile
    (id, first_name, last_name, email, phone, linkedin, github,
     sponsorship, desired_salary, notice_period, groq_api_key,
     smtp_password, resume_text, custom_answers_json, onboarding_completed,
     desired_title, tech_stack)
  VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    first_name=excluded.first_name,
    last_name=excluded.last_name,
    email=excluded.email,
    phone=excluded.phone,
    linkedin=excluded.linkedin,
    github=excluded.github,
    sponsorship=excluded.sponsorship,
    desired_salary=excluded.desired_salary,
    notice_period=excluded.notice_period,
    groq_api_key=excluded.groq_api_key,
    smtp_password=excluded.smtp_password,
    resume_text=excluded.resume_text,
    custom_answers_json=excluded.custom_answers_json,
    onboarding_completed=excluded.onboarding_completed,
    desired_title=excluded.desired_title,
    tech_stack=excluded.tech_stack,
    updated_at=CURRENT_TIMESTAMP
`;

export interface ProfileColumns {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  github: string | null;
  sponsorship: string | null;
  desired_salary: string | null;
  notice_period: string | null;
  groq_api_key: string | null;
  smtp_password: string | null;
  resume_text: string | null;
  custom_answers_json: string | null;
  onboarding_completed: number;
  desired_title: string | null;
  tech_stack: string | null;
}

/**
 * Upserts the full master profile row. Secrets are routed through the
 * encrypted secret store; the legacy columns only receive a value when OS
 * encryption is unavailable.
 */
export function upsertMasterProfile(p: ProfileColumns): void {
  const db = getDb();
  const groqColumn = writeSecret('groq_api_key', p.groq_api_key, db);
  const smtpColumn = writeSecret('smtp_password', p.smtp_password, db);
  db.run(PROFILE_UPSERT_SQL, [
    p.first_name,
    p.last_name,
    p.email,
    p.phone,
    p.linkedin,
    p.github,
    p.sponsorship,
    p.desired_salary,
    p.notice_period,
    groqColumn,
    smtpColumn,
    p.resume_text,
    p.custom_answers_json,
    p.onboarding_completed,
    p.desired_title,
    p.tech_stack,
  ]);
}

/** Business logic behind the `save-master-profile` channel. */
export function saveMasterProfile(p: Record<string, unknown>): { success: boolean } {
  const onboardingVal = p.onboarding_completed !== undefined
    ? (p.onboarding_completed ? 1 : 0)
    : (p.onboardingCompleted !== undefined ? (p.onboardingCompleted ? 1 : 0) : readStoredOnboardingFlag(getDb()));

  upsertMasterProfile({
    first_name: (p.firstName as string) ?? (p.first_name as string) ?? null,
    last_name: (p.lastName as string) ?? (p.last_name as string) ?? null,
    email: (p.email as string) ?? null,
    phone: (p.phone as string) ?? null,
    linkedin: (p.linkedin as string) ?? (p.linkedin_url as string) ?? null,
    github: (p.github as string) ?? (p.github_url as string) ?? null,
    sponsorship: (p.sponsorship as string) ?? null,
    desired_salary: (p.desiredSalary as string) ?? (p.desired_salary as string) ?? null,
    notice_period: (p.noticePeriod as string) ?? (p.notice_period as string) ?? null,
    groq_api_key: (p.groqApiKey as string) ?? (p.groq_api_key as string) ?? null,
    smtp_password: (p.smtpPassword as string) ?? (p.smtp_password as string) ?? null,
    resume_text: (p.resumeText as string) ?? (p.resume_text as string) ?? null,
    custom_answers_json: (p.customAnswersJson as string) ?? (p.custom_answers_json as string) ?? (p.customAnswers ? JSON.stringify(p.customAnswers) : null),
    onboarding_completed: onboardingVal,
    desired_title: (p.desiredTitle as string) ?? (p.desired_title as string) ?? null,
    tech_stack: (p.techStack as string) ?? (p.tech_stack as string) ?? null,
  });
  persistDb();
  log('[Profile] Master profile saved to local SQLite.');

  // Push to Supabase Cloud if session is active
  const active = getActiveSyncSession();
  if (active) {
    const supabase = getAnonSupabase();
    if (supabase) {
      const customAnswersObj = p.customAnswers || (p.custom_answers_json ? (() => {
        try { return typeof p.custom_answers_json === 'string' ? JSON.parse(p.custom_answers_json) : p.custom_answers_json; } catch { return {}; }
      })() : {});

      syncPushUserProfile(
        supabase,
        active.userId,
        active.sessionToken,
        active.deviceFingerprint,
        {
          first_name: (p.firstName as string) ?? (p.first_name as string) ?? null,
          last_name: (p.lastName as string) ?? (p.last_name as string) ?? null,
          phone: (p.phone as string) ?? null,
          linkedin: (p.linkedin as string) ?? (p.linkedin_url as string) ?? null,
          github: (p.github as string) ?? (p.github_url as string) ?? null,
          sponsorship: (p.sponsorship as string) ?? 'No',
          desired_salary: (p.desiredSalary as string) ?? (p.desired_salary as string) ?? null,
          notice_period: (p.noticePeriod as string) ?? (p.notice_period as string) ?? '2 weeks',
          groq_api_key: (p.groqApiKey as string) ?? (p.groq_api_key as string) ?? null,
          smtp_password: (p.smtpPassword as string) ?? (p.smtp_password as string) ?? null,
          resume_text: (p.resumeText as string) ?? (p.resume_text as string) ?? null,
          custom_answers_json: customAnswersObj as Record<string, unknown>,
          onboarding_completed: Boolean(onboardingVal),
          desired_title: (p.desiredTitle as string) ?? (p.desired_title as string) ?? null,
          tech_stack: (p.techStack as string) ?? (p.tech_stack as string) ?? null,
        }
      ).then((res) => {
        if (res.ok) {
          log('[Cloud Sync] Master profile backup synchronized to Supabase cloud ✓');
        }
      }).catch(() => {});
    }
  }

  return { success: true };
}

/** Groq / Gemini keys for AI calls (decrypted). */
export function getAiKeys(): { groqKey: string; geminiKey: string } {
  try {
    return {
      groqKey: String(readSecret('groq_api_key') ?? ''),
      geminiKey: String(readSecret('gemini_api_key') ?? ''),
    };
  } catch {
    return { groqKey: '', geminiKey: '' };
  }
}

type AutomationResume = { name: string; targetRole: string; filePath: string; isDefault: boolean };

function readResumesForAutomation(): AutomationResume[] {
  const db = getDb();
  const resumeResults = db.exec('SELECT * FROM resumes ORDER BY is_default DESC, id DESC');
  let resumesList: AutomationResume[] = [];
  if (resumeResults.length) {
    const rCols = resumeResults[0].columns;
    resumesList = resumeResults[0].values.map(r => {
      const obj = Object.fromEntries(rCols.map((c, i) => [c, r[i]]));
      return {
        name: String(obj['name'] ?? ''),
        targetRole: String(obj['target_role'] ?? ''),
        filePath: String(obj['file_path'] ?? ''),
        isDefault: Boolean(obj['is_default']),
      };
    });
  }
  return resumesList;
}

function readCachedFormAnswers(): Record<string, string> {
  const db = getDb();
  const cachedAnswersMap: Record<string, string> = {};
  try {
    const ca = db.exec('SELECT question_key, answer_text FROM cached_form_answers');
    if (ca.length && ca[0].values.length) {
      ca[0].values.forEach(v => {
        cachedAnswersMap[String(v[0])] = String(v[1]);
      });
    }
  } catch {}
  return cachedAnswersMap;
}

/**
 * Builds the automation-engine `MasterProfile` from local SQLite (profile,
 * resumes, cached form answers). `null` when no profile row exists.
 */
export function buildAutomationProfile(opts: { logCachedAnswers: boolean }): MasterProfile | null {
  const profileRaw = getMasterProfileRow();
  if (!profileRaw) return null;

  return {
    firstName:    String(profileRaw['first_name'] ?? ''),
    lastName:     String(profileRaw['last_name'] ?? ''),
    email:        String(profileRaw['email'] ?? ''),
    phone:        String(profileRaw['phone'] ?? ''),
    linkedin:     String(profileRaw['linkedin'] ?? ''),
    github:       String(profileRaw['github'] ?? ''),
    sponsorship:  String(profileRaw['sponsorship'] ?? ''),
    salary:       String(profileRaw['desired_salary'] ?? ''),
    noticePeriod: String(profileRaw['notice_period'] ?? ''),
    groqApiKey:   String(profileRaw['groq_api_key'] ?? ''),
    summaryText:  String(profileRaw['resume_text'] ?? ''),
    desiredTitle: String(profileRaw['desired_title'] ?? ''),
    techStack:    String(profileRaw['tech_stack'] ?? ''),
    resumes:      readResumesForAutomation(),
    customAnswers: (() => {
      try { return JSON.parse(String(profileRaw['custom_answers_json'] ?? 'null')); } catch { return undefined; }
    })(),
    cachedAnswers: readCachedFormAnswers(),
    onAnswerResolved: (q: string, a: string) => {
      saveCachedFormAnswerDb(q, a);
      if (opts.logCachedAnswers) {
        log(`[Answer Cache] Cached response for question: "${q.slice(0, 40)}..."`);
      }
    },
  };
}

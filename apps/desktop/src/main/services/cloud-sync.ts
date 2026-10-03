import {
  syncPullUserData,
  syncPushSavedJob,
  syncRemoveSavedJob,
  syncPushResume,
  syncDeleteResume,
} from '@job-automator/supabase';
import { getDb, persistDb } from '../db.js';
import { log } from './app-context.js';
import { getActiveSyncSession } from './session.js';
import { getAnonSupabase } from './supabase.js';
import { upsertMasterProfile } from './profile.js';
import { mergeCloudApplications } from './applications-store.js';

// ── Cloud Sync & Single-Laptop Lock Helpers ─────────────────────────────────

export async function syncPullUserDataToLocalDb(
  userId: string,
  sessionToken: string,
  deviceFingerprint: string
): Promise<boolean> {
  const supabase = getAnonSupabase();
  if (!supabase) return false;

  try {
    const res = await syncPullUserData(supabase, userId, sessionToken, deviceFingerprint);
    if (!res.ok || !res.data) {
      log(`[Cloud Sync] Notice: ${res.error || 'No cloud backup found'}`);
      return false;
    }

    const { profile, applications, savedJobs, resumes } = res.data;
    const db = getDb();

    // 1. Sync Profile (Restore Master Profile & Custom Answers)
    if (profile && typeof profile === 'object') {
      const p = profile as Record<string, any>;
      const customAnswersStr = p.custom_answers_json
        ? (typeof p.custom_answers_json === 'string' ? p.custom_answers_json : JSON.stringify(p.custom_answers_json))
        : '{}';
      const onboardingInt = p.onboarding_completed ? 1 : 0;

      upsertMasterProfile({
        first_name: p.first_name ?? null,
        last_name: p.last_name ?? null,
        email: p.email ?? null,
        phone: p.phone ?? null,
        linkedin: p.linkedin ?? null,
        github: p.github ?? null,
        sponsorship: p.sponsorship ?? 'No',
        desired_salary: p.desired_salary ?? null,
        notice_period: p.notice_period ?? '2 weeks',
        groq_api_key: p.groq_api_key ?? null,
        smtp_password: p.smtp_password ?? null,
        resume_text: p.resume_text ?? null,
        custom_answers_json: customAnswersStr,
        onboarding_completed: onboardingInt,
        desired_title: p.desired_title ?? null,
        tech_stack: p.tech_stack ?? null,
      });
    }

    // 2. Sync Applications (merge by apply URL; newer side wins, history unioned)
    if (Array.isArray(applications)) {
      mergeCloudApplications(db, applications, new Date().toISOString());
    }

    // 3. Sync Saved Jobs
    if (Array.isArray(savedJobs)) {
      for (const job of savedJobs) {
        if (!job.apply_url || !job.company || !job.title) continue;
        db.run(
          `INSERT INTO saved_jobs (title, company, apply_url, location, salary, source, score, description, saved_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(apply_url) DO UPDATE SET
             title=excluded.title, company=excluded.company, location=excluded.location, salary=excluded.salary,
             source=excluded.source, score=excluded.score, description=excluded.description`,
          [
            String(job.title),
            String(job.company),
            String(job.apply_url),
            job.location ? String(job.location) : null,
            job.salary ? String(job.salary) : null,
            String(job.source || 'Cloud Feed'),
            Number(job.score || 100),
            job.description ? String(job.description) : null,
            String(job.saved_at || new Date().toISOString())
          ] as any
        );
      }
    }

    // 4. Sync Resumes
    if (Array.isArray(resumes)) {
      for (const r of resumes) {
        if (!r.name) continue;
        db.run(
          `INSERT OR IGNORE INTO resumes (name, target_role, file_path, is_default, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [
            String(r.name),
            String(r.target_role || ''),
            String(r.file_path || ''),
            r.is_default ? 1 : 0,
            String(r.created_at || new Date().toISOString())
          ] as any
        );
      }
    }

    persistDb();
    log(`[Cloud Sync] Pulled & synchronized profile, applications (${applications?.length || 0}), and saved jobs (${savedJobs?.length || 0}) from Supabase ✓`);
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[Cloud Sync] Pull exception: ${msg}`);
    return false;
  }
}

/** Kept here for existing importers; the implementation lives in services/applications.ts. */
export { logAndSyncApplication } from './applications.js';

export function saveAndSyncJob(job: {
  title: string;
  company: string;
  apply_url: string;
  location?: string;
  salary?: string;
  source?: string;
  score?: number;
  description?: string;
}): void {
  const db = getDb();
  db.run(
    `INSERT INTO saved_jobs (title, company, apply_url, location, salary, source, score, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(apply_url) DO UPDATE SET
       title=excluded.title, company=excluded.company, location=excluded.location, salary=excluded.salary,
       source=excluded.source, score=excluded.score, description=excluded.description`,
    [
      job.title,
      job.company,
      job.apply_url,
      job.location || null,
      job.salary || null,
      job.source || 'Cloud Feed',
      job.score || 50,
      job.description || null,
    ]
  );
  persistDb();

  const active = getActiveSyncSession();
  if (active) {
    const supabase = getAnonSupabase();
    if (supabase) {
      syncPushSavedJob(
        supabase,
        active.userId,
        active.sessionToken,
        active.deviceFingerprint,
        job
      ).catch(() => {});
    }
  }
}

export function removeAndSyncJob(applyUrl: string): void {
  const db = getDb();
  db.run('DELETE FROM saved_jobs WHERE apply_url = ?', [applyUrl]);
  persistDb();

  const active = getActiveSyncSession();
  if (active) {
    const supabase = getAnonSupabase();
    if (supabase) {
      syncRemoveSavedJob(
        supabase,
        active.userId,
        active.sessionToken,
        active.deviceFingerprint,
        applyUrl
      ).catch(() => {});
    }
  }
}

export function saveAndSyncResume(resume: {
  name: string;
  targetRole?: string;
  filePath?: string;
  isDefault?: boolean;
}): void {
  const db = getDb();
  const isDefault = resume.isDefault ? 1 : 0;
  if (isDefault) {
    db.run('UPDATE resumes SET is_default = 0');
  }
  db.run(
    `INSERT INTO resumes (name, target_role, file_path, is_default)
     VALUES (?, ?, ?, ?)`,
    [
      resume.name,
      resume.targetRole || '',
      resume.filePath || '',
      isDefault,
    ]
  );
  persistDb();

  const active = getActiveSyncSession();
  if (active) {
    const supabase = getAnonSupabase();
    if (supabase) {
      syncPushResume(supabase, active.userId, active.sessionToken, active.deviceFingerprint, {
        name: resume.name,
        target_role: resume.targetRole,
        file_path: resume.filePath,
        is_default: Boolean(resume.isDefault),
      }).catch(() => {});
    }
  }
}

export function deleteAndSyncResume(id: number): void {
  const db = getDb();
  const res = db.exec('SELECT name FROM resumes WHERE id = ?', [id]);
  const name = res.length && res[0].values.length ? String(res[0].values[0][0]) : '';
  db.run('DELETE FROM resumes WHERE id = ?', [id]);
  persistDb();

  const active = getActiveSyncSession();
  if (name && active) {
    const supabase = getAnonSupabase();
    if (supabase) {
      syncDeleteResume(
        supabase,
        active.userId,
        active.sessionToken,
        active.deviceFingerprint,
        name
      ).catch(() => {});
    }
  }
}

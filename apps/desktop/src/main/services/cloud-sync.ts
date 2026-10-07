import {
  syncPullUserData,
  syncPushSavedJob,
  syncRemoveSavedJob,
  syncPushResume,
  syncDeleteResume,
  syncHideJob,
  syncPullHiddenJobs,
  syncSetApplicationFollowUp,
} from '@job-automator/supabase';
import { mergeCloudHiddenJobs } from './hidden-jobs.js';
import { getDb, persistDb } from '../db.js';
import { log } from './app-context.js';
import { getActiveSyncSession } from './session.js';
import { getAnonSupabase } from './supabase.js';
import { upsertMasterProfile } from './profile.js';
import { readSecret } from './secrets.js';
import { followUpsToPush, mergeCloudApplications } from './applications-store.js';
import { syncLearning } from './learning.js';
import { reconcileSavedJobs } from './saved-jobs-sync.js';

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
        notice_period: p.notice_period ?? null,
        // Secrets never come from the cloud: keep whatever this computer has (they are not uploaded either).
        groq_api_key: readSecret('groq_api_key', db),
        smtp_password: readSecret('smtp_password', db),
        resume_text: p.resume_text ?? null,
        custom_answers_json: customAnswersStr,
        onboarding_completed: onboardingInt,
        desired_title: p.desired_title ?? null,
        tech_stack: p.tech_stack ?? null,
      });
    }

    // 2. Sync Applications (merge by apply URL; newer side wins, history unioned)
    let followUpBackfill: Array<{ applyUrl: string; followUpAt: string }> = [];
    if (Array.isArray(applications)) {
      mergeCloudApplications(db, applications, new Date().toISOString());
      followUpBackfill = followUpsToPush(db, applications);
    }

    let savedBackfill: string[] = [];
    // 3. Sync Saved Jobs (both ways: the phone app saves to the same account)
    if (Array.isArray(savedJobs)) {
      const cloudUrls = new Set(savedJobs.map((j) => String(j.apply_url ?? '')).filter(Boolean));
      const localRes = db.exec('SELECT apply_url, synced_at FROM saved_jobs');
      const localRows = (localRes[0]?.values ?? []).map((v) => ({ apply_url: String(v[0]), synced_at: v[1] }));
      const { remove, upload } = reconcileSavedJobs(localRows, cloudUrls);
      for (const url of remove) db.run('DELETE FROM saved_jobs WHERE apply_url = ?', [url]);
      savedBackfill = upload;
      for (const job of savedJobs) {
        if (!job.apply_url || !job.company || !job.title) continue;
        db.run(
          `INSERT INTO saved_jobs (title, company, apply_url, location, salary, source, score, description, saved_at, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(apply_url) DO UPDATE SET
             title=excluded.title, company=excluded.company, location=excluded.location, salary=excluded.salary,
             source=excluded.source, score=excluded.score, description=excluded.description, synced_at=excluded.synced_at`,
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

    // 5. Hidden jobs (026): union with the account, then upload the ones only this computer has.
    const hidden = await syncPullHiddenJobs(supabase, userId, sessionToken, deviceFingerprint);
    const hiddenBackfill = hidden.ok && hidden.jobs ? mergeCloudHiddenJobs(db, hidden.jobs) : [];
    if (!hidden.ok) log(`[Cloud Sync] Hidden jobs not pulled: ${hidden.error ?? 'unknown error'}`);

    persistDb();
    // Uploads use this pull's credentials: the sync session may not be marked active yet.
    for (const job of hiddenBackfill) {
      syncHideJob(supabase, userId, sessionToken, deviceFingerprint, { apply_url: job.applyUrl, title: job.title, company: job.company })
        .then((res) => { if (!res.ok) log(`[Cloud Sync] Hidden job not synced: ${res.error ?? 'unknown error'}`); })
        .catch(() => {});
    }
    for (const url of savedBackfill) {
      const r = db.exec('SELECT title, company, apply_url, location, salary, source, score, description FROM saved_jobs WHERE apply_url = ?', [url]);
      const v = r[0]?.values[0];
      if (!v) continue;
      const job = {
        title: String(v[0] ?? ''), company: String(v[1] ?? ''), apply_url: String(v[2]),
        location: v[3] ? String(v[3]) : undefined, salary: v[4] ? String(v[4]) : undefined,
        source: v[5] ? String(v[5]) : undefined, score: v[6] ? Number(v[6]) : undefined, description: v[7] ? String(v[7]) : undefined,
      };
      pushSavedJob(userId, sessionToken, deviceFingerprint, job);
    }
    for (const f of followUpBackfill) {
      syncSetApplicationFollowUp(supabase, userId, sessionToken, deviceFingerprint, f.applyUrl, f.followUpAt)
        .then((res) => { if (!res.ok) log(`[Cloud Sync] Follow-up not synced: ${res.error ?? 'unknown error'}`); })
        .catch(() => {});
    }
    // Learn progress (goal + events) syncs through its own session-checked RPCs.
    void syncLearning().catch(() => {});
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
       source=excluded.source, score=excluded.score, description=excluded.description, synced_at=NULL`,
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
  if (active) pushSavedJob(active.userId, active.sessionToken, active.deviceFingerprint, job);
}

/** Uploads a saved job and records that it reached the account (see saved-jobs-sync.ts). */
function pushSavedJob(
  userId: string,
  sessionToken: string,
  deviceFingerprint: string,
  job: { title: string; company: string; apply_url: string; location?: string; salary?: string; source?: string; score?: number; description?: string }
): void {
  const supabase = getAnonSupabase();
  if (!supabase) return;
  syncPushSavedJob(supabase, userId, sessionToken, deviceFingerprint, job)
    .then((res) => {
      if (!res.ok) {
        log(`[Cloud Sync] Saved job not synced: ${res.error ?? 'unknown error'}`);
        return;
      }
      try {
        getDb().run("UPDATE saved_jobs SET synced_at = datetime('now') WHERE apply_url = ?", [job.apply_url]);
        persistDb();
      } catch {
        /* the row was removed meanwhile */
      }
    })
    .catch(() => {});
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

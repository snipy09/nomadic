import type { Database } from 'sql.js';
import { migrateApplicationsSchema, migrateFollowUpSchema } from '../services/applications-store.js';
import { migratePracticeSchema } from '../services/practice-store.js';
import { migrateLearnV2Schema, migrateLearningSchema } from '../services/learning-store.js';
import { migrateHiddenJobsSchema } from '../services/hidden-jobs.js';
import { migrateFormAnswersStore } from '../services/form-answers.js';
import { migrateLocalMetaSchema } from '../services/local-owner.js';
import { migrateOutreachSchema } from '../services/outreach-store.js';
import { migrateSavedJobsSyncSchema } from '../services/saved-jobs-sync.js';
import type { LocalMigration } from './migrations.js';

/**
 * The local SQLite schema: baseline plus the ordered migrations. Pure (no file access), so the
 * desktop (file storage, db.ts) and the Android app (IndexedDB storage) open the same schema.
 */

/**
 * Local migration 1: the schema as it stood before versioned migrations. Every
 * statement is idempotent (IF NOT EXISTS / guarded ALTER), so databases created
 * by earlier builds pass through it unchanged.
 */
export function createBaselineSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS master_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      first_name TEXT,
      last_name TEXT,
      email TEXT,
      phone TEXT,
      linkedin TEXT,
      github TEXT,
      sponsorship TEXT,
      desired_salary TEXT,
      notice_period TEXT,
      groq_api_key TEXT,
      gemini_api_key TEXT,
      smtp_password TEXT,
      resume_text TEXT,
      custom_answers_json TEXT,
      onboarding_completed INTEGER DEFAULT 0,
      desired_title TEXT,
      tech_stack TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS local_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL,
      title TEXT NOT NULL,
      apply_url TEXT NOT NULL,
      status TEXT DEFAULT 'applied',
      mode TEXT CHECK (mode IN ('semi-auto', 'autonomous', 'outreach', 'manual')),
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS outreach_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_email TEXT NOT NULL UNIQUE,
      contact_name TEXT,
      company TEXT,
      verification_status TEXT CHECK (verification_status IN ('valid', 'invalid', 'pending', 'catch-all', 'risky')),
      sent_status TEXT DEFAULT 'unsent',
      sent_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS saved_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      apply_url TEXT NOT NULL UNIQUE,
      location TEXT,
      salary TEXT,
      source TEXT,
      score INTEGER,
      description TEXT,
      saved_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS resumes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      target_role TEXT,
      file_path TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_cache (
      email         TEXT PRIMARY KEY,
      supabase_id   TEXT,
      password_hash TEXT NOT NULL,
      full_name     TEXT,
      role          TEXT DEFAULT 'user',
      tier          TEXT DEFAULT 'pro',
      license_key   TEXT,
      status        TEXT DEFAULT 'active',
      apps_count    INTEGER DEFAULT 0,
      created_at    TEXT,
      expires_at    TEXT,
      last_login    TEXT,
      cached_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    );


    CREATE TABLE IF NOT EXISTS cached_form_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_key TEXT NOT NULL UNIQUE,
      answer_text  TEXT NOT NULL,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS curated_learning_resources (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      title        TEXT NOT NULL,
      youtube_url  TEXT NOT NULL,
      topic        TEXT NOT NULL,
      target_role  TEXT NOT NULL,
      summary      TEXT,
      duration     TEXT DEFAULT '20 mins',
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_activity_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_type TEXT NOT NULL,
      details       TEXT,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );


    -- OS-keychain (Electron safeStorage) encrypted secrets, base64 encoded.
    -- See services/secrets.ts; replaces plaintext master_profile key columns.
    CREATE TABLE IF NOT EXISTS secure_secrets (
      name       TEXT PRIMARY KEY,
      cipher     TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrate existing databases safely
  try { db.run(`ALTER TABLE master_profile ADD COLUMN gemini_api_key TEXT`); } catch {}
  try { db.run(`ALTER TABLE master_profile ADD COLUMN smtp_password TEXT`); } catch {}
  try { db.run(`ALTER TABLE master_profile ADD COLUMN onboarding_completed INTEGER DEFAULT 0`); } catch {}
  try { db.run(`ALTER TABLE master_profile ADD COLUMN desired_title TEXT`); } catch {}
  try { db.run(`ALTER TABLE master_profile ADD COLUMN tech_stack TEXT`); } catch {}
  
  try {
    db.run(`CREATE TABLE IF NOT EXISTS user_activity_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_type TEXT NOT NULL,
      details       TEXT,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  } catch {}

  // Legacy Learn tables (replaced by learning_events / learning_goal; no data to migrate).
  try { db.run('DROP TABLE IF EXISTS custom_roadmaps; DROP TABLE IF EXISTS learner_progress;'); } catch {}

  try {
    migrateLearningSchema(db);
  } catch (err: any) {
    console.warn('[SQLite] Learning migration failed:', err.message);
  }

  try {
    db.run(`CREATE TABLE IF NOT EXISTS curated_learning_resources (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      title        TEXT NOT NULL,
      youtube_url  TEXT NOT NULL,
      topic        TEXT NOT NULL,
      target_role  TEXT NOT NULL,
      summary      TEXT,
      duration     TEXT DEFAULT '20 mins',
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    // Seed initial resources if empty
    const checkRes = db.exec('SELECT COUNT(*) FROM curated_learning_resources');
    if (!checkRes.length || !Number(checkRes[0].values[0][0])) {
      db.run(`
        INSERT INTO curated_learning_resources (title, youtube_url, topic, target_role, summary, duration) VALUES
        ('Next.js 14 Full Stack Architecture & Server Components', 'https://www.youtube.com/watch?v=wm5gMKuwSYk', 'React & Next.js', 'Frontend Engineer, Full Stack Developer', 'Deep dive into React Server Components, streaming SSR, App Router architecture, and edge caching.', '35 mins'),
        ('System Design Interview: Distributed Cache & Redis Sharding', 'https://www.youtube.com/watch?v=iuqZvajTOyA', 'System Design & Scalability', 'Backend Engineer, Full Stack Developer, Systems Architect', 'LRU eviction algorithms, cache-aside patterns, write-through vs write-back, and cluster failover mechanisms.', '45 mins'),
        ('Node.js Event Loop, Worker Threads & Concurrency In-Depth', 'https://www.youtube.com/watch?v=8aGhZQkoFbQ', 'Node.js & Backend Architecture', 'Backend Developer, Node.js Engineer, Full Stack', 'Microtask queues, libuv thread pool architecture, non-blocking asynchronous I/O, and CPU profiling.', '28 mins'),
        ('Docker & Production Kubernetes Deployment Pipelines', 'https://www.youtube.com/watch?v=X48VuDVv0do', 'DevOps & Cloud Infrastructure', 'DevOps Engineer, Platform Engineer, Cloud Architect', 'Multi-stage container optimization, zero-downtime rolling deploys, Helm templates, and ingress networking.', '40 mins'),
        ('PostgreSQL Performance Tuning & Indexing Optimization', 'https://www.youtube.com/watch?v=clqv_X5q8QY', 'Databases & Performance', 'Backend Engineer, Database Engineer, Data Platform', 'B-tree vs GIN indexes, EXPLAIN ANALYZE query plans, partition pruning, and WAL vacuum optimization.', '30 mins');
      `);
    }
  } catch {}
}

/** Ordered local migrations. Append new ones; never edit or renumber a shipped one. */
export const LOCAL_MIGRATIONS: readonly LocalMigration[] = [
  { version: 1, name: 'baseline schema', up: createBaselineSchema },
  { version: 2, name: 'applications tracker history and notes', up: migrateApplicationsSchema },
  { version: 3, name: 'practice attempts cache', up: migratePracticeSchema },
  { version: 4, name: 'learning goal and events', up: migrateLearningSchema },
  { version: 5, name: 'hidden jobs', up: migrateHiddenJobsSchema },
  { version: 6, name: 'application follow-up dates', up: migrateFollowUpSchema },
  { version: 7, name: 'remembered form answers reset', up: migrateFormAnswersStore },
  { version: 8, name: 'local data owner', up: migrateLocalMetaSchema },
  { version: 9, name: 'learn v2 events and state documents', up: migrateLearnV2Schema },
  { version: 10, name: 'outreach people and messages', up: migrateOutreachSchema },
  { version: 11, name: 'saved jobs upload marker (desktop + phone sync)', up: migrateSavedJobsSyncSchema },
];

import initSqlJs, { Database } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { migrateApplicationsSchema } from './services/applications-store.js';
import { migratePracticeSchema } from './services/practice-store.js';
import { migrateLearningSchema } from './services/learning-store.js';

let db: Database | null = null;
let dbFilePath = '';

export async function initLocalDatabase(userDataPath: string): Promise<Database> {
  // Ensure directory exists
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  dbFilePath = path.join(userDataPath, 'job_automator_local.db');

  let wasmBinary: Buffer | undefined;
  const locateWasm = (file: string) => {
    const appDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
    const resourcesDir = process.resourcesPath || '';

    const candidates = [
      path.join(appDir, file),
      path.join(appDir, 'sql-wasm.wasm'),
      path.join(appDir, '../main/sql-wasm.wasm'),
      path.join(resourcesDir, file),
      path.join(resourcesDir, 'sql-wasm.wasm'),
      path.join(resourcesDir, 'app.asar/out/main/sql-wasm.wasm'),
      path.join(resourcesDir, 'out/main/sql-wasm.wasm'),
      path.join(process.cwd(), 'out/main', file),
      path.join(process.cwd(), 'apps/desktop/out/main', file),
      path.join(process.cwd(), 'node_modules/sql.js/dist', file),
    ];
    for (const c of candidates) {
      if (c && fs.existsSync(c)) {
        try {
          if (!wasmBinary) wasmBinary = fs.readFileSync(c);
          return c;
        } catch {}
      }
    }
    return file;
  };

  const wasmPath = locateWasm('sql-wasm.wasm');
  const sqlOptions: any = { locateFile: () => wasmPath };
  if (wasmBinary) {
    sqlOptions.wasmBinary = wasmBinary;
  }

  const SQL = await initSqlJs(sqlOptions);

  // Load existing DB file if present, otherwise create fresh
  if (fs.existsSync(dbFilePath)) {
    try {
      const fileBuffer = fs.readFileSync(dbFilePath);
      db = new SQL.Database(fileBuffer);
    } catch (err: any) {
      console.warn('[SQLite] Existing DB file unreadable, creating fresh:', err.message);
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }

  // Initialize schema
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

  // Applications tracker: notes, unique apply_url, append-only status history.
  try {
    migrateApplicationsSchema(db);
  } catch (err: any) {
    console.warn('[SQLite] Applications migration failed:', err.message);
  }

  // Practice attempts cache (F8): rows the server accepted.
  try {
    migratePracticeSchema(db);
  } catch (err: any) {
    console.warn('[SQLite] Practice migration failed:', err.message);
  }

  // Ensure default master profile row exists
  try {
    const profCheck = db.exec('SELECT COUNT(*) as count FROM master_profile WHERE id = 1');
    const profCount = profCheck.length && profCheck[0].values.length ? Number(profCheck[0].values[0][0]) : 0;
    if (profCount === 0) {
      db.run(
        `INSERT OR IGNORE INTO master_profile (id, first_name, last_name, email, phone, desired_title, tech_stack, sponsorship, onboarding_completed)
         VALUES (1, '', '', '', '', '', '', 'No', 0)`
      );
    }
  } catch (err: any) {
    console.warn('[SQLite] Error initializing master profile:', err.message);
  }

  persistDb();
  console.log('[SQLite (sql.js)] Initialized local database at', dbFilePath);
  return db;
}

/** Flush in-memory DB to disk. Call after every write. */
export function persistDb(): void {
  if (!db || !dbFilePath) return;
  try {
    const dir = path.dirname(dbFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data = db.export();
    fs.writeFileSync(dbFilePath, Buffer.from(data));
  } catch (err: any) {
    console.error('[SQLite] Failed to persist DB to disk:', err.message);
  }
}

export function getDb(): Database {
  if (!db) throw new Error('Database not initialized! Call initLocalDatabase first.');
  return db;
}

// ── Activity Logging ──────────────────────────────────────────────
export function logUserActivityDb(activityType: string, details?: string): void {
  try {
    const database = getDb();
    database.run(
      'INSERT INTO user_activity_log (activity_type, details, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [activityType, details || null]
    );
    persistDb();
  } catch (err: any) {
    console.warn('[Activity DB] Failed to log activity:', err?.message);
  }
}

export function getCachedFormAnswerDb(questionText: string): string | null {
  try {
    const database = getDb();
    const cleanKey = questionText.toLowerCase().trim().replace(/[^a-z0-9]/g, ' ').slice(0, 100);
    const res = database.exec('SELECT answer_text FROM cached_form_answers WHERE question_key = ? LIMIT 1', [cleanKey]);
    if (res.length && res[0].values.length) {
      return String(res[0].values[0][0]);
    }
  } catch {}
  return null;
}

export function saveCachedFormAnswerDb(questionText: string, answerText: string): void {
  try {
    const database = getDb();
    const cleanKey = questionText.toLowerCase().trim().replace(/[^a-z0-9]/g, ' ').slice(0, 100);
    database.run(`
      INSERT INTO cached_form_answers (question_key, answer_text)
      VALUES (?, ?)
      ON CONFLICT(question_key) DO UPDATE SET answer_text = excluded.answer_text
    `, [cleanKey, answerText]);
    persistDb();
  } catch {}
}

export function getCuratedLearningResourcesDb(): Array<{
  id: number;
  title: string;
  youtubeUrl: string;
  topic: string;
  targetRole: string;
  summary: string;
  duration: string;
  createdAt: string;
}> {
  try {
    const database = getDb();
    const res = database.exec('SELECT id, title, youtube_url, topic, target_role, summary, duration, created_at FROM curated_learning_resources ORDER BY id DESC');
    if (!res.length || !res[0].values.length) return [];
    return res[0].values.map(v => ({
      id: Number(v[0]),
      title: String(v[1]),
      youtubeUrl: String(v[2]),
      topic: String(v[3]),
      targetRole: String(v[4]),
      summary: String(v[5] || ''),
      duration: String(v[6] || '20 mins'),
      createdAt: String(v[7] || ''),
    }));
  } catch {
    return [];
  }
}


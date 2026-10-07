import { createHash, randomUUID } from 'crypto';
import type { Database } from 'sql.js';
import type {
  OutreachChannel,
  OutreachContactKind,
  OutreachMessage,
  OutreachMessageInput,
  OutreachMessageStatus,
  OutreachPerson,
  OutreachPersonInput,
  OutreachPurpose,
  OutreachSentVia,
} from '../../shared/ipc.js';
import { findPlaceholders, LINKEDIN_NOTE_LIMIT } from '../../shared/outreachText.js';

/**
 * Local outreach data: the people a user wants to reach and the messages written to
 * them. Pure functions over a sql.js database so they are tested without Electron.
 * Nothing here sends anything; review gating lives in `reviewMessage` / `assertSendable`.
 */

/** Emails sent through the user's own SMTP account per local day, and the minimum gap. */
export const OUTREACH_SEND_LIMIT = 20;
export const OUTREACH_SEND_GAP_MS = 60_000;

/** Local migration 9. The old `outreach_contacts` table is left alone (no data to move). */
export function migrateOutreachSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS outreach_people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT,
      linkedin_url TEXT,
      company TEXT NOT NULL,
      role_title TEXT,
      kind TEXT NOT NULL DEFAULT 'unknown',
      contact_id TEXT,
      source_url TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS outreach_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid TEXT NOT NULL UNIQUE,
      person_id INTEGER NOT NULL,
      channel TEXT NOT NULL,
      purpose TEXT NOT NULL,
      job_title TEXT,
      job_url TEXT,
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      review_hash TEXT,
      reviewed_at TEXT,
      sent_at TEXT,
      sent_via TEXT,
      application_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_outreach_messages_person ON outreach_messages (person_id)`);
  db.run(`CREATE TABLE IF NOT EXISTS local_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
}

type Row = Record<string, unknown>;

function rows(db: Database, sql: string, params: (string | number | null)[] = []): Row[] {
  const res = db.exec(sql, params);
  if (!res.length) return [];
  const { columns, values } = res[0];
  return values.map((v) => Object.fromEntries(columns.map((c, i) => [c, v[i]])));
}

const s = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const n = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function toPerson(r: Row): OutreachPerson {
  return {
    id: Number(r.id),
    name: s(r.name),
    email: s(r.email),
    linkedinUrl: s(r.linkedin_url),
    company: String(r.company ?? ''),
    roleTitle: s(r.role_title),
    kind: String(r.kind ?? 'unknown') as OutreachContactKind,
    contactId: s(r.contact_id),
    sourceUrl: s(r.source_url),
    notes: s(r.notes),
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? ''),
  };
}

function toMessage(r: Row): OutreachMessage {
  return {
    id: Number(r.id),
    personId: Number(r.person_id),
    channel: String(r.channel) as OutreachChannel,
    purpose: String(r.purpose) as OutreachPurpose,
    jobTitle: s(r.job_title),
    jobUrl: s(r.job_url),
    subject: String(r.subject ?? ''),
    body: String(r.body ?? ''),
    status: String(r.status ?? 'draft') as OutreachMessageStatus,
    reviewedAt: s(r.reviewed_at),
    sentAt: s(r.sent_at),
    sentVia: s(r.sent_via) as OutreachSentVia | null,
    applicationId: n(r.application_id),
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? ''),
  };
}

export function listPeople(db: Database): OutreachPerson[] {
  return rows(db, 'SELECT * FROM outreach_people ORDER BY updated_at DESC, id DESC').map(toPerson);
}

export function getPerson(db: Database, id: number): OutreachPerson | null {
  const r = rows(db, 'SELECT * FROM outreach_people WHERE id = ?', [id]);
  return r.length ? toPerson(r[0]) : null;
}

export function listMessages(db: Database): OutreachMessage[] {
  return rows(db, 'SELECT * FROM outreach_messages ORDER BY updated_at DESC, id DESC').map(toMessage);
}

export function getMessage(db: Database, id: number): OutreachMessage | null {
  const r = rows(db, 'SELECT * FROM outreach_messages WHERE id = ?', [id]);
  return r.length ? toMessage(r[0]) : null;
}

function messageMeta(db: Database, id: number): { uid: string; reviewHash: string | null } | null {
  const r = rows(db, 'SELECT uid, review_hash FROM outreach_messages WHERE id = ?', [id]);
  return r.length ? { uid: String(r[0].uid), reviewHash: s(r[0].review_hash) } : null;
}

const clean = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

/** Insert or update a person. A directory contact already saved is updated, not duplicated. */
export function savePerson(db: Database, input: OutreachPersonInput, now: string): OutreachPerson {
  let id = input.id ?? null;
  if (id == null && input.contactId) {
    const existing = rows(db, 'SELECT id FROM outreach_people WHERE contact_id = ?', [input.contactId]);
    if (existing.length) id = Number(existing[0].id);
  }
  const values = [
    clean(input.name),
    clean(input.email)?.toLowerCase() ?? null,
    clean(input.linkedinUrl),
    input.company.trim(),
    clean(input.roleTitle),
    input.kind,
    input.contactId ?? null,
    clean(input.sourceUrl),
    clean(input.notes),
  ];
  if (id != null && getPerson(db, id)) {
    db.run(
      `UPDATE outreach_people SET name = ?, email = ?, linkedin_url = ?, company = ?, role_title = ?, kind = ?,
         contact_id = COALESCE(?, contact_id), source_url = COALESCE(?, source_url), notes = ?, updated_at = ? WHERE id = ?`,
      [...values, now, id]
    );
    return getPerson(db, id)!;
  }
  db.run(
    `INSERT INTO outreach_people (name, email, linkedin_url, company, role_title, kind, contact_id, source_url, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [...values, now, now]
  );
  const newId = Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0]);
  return getPerson(db, newId)!;
}

/** Deletes the person and every message written to them. */
export function deletePerson(db: Database, id: number): boolean {
  if (!getPerson(db, id)) return false;
  db.run('DELETE FROM outreach_messages WHERE person_id = ?', [id]);
  db.run('DELETE FROM outreach_people WHERE id = ?', [id]);
  return true;
}

/**
 * Insert or update a message. Any edit puts it back to `draft` and clears the review, so
 * what is sent is always exactly what the user last ticked. Sent messages are not edited.
 */
export function saveMessage(db: Database, input: OutreachMessageInput, now: string): OutreachMessage | { error: 'not_found' | 'already_sent' } {
  if (!getPerson(db, input.personId)) return { error: 'not_found' };
  const subject = input.channel === 'linkedin' ? '' : input.subject;
  const values = [input.personId, input.channel, input.purpose, clean(input.jobTitle), clean(input.jobUrl), subject, input.body];
  if (input.id != null) {
    const existing = getMessage(db, input.id);
    if (!existing) return { error: 'not_found' };
    if (existing.sentAt) return { error: 'already_sent' };
    db.run(
      `UPDATE outreach_messages SET person_id = ?, channel = ?, purpose = ?, job_title = ?, job_url = ?, subject = ?, body = ?,
         status = 'draft', review_hash = NULL, reviewed_at = NULL, updated_at = ? WHERE id = ?`,
      [...values, now, input.id]
    );
    return getMessage(db, input.id)!;
  }
  db.run(
    `INSERT INTO outreach_messages (uid, person_id, channel, purpose, job_title, job_url, subject, body, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
    [randomUUID(), ...values, now, now]
  );
  const newId = Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0]);
  return getMessage(db, newId)!;
}

export function deleteMessage(db: Database, id: number): boolean {
  if (!getMessage(db, id)) return false;
  db.run('DELETE FROM outreach_messages WHERE id = ?', [id]);
  return true;
}

export { findPlaceholders };

/** The fingerprint of what the user reviewed: recipient address, subject and body. */
export function reviewHash(to: string, subject: string, body: string): string {
  return createHash('sha256').update(`${to}\u0000${subject}\u0000${body}`).digest('hex');
}

function recipientKey(person: OutreachPerson, channel: OutreachChannel): string {
  return channel === 'email' ? (person.email ?? '') : (person.linkedinUrl ?? '');
}

export type ReviewOutcome =
  | { ok: true; message: OutreachMessage }
  | { ok: false; code: 'not_found' | 'placeholders' | 'bad_request'; error: string };

/** The user's "I reviewed this" tick. Refuses empty or unfinished text. */
export function reviewMessage(db: Database, id: number, now: string): ReviewOutcome {
  const msg = getMessage(db, id);
  const person = msg ? getPerson(db, msg.personId) : null;
  if (!msg || !person) return { ok: false, code: 'not_found', error: 'That message no longer exists.' };
  if (msg.sentAt) return { ok: false, code: 'bad_request', error: 'This message was already sent.' };
  if (!msg.body.trim()) return { ok: false, code: 'bad_request', error: 'Write the message first.' };
  if (msg.channel === 'email') {
    if (!msg.subject.trim()) return { ok: false, code: 'bad_request', error: 'Add a subject line.' };
    if (!person.email) return { ok: false, code: 'bad_request', error: `Add an email address for ${person.name ?? 'this person'} first.` };
  } else if (msg.body.length > LINKEDIN_NOTE_LIMIT) {
    return { ok: false, code: 'bad_request', error: 'LinkedIn connection notes can be at most 300 characters.' };
  }
  const gaps = findPlaceholders(`${msg.subject}\n${msg.body}`);
  if (gaps.length) return { ok: false, code: 'placeholders', error: `Fill in or remove: ${gaps.slice(0, 3).join(', ')}` };
  db.run(`UPDATE outreach_messages SET status = 'ready', review_hash = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`, [
    reviewHash(recipientKey(person, msg.channel), msg.subject, msg.body),
    now,
    now,
    id,
  ]);
  return { ok: true, message: getMessage(db, id)! };
}

export type SendCheck =
  | { ok: true; message: OutreachMessage; person: OutreachPerson; uid: string }
  | { ok: false; code: 'not_found' | 'not_reviewed'; error: string };

/** A message may leave the computer only while it is `ready` and unchanged since review. */
export function assertSendable(db: Database, id: number): SendCheck {
  const msg = getMessage(db, id);
  const person = msg ? getPerson(db, msg.personId) : null;
  const meta = msg ? messageMeta(db, id) : null;
  if (!msg || !person || !meta) return { ok: false, code: 'not_found', error: 'That message no longer exists.' };
  if (msg.status !== 'ready' || !meta.reviewHash) {
    return { ok: false, code: 'not_reviewed', error: 'Tick "I reviewed this" before sending.' };
  }
  if (meta.reviewHash !== reviewHash(recipientKey(person, msg.channel), msg.subject, msg.body)) {
    return { ok: false, code: 'not_reviewed', error: 'The message or address changed after review. Review it again.' };
  }
  return { ok: true, message: msg, person, uid: meta.uid };
}

/** Records how the message left (or that the user says they sent it). */
export function markSent(db: Database, id: number, via: OutreachSentVia, now: string, applicationId: number | null): OutreachMessage | null {
  if (!getMessage(db, id)) return null;
  db.run(
    `UPDATE outreach_messages SET status = 'sent', sent_at = COALESCE(sent_at, ?), sent_via = COALESCE(sent_via, ?),
       application_id = COALESCE(?, application_id), updated_at = ? WHERE id = ?`,
    [now, via, applicationId, now, id]
  );
  return getMessage(db, id);
}

export function setStatus(db: Database, id: number, status: 'replied' | 'no_reply' | 'bounced', now: string): OutreachMessage | null {
  const msg = getMessage(db, id);
  if (!msg) return null;
  db.run(`UPDATE outreach_messages SET status = ?, updated_at = ? WHERE id = ?`, [status, now, id]);
  return getMessage(db, id);
}

export function messageUid(db: Database, id: number): string | null {
  return messageMeta(db, id)?.uid ?? null;
}

/** Local day as YYYY-MM-DD for the given time. */
export function localDay(d: Date): string {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** SMTP sends today (local day) and the time of the last one. */
export function smtpSendStats(db: Database, now: Date): { sentToday: number; lastSentAt: number | null } {
  const r = rows(db, `SELECT sent_at FROM outreach_messages WHERE sent_via = 'smtp' AND sent_at IS NOT NULL`);
  const today = localDay(now);
  let sentToday = 0;
  let last: number | null = null;
  for (const row of r) {
    const t = Date.parse(String(row.sent_at));
    if (Number.isNaN(t)) continue;
    if (localDay(new Date(t)) === today) sentToday++;
    if (last === null || t > last) last = t;
  }
  return { sentToday, lastSentAt: last };
}

// ── SMTP settings (no secret here; the password lives in the secrets store) ──

const SMTP_META_KEY = 'outreach_smtp';

export interface StoredSmtp {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  fromName: string;
}

export function readSmtpSettings(db: Database): StoredSmtp | null {
  const r = rows(db, 'SELECT value FROM local_meta WHERE key = ?', [SMTP_META_KEY]);
  if (!r.length) return null;
  try {
    const v = JSON.parse(String(r[0].value)) as Partial<StoredSmtp>;
    if (typeof v.host !== 'string' || typeof v.user !== 'string' || typeof v.port !== 'number') return null;
    return { host: v.host, port: v.port, secure: v.secure === true, user: v.user, fromName: typeof v.fromName === 'string' ? v.fromName : '' };
  } catch {
    return null;
  }
}

export function writeSmtpSettings(db: Database, v: StoredSmtp | null): void {
  if (!v) {
    db.run('DELETE FROM local_meta WHERE key = ?', [SMTP_META_KEY]);
    return;
  }
  db.run(`INSERT INTO local_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [SMTP_META_KEY, JSON.stringify(v)]);
}

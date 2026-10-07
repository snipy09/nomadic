import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';
import {
  assertSendable, deletePerson, findPlaceholders, getMessage, listMessages, listPeople, markSent, migrateOutreachSchema,
  readSmtpSettings, reviewMessage, saveMessage, savePerson, setStatus, smtpSendStats, writeSmtpSettings,
} from '../services/outreach-store';
import type { OutreachMessage } from '../../shared/ipc';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: Database;
beforeAll(async () => { SQL = await initSqlJs(); });
beforeEach(() => {
  db = new SQL.Database();
  migrateOutreachSchema(db);
});

const NOW = '2026-10-05T10:00:00.000Z';

function person(extra: Record<string, unknown> = {}) {
  return savePerson(db, { name: 'Priya Shah', email: 'Priya@Example.com', company: 'Acme', kind: 'hiring_manager', ...extra }, NOW);
}

function message(personId: number, extra: Record<string, unknown> = {}): OutreachMessage {
  const m = saveMessage(db, { personId, channel: 'email', purpose: 'referral', subject: 'Referral for SDE', body: 'Hi Priya, could you refer me?', ...extra }, NOW);
  if ('error' in m) throw new Error(m.error);
  return m;
}

describe('people', () => {
  it('stores emails lowercased and does not duplicate a saved directory contact', () => {
    const a = person({ contactId: '6f1c3b0e-8a3d-4b55-9b1e-2f0e1d2c3b4a' });
    expect(a.email).toBe('priya@example.com');
    const b = person({ contactId: '6f1c3b0e-8a3d-4b55-9b1e-2f0e1d2c3b4a', roleTitle: 'EM' });
    expect(b.id).toBe(a.id);
    expect(listPeople(db)).toHaveLength(1);
    expect(listPeople(db)[0].roleTitle).toBe('EM');
  });

  it('deleting a person removes their messages', () => {
    const p = person();
    message(p.id);
    expect(deletePerson(db, p.id)).toBe(true);
    expect(listMessages(db)).toHaveLength(0);
  });
});

describe('review gate', () => {
  it('finds template gaps', () => {
    expect(findPlaceholders('Hi [Name], about {{company}} and <role>.')).toEqual(['[Name]', '{{company}}', '<role>']);
    expect(findPlaceholders('Plain text, 3 < 5 and a > b.')).toEqual([]);
  });

  it('refuses to review a message with gaps or without a subject', () => {
    const p = person();
    const gap = message(p.id, { body: 'Hi [Name]' });
    expect(reviewMessage(db, gap.id, NOW)).toMatchObject({ ok: false, code: 'placeholders' });
    const noSubject = message(p.id, { subject: '  ' });
    expect(reviewMessage(db, noSubject.id, NOW)).toMatchObject({ ok: false, code: 'bad_request' });
  });

  it('refuses a LinkedIn note above 300 characters', () => {
    const p = person({ linkedinUrl: 'https://www.linkedin.com/in/priya' });
    const m = message(p.id, { channel: 'linkedin', body: 'x'.repeat(301) });
    expect(m.subject).toBe('');
    expect(reviewMessage(db, m.id, NOW)).toMatchObject({ ok: false, code: 'bad_request' });
  });

  it('is sendable only after review and only while unchanged', () => {
    const p = person();
    const m = message(p.id);
    expect(assertSendable(db, m.id)).toMatchObject({ ok: false, code: 'not_reviewed' });
    expect(reviewMessage(db, m.id, NOW)).toMatchObject({ ok: true });
    expect(getMessage(db, m.id)?.status).toBe('ready');
    expect(assertSendable(db, m.id)).toMatchObject({ ok: true });

    // Editing puts it back to draft.
    message(p.id, { id: m.id, body: 'Edited body' });
    expect(getMessage(db, m.id)?.status).toBe('draft');
    expect(assertSendable(db, m.id)).toMatchObject({ ok: false, code: 'not_reviewed' });
  });

  it('a changed recipient address after review blocks sending', () => {
    const p = person();
    const m = message(p.id);
    reviewMessage(db, m.id, NOW);
    savePerson(db, { id: p.id, name: 'Priya Shah', email: 'other@example.com', company: 'Acme', kind: 'hiring_manager' }, NOW);
    expect(assertSendable(db, m.id)).toMatchObject({ ok: false, code: 'not_reviewed' });
  });

  it('sent messages cannot be edited and keep their first send time', () => {
    const p = person();
    const m = message(p.id);
    reviewMessage(db, m.id, NOW);
    markSent(db, m.id, 'smtp', NOW, 7);
    markSent(db, m.id, 'manual', '2026-10-06T10:00:00.000Z', null);
    const sent = getMessage(db, m.id)!;
    expect(sent).toMatchObject({ status: 'sent', sentVia: 'smtp', sentAt: NOW, applicationId: 7 });
    expect(saveMessage(db, { id: m.id, personId: p.id, channel: 'email', purpose: 'referral', subject: 's', body: 'b' }, NOW)).toEqual({ error: 'already_sent' });
    expect(setStatus(db, m.id, 'replied', NOW)?.status).toBe('replied');
  });
});

describe('send stats and SMTP settings', () => {
  it('counts SMTP sends on the local day only', () => {
    const p = person();
    const now = new Date(2026, 9, 5, 15, 0, 0);
    const a = message(p.id);
    const b = message(p.id);
    const c = message(p.id);
    markSent(db, a.id, 'smtp', new Date(2026, 9, 5, 9, 0, 0).toISOString(), null);
    markSent(db, b.id, 'smtp', new Date(2026, 9, 4, 9, 0, 0).toISOString(), null);
    markSent(db, c.id, 'gmail', new Date(2026, 9, 5, 10, 0, 0).toISOString(), null);
    const s = smtpSendStats(db, now);
    expect(s.sentToday).toBe(1);
    expect(s.lastSentAt).toBe(new Date(2026, 9, 5, 9, 0, 0).getTime());
  });

  it('round-trips settings without a password', () => {
    expect(readSmtpSettings(db)).toBeNull();
    writeSmtpSettings(db, { host: 'smtp.gmail.com', port: 587, secure: false, user: 'me@gmail.com', fromName: 'Me' });
    expect(readSmtpSettings(db)).toEqual({ host: 'smtp.gmail.com', port: 587, secure: false, user: 'me@gmail.com', fromName: 'Me' });
    expect(JSON.stringify(db.exec('SELECT value FROM local_meta'))).not.toMatch(/pass/i);
    writeSmtpSettings(db, null);
    expect(readSmtpSettings(db)).toBeNull();
  });
});

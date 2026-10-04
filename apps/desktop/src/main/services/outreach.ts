import { clipboard, shell } from 'electron';
import { z } from 'zod';
import { SmtpSender } from '@job-automator/email-verifier';
import type {
  DirectoryContact,
  OutreachContactQuery,
  OutreachContactsResult,
  OutreachDraftInput,
  OutreachDraftResult,
  OutreachErrorCode,
  OutreachMarkInput,
  OutreachMessage,
  OutreachMessageInput,
  OutreachMessageResult,
  OutreachOpenInput,
  OutreachPerson,
  OutreachPersonInput,
  OutreachReportInput,
  OutreachResult,
  OutreachSmtpInput,
  OutreachSmtpSettings,
  OutreachState,
} from '../../shared/ipc.js';
import { splitProfileExtras } from '../../shared/profileExtras.js';
import { getDb, persistDb } from '../db.js';
import { errorMessage, log } from './app-context.js';
import { aiErrorMessage, callAiProxy } from './ai-proxy.js';
import { logAndSyncApplication, updateApplicationFollowUp } from './applications.js';
import { getMasterProfileRow } from './profile.js';
import { readSecret, writeSecret } from './secrets.js';
import { getActiveSyncSession } from './session.js';
import { getAnonSupabase } from './supabase.js';
import {
  OUTREACH_SEND_GAP_MS,
  OUTREACH_SEND_LIMIT,
  assertSendable,
  deleteMessage,
  deletePerson,
  getMessage,
  getPerson,
  listMessages,
  listPeople,
  localDay,
  markSent,
  readSmtpSettings,
  reviewMessage,
  saveMessage,
  savePerson,
  setStatus,
  smtpSendStats,
  writeSmtpSettings,
} from './outreach-store.js';

/**
 * Outreach (F13, behind the `outreach` flag): reach people who can refer, from the
 * published directory (migration 027) or typed in by the user. Every message is written
 * or edited by the user and ticked "I reviewed this" before it is sent through the user's
 * own SMTP account or opened in Gmail / the mail app / LinkedIn. Nothing is sent in bulk,
 * nothing is guessed, and message text is never logged.
 */

const now = () => new Date().toISOString();
const fail = (code: OutreachErrorCode, error: string) => ({ success: false as const, code, error });

// ── Directory (server) ─────────────────────────────────────────────────────

const DIRECTORY_ERRORS: Record<string, { code: OutreachErrorCode; error: string }> = {
  unauthorized: { code: 'unauthorized', error: 'Your session has ended. Sign in again.' },
  account_suspended: { code: 'account_suspended', error: 'This account is suspended. Contact support.' },
  bad_request: { code: 'bad_request', error: 'That search was not valid.' },
  daily_limit: { code: 'daily_limit', error: 'You have looked through today\'s contact allowance. It resets at midnight IST.' },
};

const contactRow = z
  .object({
    id: z.string(),
    email: z.string(),
    name: z.string().nullish(),
    company: z.string(),
    company_domain: z.string().nullish(),
    role_title: z.string().nullish(),
    hiring_for: z.string().nullish(),
    contact_kind: z.string().nullish(),
    address_type: z.string().nullish(),
    source: z.string().nullish(),
    source_url: z.string().nullish(),
    source_snippet: z.string().nullish(),
    job_url: z.string().nullish(),
    location: z.string().nullish(),
    remote: z.boolean().nullish(),
    posted_at: z.string().nullish(),
    mx_ok: z.boolean().nullish(),
    last_seen_at: z.string().nullish(),
  })
  .passthrough();

const KINDS = new Set(['recruiter', 'hiring_manager', 'founder', 'employee', 'alumni', 'team_inbox', 'unknown']);

export function mapDirectoryContact(raw: unknown): DirectoryContact | null {
  const r = contactRow.safeParse(raw);
  if (!r.success) return null;
  const c = r.data;
  return {
    id: c.id,
    email: c.email,
    name: c.name ?? null,
    company: c.company,
    companyDomain: c.company_domain ?? null,
    roleTitle: c.role_title ?? null,
    hiringFor: c.hiring_for ?? null,
    kind: (c.contact_kind && KINDS.has(c.contact_kind) ? c.contact_kind : 'unknown') as DirectoryContact['kind'],
    addressType: c.address_type ?? null,
    source: c.source ?? 'unknown',
    sourceUrl: c.source_url ?? null,
    sourceSnippet: c.source_snippet ?? null,
    jobUrl: c.job_url ?? null,
    location: c.location ?? null,
    remote: c.remote ?? null,
    postedAt: c.posted_at ?? null,
    mxOk: c.mx_ok ?? null,
    lastSeenAt: c.last_seen_at ?? null,
  };
}

function firstRow(data: unknown): Record<string, unknown> | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === 'object' ? (row as Record<string, unknown>) : null;
}

export async function listDirectoryContacts(q: OutreachContactQuery): Promise<OutreachContactsResult> {
  const s = getActiveSyncSession();
  if (!s) return fail('not_signed_in', 'Sign in to look through contacts.');
  const supabase = getAnonSupabase();
  if (!supabase) return fail('network', 'Nomadic could not be reached. Try again.');
  try {
    const { data, error } = await supabase.rpc('outreach_list_contacts', {
      p_user_id: s.userId,
      p_session_token: s.sessionToken,
      p_device_fingerprint: s.deviceFingerprint,
      p_company: q.company?.trim() || null,
      p_query: q.query?.trim() || null,
      p_kinds: q.kinds?.length ? q.kinds : null,
      p_limit: Math.min(Math.max(q.limit ?? 25, 1), 50),
      p_offset: Math.max(q.offset ?? 0, 0),
    });
    if (error) {
      log(`[Outreach] Directory error: ${error.message}`);
      return fail('network', 'Could not load contacts. Try again.');
    }
    const row = firstRow(data);
    if (!row) return fail('network', 'Could not load contacts. Try again.');
    if (row.ok !== true) {
      const known = DIRECTORY_ERRORS[String(row.error ?? '')];
      return known ? fail(known.code, known.error) : fail('network', 'Could not load contacts. Try again.');
    }
    const contacts = (Array.isArray(row.contacts) ? row.contacts : []).map(mapDirectoryContact).filter((c): c is DirectoryContact => c !== null);
    return {
      success: true,
      contacts,
      total: typeof row.total === 'number' ? row.total : contacts.length,
      rowsLeftToday: typeof row.rows_left_today === 'number' ? row.rows_left_today : null,
    };
  } catch (err) {
    log(`[Outreach] Directory error: ${errorMessage(err)}`);
    return fail('network', 'Could not reach Nomadic. Check your connection and try again.');
  }
}

export async function reportDirectoryContact(input: OutreachReportInput): Promise<OutreachResult> {
  const s = getActiveSyncSession();
  if (!s) return fail('not_signed_in', 'Sign in to report a contact.');
  const supabase = getAnonSupabase();
  if (!supabase) return fail('network', 'Nomadic could not be reached. Try again.');
  try {
    const { data, error } = await supabase.rpc('outreach_report_contact', {
      p_user_id: s.userId,
      p_session_token: s.sessionToken,
      p_device_fingerprint: s.deviceFingerprint,
      p_contact_id: input.contactId,
      p_reason: input.reason,
      p_note: input.note?.trim() || null,
    });
    if (error) return fail('network', 'Could not send the report. Try again.');
    const row = firstRow(data);
    if (row?.ok === true) return { success: true };
    const known = DIRECTORY_ERRORS[String(row?.error ?? '')];
    if (String(row?.error) === 'not_found') return fail('not_found', 'That contact is no longer listed.');
    return known ? fail(known.code, known.error) : fail('network', 'Could not send the report. Try again.');
  } catch (err) {
    log(`[Outreach] Report error: ${errorMessage(err)}`);
    return fail('network', 'Could not reach Nomadic. Check your connection and try again.');
  }
}

// ── Local people and messages ──────────────────────────────────────────────

export function getOutreachState(): OutreachState {
  const db = getDb();
  return {
    people: listPeople(db),
    messages: listMessages(db),
    sentToday: smtpSendStats(db, new Date()).sentToday,
    sendLimit: OUTREACH_SEND_LIMIT,
  };
}

export function saveOutreachPerson(input: OutreachPersonInput): OutreachResult & { person?: OutreachPerson } {
  try {
    const person = savePerson(getDb(), input, now());
    persistDb();
    return { success: true, person };
  } catch (err) {
    log(`[Outreach] Save person error: ${errorMessage(err)}`);
    return fail('bad_request', 'Could not save this person.');
  }
}

export function deleteOutreachPerson(id: number): OutreachResult {
  if (!deletePerson(getDb(), id)) return fail('not_found', 'That person no longer exists.');
  persistDb();
  return { success: true };
}

export function saveOutreachMessage(input: OutreachMessageInput): OutreachMessageResult {
  const res = saveMessage(getDb(), input, now());
  if ('error' in res) {
    return res.error === 'already_sent' ? fail('bad_request', 'A sent message cannot be edited.') : fail('not_found', 'That person or message no longer exists.');
  }
  persistDb();
  return { success: true, message: res };
}

export function deleteOutreachMessage(id: number): OutreachResult {
  if (!deleteMessage(getDb(), id)) return fail('not_found', 'That message no longer exists.');
  persistDb();
  return { success: true };
}

export function reviewOutreachMessage(id: number): OutreachMessageResult {
  const res = reviewMessage(getDb(), id, now());
  if (!res.ok) return fail(res.code, res.error);
  persistDb();
  return { success: true, message: res.message };
}

/** Logs the sent message in the tracker (mode `outreach`) with a follow-up a week later. */
function recordInTracker(msg: OutreachMessage, person: OutreachPerson, uid: string): number | null {
  try {
    const id = logAndSyncApplication({
      company: person.company,
      title: msg.jobTitle || (msg.purpose === 'referral' ? 'Referral request' : 'Outreach'),
      apply_url: `outreach:${uid}`,
      status: 'applied',
      mode: 'outreach',
      notes: `Message to ${person.name ?? person.email ?? 'a contact'}${person.roleTitle ? ` (${person.roleTitle})` : ''} via ${msg.channel}.`,
    });
    const followUp = new Date(Date.now() + 7 * 86_400_000);
    updateApplicationFollowUp({ id, followUpAt: localDay(followUp) });
    return id;
  } catch (err) {
    log(`[Outreach] Tracker entry not saved: ${errorMessage(err)}`);
    return null;
  }
}

function smtpConfig(): { host: string; port: number; secure: boolean; user: string; fromName: string; pass: string } | null {
  const db = getDb();
  const settings = readSmtpSettings(db);
  const pass = readSecret('smtp_password', db);
  return settings && pass ? { ...settings, pass } : null;
}

function fromHeader(name: string, address: string): string {
  const clean = name.replace(/["\r\n<>]/g, '').trim();
  return clean ? `"${clean}" <${address}>` : address;
}

/** Sends one reviewed email through the user's own SMTP account. */
export async function sendOutreachMessage(id: number): Promise<OutreachMessageResult> {
  const db = getDb();
  const check = assertSendable(db, id);
  if (!check.ok) return fail(check.code, check.error);
  const { message, person, uid } = check;
  if (message.channel !== 'email' || !person.email) return fail('bad_request', 'Only email messages are sent from Nomadic. Open LinkedIn messages instead.');
  const cfg = smtpConfig();
  if (!cfg) return fail('smtp_not_configured', 'Connect your email account first (Outreach → Email account).');
  const stats = smtpSendStats(db, new Date());
  if (stats.sentToday >= OUTREACH_SEND_LIMIT) return fail('send_limit', `You have sent ${OUTREACH_SEND_LIMIT} emails today. Send more tomorrow.`);
  if (stats.lastSentAt !== null && Date.now() - stats.lastSentAt < OUTREACH_SEND_GAP_MS) {
    return fail('send_limit', 'Wait a minute between emails so your account is not flagged as spam.');
  }
  const sender = new SmtpSender({ host: cfg.host, port: cfg.port, secure: cfg.secure, user: cfg.user, pass: cfg.pass });
  try {
    const res = await sender.send({ from: fromHeader(cfg.fromName, cfg.user), to: person.email, subject: message.subject, text: message.body });
    if (res.rejected.length && !res.accepted.length) return fail('smtp_failed', 'Your mail server refused this address.');
  } catch (err) {
    log(`[Outreach] SMTP send failed: ${err instanceof Error ? err.name : 'error'}`);
    return fail('smtp_failed', `Your mail server did not accept the email: ${errorMessage(err).slice(0, 200)}`);
  } finally {
    sender.close();
  }
  const applicationId = recordInTracker(message, person, uid);
  const sent = markSent(db, id, 'smtp', now(), applicationId);
  persistDb();
  log(`[Outreach] Email #${id} sent via SMTP`);
  return { success: true, message: sent ?? undefined };
}

export function gmailComposeUrl(to: string, subject: string, body: string): string {
  const p = new URLSearchParams({ view: 'cm', fs: '1', to, su: subject, body });
  return `https://mail.google.com/mail/?${p.toString()}`;
}

export function mailtoUrl(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Opens a reviewed message in Gmail, the mail app or LinkedIn (body copied to the
 * clipboard). The user sends it there, then marks it sent here.
 */
export async function openOutreachMessage(input: OutreachOpenInput): Promise<OutreachResult & { copied?: boolean }> {
  const check = assertSendable(getDb(), input.id);
  if (!check.ok) return fail(check.code, check.error);
  const { message, person } = check;
  try {
    if (input.via === 'linkedin') {
      if (message.channel !== 'linkedin') return fail('bad_request', 'This is an email. Open it in Gmail or your mail app.');
      if (!person.linkedinUrl) return fail('bad_request', 'Add their LinkedIn profile link first.');
      clipboard.writeText(message.body);
      await shell.openExternal(person.linkedinUrl);
      return { success: true, copied: true };
    }
    if (message.channel !== 'email' || !person.email) return fail('bad_request', 'This is a LinkedIn note. Open it on LinkedIn.');
    const url = input.via === 'gmail' ? gmailComposeUrl(person.email, message.subject, message.body) : mailtoUrl(person.email, message.subject, message.body);
    await shell.openExternal(url);
    return { success: true };
  } catch (err) {
    log(`[Outreach] Open failed: ${errorMessage(err)}`);
    return fail('bad_request', 'Could not open it. Copy the message instead.');
  }
}

export function markOutreachMessage(input: OutreachMarkInput): OutreachMessageResult {
  const db = getDb();
  const msg = getMessage(db, input.id);
  const person = msg ? getPerson(db, msg.personId) : null;
  if (!msg || !person) return fail('not_found', 'That message no longer exists.');
  if (input.status === 'sent') {
    if (msg.sentAt) return { success: true, message: msg };
    // The user says they sent it themselves: it must still be the reviewed text.
    const check = assertSendable(db, input.id);
    if (!check.ok) return fail(check.code, check.error);
    const via = msg.channel === 'linkedin' ? 'linkedin' : 'manual';
    const applicationId = recordInTracker(msg, person, check.uid);
    const sent = markSent(db, input.id, via, now(), applicationId);
    persistDb();
    return { success: true, message: sent ?? undefined };
  }
  if (!msg.sentAt) return fail('bad_request', 'Mark the message as sent first.');
  const updated = setStatus(db, input.id, input.status, now());
  persistDb();
  return { success: true, message: updated ?? undefined };
}

// ── AI draft (ai-proxy `outreach_email`) ───────────────────────────────────

const draftSchema = z.object({ subject: z.string().nullable(), body: z.string().nullable() });

const txt = (v: unknown): string | undefined => {
  const t = typeof v === 'string' ? v.trim() : '';
  return t ? t : undefined;
};

/** Only facts the user entered; unknown fields are left out, never filled in. */
export function candidateFacts(profile: Record<string, unknown> | null): Record<string, unknown> {
  if (!profile) return {};
  let answers: Record<string, unknown> = {};
  try {
    const raw = profile.custom_answers_json;
    answers = typeof raw === 'string' ? (JSON.parse(raw) as Record<string, unknown>) : raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  } catch { /* unreadable answers: no extras */ }
  const { extras } = splitProfileExtras(answers);
  const name = [txt(profile.first_name), txt(profile.last_name)].filter(Boolean).join(' ');
  const years = extras.yearsOfExperience != null ? Number.parseFloat(extras.yearsOfExperience) : NaN;
  const out: Record<string, unknown> = {
    name: name || undefined,
    desired_title: txt(profile.desired_title),
    skills: txt(profile.tech_stack)?.slice(0, 1000),
    location: extras.location,
    years_of_experience: Number.isFinite(years) && years >= 0 && years <= 80 ? years : undefined,
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
}

export async function draftOutreachWithAi(input: OutreachDraftInput): Promise<OutreachDraftResult> {
  const feature = 'AI outreach drafts';
  const person = getPerson(getDb(), input.personId);
  if (!person) return { success: false, code: 'not_found', error: 'That person no longer exists.' };
  const recipient: Record<string, unknown> = { kind: person.kind, company: person.company };
  if (person.name) recipient.name = person.name;
  if (person.roleTitle) recipient.role_title = person.roleTitle;
  const payload: Record<string, unknown> = {
    candidate: candidateFacts(getMasterProfileRow()),
    recipient,
    channel: input.channel,
    purpose: input.purpose,
  };
  if (input.jobTitle?.trim()) payload.job_title = input.jobTitle.trim();
  if (input.note?.trim()) payload.note = input.note.trim();
  const res = await callAiProxy('outreach_email', payload, feature);
  if (!res.ok) return { success: false, code: res.code, error: res.error, quota: res.quota ?? null };
  const parsed = draftSchema.safeParse(res.result);
  if (!parsed.success || !parsed.data.body) {
    return { success: false, code: 'failed', error: aiErrorMessage('failed', feature), quota: res.quota };
  }
  return { success: true, subject: input.channel === 'linkedin' ? null : parsed.data.subject, body: parsed.data.body, quota: res.quota };
}

// ── SMTP account (the user's own; password stays on this computer) ─────────

export function getSmtpSettings(): OutreachSmtpSettings {
  const db = getDb();
  const s = readSmtpSettings(db);
  const configured = !!s && !!readSecret('smtp_password', db);
  return {
    configured,
    host: s?.host ?? '',
    port: s?.port ?? 587,
    secure: s?.secure ?? false,
    user: s?.user ?? '',
    fromName: s?.fromName ?? '',
  };
}

function storePassword(password: string | null): void {
  const db = getDb();
  const column = writeSecret('smtp_password', password, db);
  db.run('UPDATE master_profile SET smtp_password = ? WHERE id = 1', [column]);
}

/** Signs in to the server with the new settings before saving them. */
export async function saveSmtpSettings(input: OutreachSmtpInput): Promise<OutreachResult> {
  const db = getDb();
  const pass = input.password ?? readSecret('smtp_password', db);
  if (!pass) return fail('smtp_not_configured', 'Enter the password (for Gmail, an app password).');
  const sender = new SmtpSender({ host: input.host, port: input.port, secure: input.secure, user: input.user, pass });
  try {
    await sender.verify();
  } catch (err) {
    log(`[Outreach] SMTP sign-in failed: ${err instanceof Error ? err.name : 'error'}`);
    return fail('smtp_failed', `Could not sign in to ${input.host}: ${errorMessage(err).slice(0, 200)}`);
  } finally {
    sender.close();
  }
  writeSmtpSettings(db, { host: input.host, port: input.port, secure: input.secure, user: input.user, fromName: input.fromName?.trim() ?? '' });
  if (input.password) storePassword(input.password);
  persistDb();
  return { success: true };
}

export function clearSmtpSettings(): OutreachResult {
  writeSmtpSettings(getDb(), null);
  storePassword(null);
  persistDb();
  return { success: true };
}

import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Contact } from './schema.js';

/**
 * Persistence for public hiring contacts (migration 027: outreach_contacts, outreach_suppressions).
 * `SupabaseContactStore` writes with the service role; `MemoryContactStore` backs the tests.
 */

/** One outreach_contacts row as the scraper writes it (first_seen_at, hidden_at and report counts are server-owned). */
export interface ContactRow {
  email: string;
  name: string | null;
  company: string;
  company_domain: string | null;
  role_title: string | null;
  hiring_for: string | null;
  contact_kind: string;
  address_type: string;
  source: string;
  source_url: string;
  source_snippet: string;
  job_url: string | null;
  location: string | null;
  remote: boolean;
  posted_at: string | null;
  mx_ok: boolean | null;
  last_seen_at: string;
  is_active: boolean;
}

/** sha256 hex of the lowercased address; the same value the database computes for suppressions. */
export function emailHash(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase(), 'utf8').digest('hex');
}

export function toContactRow(c: Contact, seenAt: string): ContactRow {
  return {
    email: c.email,
    name: c.name,
    company: c.company,
    company_domain: c.companyDomain,
    role_title: c.roleTitle,
    hiring_for: c.hiringFor,
    contact_kind: c.contactKind,
    address_type: c.addressType,
    source: c.source,
    source_url: c.sourceUrl,
    source_snippet: c.sourceSnippet,
    job_url: c.jobUrl,
    location: c.location,
    remote: c.remote,
    posted_at: c.postedAt,
    mx_ok: c.mxOk,
    last_seen_at: seenAt,
    is_active: true,
  };
}

export interface ContactStore {
  /** The subset of `hashes` whose owners asked not to be listed. */
  suppressedHashes(hashes: string[]): Promise<Set<string>>;
  /** Insert or update by email. */
  upsert(rows: ContactRow[]): Promise<number>;
  /** Hide rows no source has shown since `seenBefore`. */
  expireStale(seenBefore: string): Promise<number>;
}

export class MemoryContactStore implements ContactStore {
  readonly rows = new Map<string, ContactRow & { first_seen_at: string }>();
  readonly suppressed = new Set<string>();

  async suppressedHashes(hashes: string[]): Promise<Set<string>> {
    return new Set(hashes.filter((h) => this.suppressed.has(h)));
  }

  async upsert(rows: ContactRow[]): Promise<number> {
    let n = 0;
    for (const row of rows) {
      // The database trigger refuses suppressed addresses; mirror that here.
      if (this.suppressed.has(emailHash(row.email))) continue;
      const existing = this.rows.get(row.email);
      this.rows.set(row.email, { ...row, first_seen_at: existing?.first_seen_at ?? row.last_seen_at });
      n++;
    }
    return n;
  }

  async expireStale(seenBefore: string): Promise<number> {
    let n = 0;
    for (const row of this.rows.values()) {
      if (row.is_active && row.last_seen_at < seenBefore) {
        row.is_active = false;
        n++;
      }
    }
    return n;
  }
}

const BATCH = 200;

export class SupabaseContactStore implements ContactStore {
  constructor(private readonly client: SupabaseClient) {}

  async suppressedHashes(hashes: string[]): Promise<Set<string>> {
    const out = new Set<string>();
    for (let i = 0; i < hashes.length; i += BATCH) {
      const { data, error } = await this.client
        .from('outreach_suppressions')
        .select('email_hash')
        .in('email_hash', hashes.slice(i, i + BATCH));
      if (error) throw new Error(`outreach_suppressions read failed: ${error.message}`);
      for (const row of data ?? []) out.add(row.email_hash as string);
    }
    return out;
  }

  async upsert(rows: ContactRow[]): Promise<number> {
    let written = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { error } = await this.client.from('outreach_contacts').upsert(batch, { onConflict: 'email' });
      if (error) throw new Error(`outreach_contacts upsert failed: ${error.message}`);
      written += batch.length;
    }
    return written;
  }

  async expireStale(seenBefore: string): Promise<number> {
    const { data, error } = await this.client
      .from('outreach_contacts')
      .update({ is_active: false })
      .eq('is_active', true)
      .lt('last_seen_at', seenBefore)
      .select('id');
    if (error) throw new Error(`outreach_contacts expire failed: ${error.message}`);
    return data?.length ?? 0;
  }
}

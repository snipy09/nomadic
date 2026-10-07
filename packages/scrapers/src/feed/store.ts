import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyDef } from './companies.js';
import type { Hackathon, Opening, RoleFamily } from './schema.js';

/**
 * Persistence for the feed scraper (migration 031). `SupabaseFeedStore` writes with the service role;
 * `MemoryFeedStore` backs the tests. first_seen_at is set by the database on insert and never sent.
 */

export interface CompanyRow {
  slug: string;
  name: string;
  domain: string | null;
  careers_url: string;
  category: string;
  has_careers_feed: boolean;
  updated_at: string;
}

export interface OpeningRow {
  company_slug: string;
  source: string;
  source_job_id: string;
  title: string;
  kind: string;
  level: string;
  role_family: string;
  location: string;
  remote: boolean;
  url: string;
  posted_at: string | null;
  last_seen_at: string;
  is_active: boolean;
}

export interface SnapshotRow {
  company_slug: string;
  taken_on: string;
  open_total: number;
  internships: number;
  full_time: number;
  entry_level: number;
  new_openings: number;
  baseline: boolean;
  role_families: Partial<Record<RoleFamily, number>>;
  sample_titles: string[];
  updated_at: string;
}

export interface HackathonRow {
  source: string;
  source_id: string;
  title: string;
  organiser: string | null;
  url: string;
  mode: string;
  city: string | null;
  country: string | null;
  in_india: boolean;
  starts_at: string | null;
  ends_at: string | null;
  registration_ends_at: string | null;
  themes: string[];
  prize_text: string | null;
  last_seen_at: string;
  is_active: boolean;
}

export const toCompanyRow = (c: CompanyDef, at: string): CompanyRow => ({
  slug: c.slug,
  name: c.name,
  domain: c.domain || null,
  careers_url: c.careersUrl,
  category: c.category,
  has_careers_feed: c.careers !== null,
  updated_at: at,
});

export const toOpeningRow = (o: Opening, seenAt: string): OpeningRow => ({
  company_slug: o.companySlug,
  source: o.source,
  source_job_id: o.sourceJobId,
  title: o.title,
  kind: o.kind,
  level: o.level,
  role_family: o.roleFamily,
  location: o.location,
  remote: o.remote,
  url: o.url,
  posted_at: o.postedAt,
  last_seen_at: seenAt,
  is_active: true,
});

export const toHackathonRow = (h: Hackathon, seenAt: string): HackathonRow => ({
  source: h.source,
  source_id: h.sourceId,
  title: h.title,
  organiser: h.organiser,
  url: h.url,
  mode: h.mode,
  city: h.city,
  country: h.country,
  in_india: h.inIndia,
  starts_at: h.startsAt,
  ends_at: h.endsAt,
  registration_ends_at: h.registrationEndsAt,
  themes: h.themes,
  prize_text: h.prizeText,
  last_seen_at: seenAt,
  is_active: true,
});

export interface FeedStore {
  upsertCompanies(rows: CompanyRow[]): Promise<number>;
  /** Every source_job_id ever stored for each company (active or not): what is not in it is new. */
  knownOpeningIds(slugs: string[]): Promise<Map<string, Set<string>>>;
  upsertOpenings(rows: OpeningRow[]): Promise<number>;
  /** Openings of one company not seen in this run go inactive. */
  expireOpenings(slug: string, seenBefore: string): Promise<number>;
  upsertSnapshots(rows: SnapshotRow[]): Promise<number>;
  upsertHackathons(rows: HackathonRow[]): Promise<number>;
  expireHackathons(source: string, seenBefore: string): Promise<number>;
}

export class MemoryFeedStore implements FeedStore {
  readonly companies = new Map<string, CompanyRow>();
  readonly openings = new Map<string, OpeningRow & { first_seen_at: string }>();
  readonly snapshots = new Map<string, SnapshotRow>();
  readonly hackathons = new Map<string, HackathonRow & { first_seen_at: string }>();

  async upsertCompanies(rows: CompanyRow[]) {
    for (const r of rows) this.companies.set(r.slug, r);
    return rows.length;
  }

  async knownOpeningIds(slugs: string[]) {
    const out = new Map<string, Set<string>>(slugs.map((s) => [s, new Set<string>()]));
    for (const o of this.openings.values()) out.get(o.company_slug)?.add(o.source_job_id);
    return out;
  }

  async upsertOpenings(rows: OpeningRow[]) {
    for (const r of rows) {
      const key = `${r.company_slug}|${r.source_job_id}`;
      this.openings.set(key, { ...r, first_seen_at: this.openings.get(key)?.first_seen_at ?? r.last_seen_at });
    }
    return rows.length;
  }

  async expireOpenings(slug: string, seenBefore: string) {
    let n = 0;
    for (const o of this.openings.values()) {
      if (o.company_slug === slug && o.is_active && o.last_seen_at < seenBefore) {
        o.is_active = false;
        n++;
      }
    }
    return n;
  }

  async upsertSnapshots(rows: SnapshotRow[]) {
    for (const r of rows) this.snapshots.set(`${r.company_slug}|${r.taken_on}`, r);
    return rows.length;
  }

  async upsertHackathons(rows: HackathonRow[]) {
    for (const r of rows) {
      const key = `${r.source}|${r.source_id}`;
      this.hackathons.set(key, { ...r, first_seen_at: this.hackathons.get(key)?.first_seen_at ?? r.last_seen_at });
    }
    return rows.length;
  }

  async expireHackathons(source: string, seenBefore: string) {
    let n = 0;
    for (const h of this.hackathons.values()) {
      if (h.source === source && h.is_active && h.last_seen_at < seenBefore) {
        h.is_active = false;
        n++;
      }
    }
    return n;
  }
}

const BATCH = 200;
const PAGE = 1000;

export class SupabaseFeedStore implements FeedStore {
  constructor(private readonly client: SupabaseClient) {}

  private async upsert(table: string, rows: object[], onConflict: string): Promise<number> {
    let written = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { error } = await this.client.from(table).upsert(batch, { onConflict });
      if (error) throw new Error(`${table} upsert failed: ${error.message}`);
      written += batch.length;
    }
    return written;
  }

  upsertCompanies(rows: CompanyRow[]) {
    return this.upsert('companies', rows, 'slug');
  }

  async knownOpeningIds(slugs: string[]) {
    const out = new Map<string, Set<string>>(slugs.map((s) => [s, new Set<string>()]));
    for (const slug of slugs) {
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await this.client
          .from('company_openings')
          .select('source_job_id')
          .eq('company_slug', slug)
          .order('id')
          .range(from, from + PAGE - 1);
        if (error) throw new Error(`company_openings read failed: ${error.message}`);
        for (const row of data ?? []) out.get(slug)!.add(row.source_job_id as string);
        if (!data || data.length < PAGE) break;
      }
    }
    return out;
  }

  upsertOpenings(rows: OpeningRow[]) {
    return this.upsert('company_openings', rows, 'company_slug,source_job_id');
  }

  async expireOpenings(slug: string, seenBefore: string) {
    const { data, error } = await this.client
      .from('company_openings')
      .update({ is_active: false })
      .eq('company_slug', slug)
      .eq('is_active', true)
      .lt('last_seen_at', seenBefore)
      .select('id');
    if (error) throw new Error(`company_openings expire failed: ${error.message}`);
    return data?.length ?? 0;
  }

  upsertSnapshots(rows: SnapshotRow[]) {
    return this.upsert('company_hiring_snapshots', rows, 'company_slug,taken_on');
  }

  upsertHackathons(rows: HackathonRow[]) {
    return this.upsert('hackathons', rows, 'source,source_id');
  }

  async expireHackathons(source: string, seenBefore: string) {
    const { data, error } = await this.client
      .from('hackathons')
      .update({ is_active: false })
      .eq('source', source)
      .eq('is_active', true)
      .lt('last_seen_at', seenBefore)
      .select('id');
    if (error) throw new Error(`hackathons expire failed: ${error.message}`);
    return data?.length ?? 0;
  }
}

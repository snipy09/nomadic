import type { SupabaseClient } from '@supabase/supabase-js';
import type { NewsArticle } from './run.js';

/**
 * Persistence for the news scraper (migration 033 `news_items`). Rows are keyed by the article URL; an article seen
 * again keeps its first_seen_at. Articles older than the keep window go inactive (clients stop seeing them).
 */

export interface NewsRow {
  url: string;
  source: string;
  source_name: string;
  title: string;
  summary: string | null;
  published_at: string;
  kind: string;
  company_name: string | null;
  company_slug: string | null;
  roles: string[];
  headcount_text: string | null;
  period_text: string | null;
  starts_on: string | null;
  ends_on: string | null;
  locations: string[];
  last_seen_at: string;
  is_active: boolean;
}

export const toNewsRow = (a: NewsArticle, seenAt: string): NewsRow => ({
  url: a.url,
  source: a.source,
  source_name: a.sourceName,
  title: a.title,
  summary: a.summary || null,
  published_at: a.publishedAt,
  kind: a.kind,
  company_name: a.companyName,
  company_slug: a.companySlug,
  roles: a.roles,
  headcount_text: a.headcountText,
  period_text: a.periodText,
  starts_on: a.startsOn,
  ends_on: a.endsOn,
  locations: a.locations,
  last_seen_at: seenAt,
  is_active: true,
});

export interface NewsStore {
  upsertArticles(rows: NewsRow[]): Promise<number>;
  /** Marks articles published before `before` inactive; returns how many. */
  retireOlderThan(before: string): Promise<number>;
}

export class MemoryNewsStore implements NewsStore {
  readonly rows = new Map<string, NewsRow & { first_seen_at: string }>();

  async upsertArticles(rows: NewsRow[]) {
    for (const r of rows) this.rows.set(r.url, { ...r, first_seen_at: this.rows.get(r.url)?.first_seen_at ?? r.last_seen_at });
    return rows.length;
  }

  async retireOlderThan(before: string) {
    let n = 0;
    for (const r of this.rows.values()) {
      if (r.is_active && r.published_at < before) {
        r.is_active = false;
        n++;
      }
    }
    return n;
  }
}

export class SupabaseNewsStore implements NewsStore {
  constructor(private readonly client: SupabaseClient) {}

  async upsertArticles(rows: NewsRow[]) {
    let n = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const batch = rows.slice(i, i + 200);
      const { error } = await this.client.from('news_items').upsert(batch, { onConflict: 'url' });
      if (error) throw new Error(`news_items upsert failed: ${error.message}`);
      n += batch.length;
    }
    return n;
  }

  async retireOlderThan(before: string) {
    const { data, error } = await this.client
      .from('news_items')
      .update({ is_active: false })
      .eq('is_active', true)
      .lt('published_at', before)
      .select('id');
    if (error) throw new Error(`news_items retire failed: ${error.message}`);
    return data?.length ?? 0;
  }
}

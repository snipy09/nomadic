import type { JobInput } from '../pipeline/schema.ts';
import {
  cleanText,
  decodeEntities,
  detectWorkplace,
  parseEmploymentType,
  parseSalary,
  stripHtml,
  toIsoDate,
} from '../pipeline/normalize.ts';
import { extractJobLinksFromHtml } from '../direct-dom-scraper.ts';
import { scrapeIndeedIndia, scrapeNaukriIndia } from '../indian-portals-scraper.ts';
import { computeJobHash } from '../hasher.ts';
import {
  emptyResult,
  errorMessage,
  getJson,
  getText,
  mapLimit,
  type SourceAdapter,
  type SourceFetchResult,
} from './types.ts';

// ── Remotive (tier 1) ────────────────────────────────────────────────────────
// GET https://remotive.com/api/remote-jobs  (Remotive asks for <= 4 calls/day; the 6h cron is exactly that.)

export const remotiveSource: SourceAdapter = {
  key: 'remotive',
  label: 'Remotive',
  tier: 1,
  description: 'Remotive public remote-jobs API',
  isConfigured: () => true,
  async fetchRaw(ctx) {
    const result = emptyResult<any>();
    const params = new URLSearchParams({ limit: String(ctx.config.remotive.limit) });
    if (ctx.config.remotive.category) params.set('category', ctx.config.remotive.category);
    try {
      const data = await getJson(ctx, `https://remotive.com/api/remote-jobs?${params}`);
      result.records = Array.isArray(data?.jobs) ? data.jobs : [];
    } catch (err) {
      result.errors.push(`remotive: ${errorMessage(err)}`);
      result.failedScopes.push('*');
    }
    return result;
  },
  normalize(item): JobInput | null {
    if (!item || typeof item !== 'object') return null;
    const salary = parseSalary(item.salary);
    const location = cleanText(item.candidate_required_location) || 'Worldwide';
    return {
      title: cleanText(item.title),
      company: cleanText(item.company_name, 200),
      location,
      workplaceType: 'remote',
      remote: true,
      employmentType: parseEmploymentType(item.job_type, item.title),
      salaryMin: salary.min,
      salaryMax: salary.max,
      salaryCurrency: salary.currency,
      salaryPeriod: salary.period,
      postedAt: toIsoDate(item.publication_date),
      applyUrl: item.url,
      description: stripHtml(item.description),
      source: 'remotive',
      sourceLabel: 'Remotive',
      sourceJobId: item.id,
      tier: 1,
      raw: item,
    };
  },
};

// ── Jobicy (tier 2; previously hidden inside scrapeInternshala as "Verified Placements Feed") ──

export const jobicySource: SourceAdapter = {
  key: 'jobicy',
  label: 'Jobicy',
  tier: 2,
  description: 'Jobicy remote-jobs API (was bundled into the legacy Internshala scraper)',
  isConfigured: () => true,
  async fetchRaw(ctx) {
    const result = emptyResult<any>();
    const params = new URLSearchParams({ count: String(ctx.config.jobicy.count) });
    if (ctx.config.jobicy.tag) params.set('tag', ctx.config.jobicy.tag);
    try {
      const data = await getJson(ctx, `https://jobicy.com/api/v2/remote-jobs?${params}`);
      result.records = Array.isArray(data?.jobs) ? data.jobs : [];
    } catch (err) {
      result.errors.push(`jobicy: ${errorMessage(err)}`);
      result.failedScopes.push('*');
    }
    return result;
  },
  normalize(item): JobInput | null {
    if (!item || typeof item !== 'object') return null;
    const hasSalary = typeof item.annualSalaryMin === 'number' || typeof item.annualSalaryMax === 'number';
    return {
      title: cleanText(decodeEntities(String(item.jobTitle ?? ''))),
      company: cleanText(item.companyName, 200),
      location: cleanText(item.jobGeo) || 'Anywhere',
      workplaceType: 'remote',
      remote: true,
      employmentType: parseEmploymentType(item.jobType, item.jobTitle),
      salaryMin: hasSalary ? item.annualSalaryMin ?? null : null,
      salaryMax: hasSalary ? item.annualSalaryMax ?? null : null,
      salaryCurrency: hasSalary ? item.salaryCurrency ?? 'USD' : null,
      salaryPeriod: hasSalary ? 'year' : null,
      postedAt: toIsoDate(item.pubDate),
      applyUrl: item.url,
      description: stripHtml(item.jobDescription ?? item.jobExcerpt),
      source: 'jobicy',
      sourceLabel: 'Jobicy',
      sourceJobId: item.id ?? item.jobSlug ?? item.url,
      tier: 2,
      raw: item,
    };
  },
};

// ── Arbeitnow (tier 2 niche board) ───────────────────────────────────────────

export const arbeitnowSource: SourceAdapter = {
  key: 'arbeitnow',
  label: 'Niche Board',
  tier: 2,
  description: 'Arbeitnow job board API (legacy "Niche Board")',
  isConfigured: () => true,
  async fetchRaw(ctx) {
    const result = emptyResult<any>();
    try {
      const data = await getJson(ctx, 'https://www.arbeitnow.com/api/job-board-api');
      result.records = Array.isArray(data?.data) ? data.data : [];
    } catch (err) {
      result.errors.push(`arbeitnow: ${errorMessage(err)}`);
      result.failedScopes.push('*');
    }
    return result;
  },
  normalize(item): JobInput | null {
    if (!item || typeof item !== 'object') return null;
    const location = cleanText(item.location);
    const workplace = item.remote ? 'remote' : detectWorkplace(location, item.title);
    return {
      title: cleanText(item.title),
      company: cleanText(item.company_name, 200),
      location,
      workplaceType: workplace,
      remote: workplace === 'remote',
      employmentType: parseEmploymentType(item.job_types, item.title),
      postedAt: toIsoDate(item.created_at),
      applyUrl: item.url,
      description: stripHtml(item.description),
      source: 'arbeitnow',
      sourceLabel: 'Niche Board',
      sourceJobId: item.slug ?? item.url,
      tier: 2,
      raw: item,
    };
  },
};

// ── RSS feeds (tier 2) ───────────────────────────────────────────────────────

export interface RssItem {
  feed: string;
  fields: Record<string, string>;
  remoteFeed?: boolean;
}

/** Tolerant RSS item parser. Collects every child tag (incl. namespaced `job_listing:company`). */
export function parseRssItems(xml: string, feed: string): RssItem[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/g) || [];
  return items.map(itemXml => {
    const fields: Record<string, string> = {};
    const re = /<([a-zA-Z_][\w.-]*(?::[\w.-]+)?)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(itemXml)) !== null) {
      const key = m[1].toLowerCase();
      if (key === 'item') continue;
      if (!(key in fields)) fields[key] = m[2].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
    }
    return { feed, fields };
  });
}

/** Splits "Company: Title" (WWR style) or "Title at Company". */
export function splitRssTitle(title: string): { title: string; company: string | null } {
  const colon = title.match(/^([^:]{2,60}):\s+(.{3,})$/);
  if (colon) return { company: colon[1].trim(), title: colon[2].trim() };
  const at = title.match(/^(.{3,}?)\s+at\s+([^,]{2,60})$/i);
  if (at) return { title: at[1].trim(), company: at[2].trim() };
  return { title, company: null };
}

export const rssSource: SourceAdapter<RssItem> = {
  key: 'rss',
  label: 'RSS',
  tier: 2,
  description: 'RSS job feeds (Jobspresso by default)',
  isConfigured: c => c.rssFeeds.length > 0,
  async fetchRaw(ctx) {
    const result: SourceFetchResult<RssItem> = emptyResult();
    await mapLimit(ctx.config.rssFeeds, ctx.config.sourceConcurrency, async feed => {
      try {
        const xml = await getText(ctx, feed.url, { headers: { Accept: 'application/rss+xml, application/xml, text/xml' } });
        result.records.push(...parseRssItems(xml, feed.name).map(item => ({ ...item, remoteFeed: feed.remote })));
      } catch (err) {
        result.errors.push(`rss ${feed.name}: ${errorMessage(err)}`);
        result.failedScopes.push(`feed:${feed.name}`);
      }
    });
    return result;
  },
  normalize({ feed, fields, remoteFeed }): JobInput | null {
    const rawTitle = cleanText(fields.title);
    const link = cleanText(fields.link, 2000);
    if (!rawTitle || !link) return null;
    const split = splitRssTitle(rawTitle);
    const company = cleanText(fields['job_listing:company'] || fields['dc:creator'] || split.company || '', 200);
    if (!company) return null; // legacy used the feed name as "company"; drop instead of inventing one
    const location = cleanText(fields['job_listing:location'] || fields.region || fields.location || '');
    const description = stripHtml(fields['content:encoded'] || fields.description);
    const workplace = remoteFeed ? 'remote' : detectWorkplace(location, rawTitle);
    return {
      title: split.company ? split.title : rawTitle,
      company,
      location,
      workplaceType: workplace,
      remote: workplace === 'remote',
      employmentType: parseEmploymentType(fields['job_listing:job_type'], fields.type, rawTitle),
      postedAt: toIsoDate(fields.pubdate),
      applyUrl: link,
      description,
      source: 'rss',
      sourceLabel: `RSS: ${feed}`,
      sourceJobId: cleanText(fields.guid, 500) || link,
      tier: 2,
      raw: { feed, fields },
    };
  },
  scopeOf: () => '*',
};

// ── RemoteOK (tier 3: legacy "Web Index Engine" / web search) ───────────────

export const remoteokSource: SourceAdapter = {
  key: 'remoteok',
  label: 'Web Index Engine',
  tier: 3,
  description: 'RemoteOK tag API (legacy web-search scraper)',
  isConfigured: c => c.remoteokTags.length > 0,
  async fetchRaw(ctx) {
    const result = emptyResult<any>();
    for (const tag of ctx.config.remoteokTags) {
      try {
        const data = await getJson(ctx, `https://remoteok.com/api?tag=${encodeURIComponent(tag)}`);
        if (Array.isArray(data)) result.records.push(...data.filter(d => d && d.position && d.url));
      } catch (err) {
        result.errors.push(`remoteok ${tag}: ${errorMessage(err)}`);
      }
    }
    if (result.errors.length) result.failedScopes.push('*');
    return result;
  },
  normalize(item): JobInput | null {
    const location = cleanText(item.location);
    const hasSalary = Number(item.salary_min) > 0 || Number(item.salary_max) > 0;
    return {
      title: cleanText(item.position),
      company: cleanText(item.company, 200),
      location,
      workplaceType: 'remote',
      remote: true,
      employmentType: parseEmploymentType(item.tags, item.position),
      salaryMin: hasSalary ? Number(item.salary_min) || null : null,
      salaryMax: hasSalary ? Number(item.salary_max) || null : null,
      salaryCurrency: hasSalary ? 'USD' : null,
      salaryPeriod: hasSalary ? 'year' : null,
      postedAt: toIsoDate(item.date ?? item.epoch),
      applyUrl: item.url,
      description: stripHtml(item.description),
      source: 'remoteok',
      sourceLabel: 'Web Index Engine',
      sourceJobId: item.id ?? item.slug ?? item.url,
      tier: 3,
      raw: item,
    };
  },
  scopeOf: () => '*',
};

// ── Naukri / Indeed (tier 3, legacy stubs) ──────────────────────────────────

function legacyStub(key: 'naukri' | 'indeed', label: string, run: () => Promise<any[]>): SourceAdapter {
  return {
    key,
    label,
    tier: 3,
    description: `${label} (legacy scraper is a stub that returns no jobs)`,
    isConfigured: () => true,
    async fetchRaw() {
      const result = emptyResult<any>();
      try {
        result.records = await run();
        if (result.records.length === 0) result.errors.push(`${key}: legacy scraper is a stub and returned no jobs`);
      } catch (err) {
        result.errors.push(`${key}: ${errorMessage(err)}`);
      }
      return result;
    },
    normalize(item): JobInput | null {
      if (!item?.applyUrl || !item?.title) return null;
      return {
        title: cleanText(item.title),
        company: cleanText(item.company, 200),
        location: cleanText(item.location),
        workplaceType: detectWorkplace(item.location, item.title),
        employmentType: parseEmploymentType(item.employmentType, item.title),
        applyUrl: item.applyUrl,
        description: stripHtml(item.description),
        source: key,
        sourceLabel: label,
        sourceJobId: item.jobHash || computeJobHash(item.company ?? '', item.title, item.applyUrl),
        tier: 3,
        raw: item,
      };
    },
  };
}

export const naukriSource = legacyStub('naukri', 'Naukri', scrapeNaukriIndia);
export const indeedSource = legacyStub('indeed', 'Indeed', scrapeIndeedIndia);

// ── Direct DOM (tier 3) ─────────────────────────────────────────────────────

export const directDomSource: SourceAdapter = {
  key: 'dom',
  label: 'DOM Engine',
  tier: 3,
  description: 'Generic career-page link scraping (configure domTargets)',
  isConfigured: c => c.domTargets.length > 0,
  async fetchRaw(ctx) {
    const result = emptyResult<any>();
    for (const target of ctx.config.domTargets) {
      try {
        const html = await getText(ctx, target.url);
        for (const job of extractJobLinksFromHtml(html, target.url)) {
          result.records.push({ ...job, company: target.name });
        }
      } catch (err) {
        result.errors.push(`dom ${target.name}: ${errorMessage(err)}`);
        result.failedScopes.push(target.name);
      }
    }
    return result;
  },
  normalize(item): JobInput | null {
    return {
      title: cleanText(item.title),
      company: cleanText(item.company, 200),
      location: '',
      workplaceType: detectWorkplace(item.title),
      employmentType: parseEmploymentType(item.title),
      applyUrl: item.applyUrl,
      description: '',
      source: 'dom',
      sourceLabel: `DOM Engine: ${item.company}`,
      sourceJobId: item.applyUrl,
      tier: 3,
      raw: item,
    };
  },
  scopeOf: job => job.company,
};

import {
  fetchInternshalaDetail,
  parseDetailUrlsFromListingHtml,
  type InternshalaJob,
} from '../internshala-scraper.ts';
import type { JobInput } from '../pipeline/schema.ts';
import { cleanText, detectWorkplace, parseSalary, titleFromSlug } from '../pipeline/normalize.ts';
import { emptyResult, errorMessage, getText, mapLimit, type SourceAdapter } from './types.ts';

/** Tier 1 (India): Internshala listings -> detail pages (JSON-LD), slug fallback. */

export interface InternshalaRecord {
  url: string;
  detail: InternshalaJob | null;
}

export interface SlugInfo {
  role: string;
  city: string | null;
  company: string | null;
  id: string;
  isInternship: boolean;
  workFromHome: boolean;
}

/**
 * Parses detail slugs such as
 *   /internship/detail/full-stack-development-internship-in-bangalore-at-acme-labs1759310001
 *   /internship/detail/work-from-home-react-js-development-internship-at-pixelcraft1759310002
 *   /job/detail/junior-python-developer-job-in-pune-at-datanest1759310003
 */
export function parseInternshalaSlug(url: string): SlugInfo | null {
  const match = url.match(/\/(internship|job)\/detail\/([^/?#]+)/i);
  if (!match) return null;
  const isInternship = match[1].toLowerCase() === 'internship';
  let slug = match[2].toLowerCase();
  const idMatch = slug.match(/(\d{5,})$/);
  const id = idMatch ? idMatch[1] : slug;
  if (idMatch) slug = slug.slice(0, -idMatch[1].length);

  const atIdx = slug.lastIndexOf('-at-');
  const companyPart = atIdx >= 0 ? slug.slice(atIdx + 4) : null;
  let rest = atIdx >= 0 ? slug.slice(0, atIdx) : slug;
  const workFromHome = rest.startsWith('work-from-home-');
  if (workFromHome) rest = rest.slice('work-from-home-'.length);

  let city: string | null = null;
  const inMatch = rest.match(/^(.*?)-(?:internship|job)s?-in-(.+)$/);
  let role = rest;
  if (inMatch) {
    role = inMatch[1];
    city = inMatch[2];
  } else {
    role = rest.replace(/-(?:internship|job)s?$/, '');
  }
  return {
    role: titleFromSlug(role),
    city: city ? titleFromSlug(city) : null,
    company: companyPart ? titleFromSlug(companyPart.replace(/-+$/, '')) : null,
    id,
    isInternship,
    workFromHome,
  };
}

const PLACEHOLDER_COMPANIES = new Set(['tech innovator', 'innovator', 'tech partner', '']);
const TEMPLATED_DESCRIPTION = /^(verified opportunity at|direct application on internshala portal|live internship opportunity at)/i;

export const internshalaSource: SourceAdapter<InternshalaRecord> = {
  key: 'internshala',
  label: 'Internshala',
  tier: 1,
  description: 'Internshala listings + detail pages (India)',
  isConfigured: c => c.internshala.listingUrls.length > 0,
  async fetchRaw(ctx) {
    const result = emptyResult<InternshalaRecord>();
    const urls: string[] = [];
    let listingsOk = 0;
    for (const listingUrl of ctx.config.internshala.listingUrls) {
      try {
        const html = await getText(ctx, listingUrl);
        listingsOk++;
        for (const u of parseDetailUrlsFromListingHtml(html)) if (!urls.includes(u)) urls.push(u);
      } catch (err) {
        result.errors.push(`internshala listing ${listingUrl}: ${errorMessage(err)}`);
      }
    }
    if (listingsOk < ctx.config.internshala.listingUrls.length) result.failedScopes.push('*');

    const max = Math.max(0, ctx.config.internshala.maxDetailPages);
    const details = await mapLimit(urls.slice(0, max), 4, url => fetchInternshalaDetail(url, 0, ctx.fetch));
    details.forEach((res, i) => {
      const url = urls[i];
      if (res.status === 'expired') {
        result.closedSignals++;
        return;
      }
      result.records.push({ url, detail: res.status === 'ok' && res.job ? res.job : null });
    });
    for (const url of urls.slice(max)) result.records.push({ url, detail: null });
    return result;
  },
  normalize({ url, detail }): JobInput | null {
    const slug = parseInternshalaSlug(url);
    if (!slug) return null;
    const detailCompany = detail && !PLACEHOLDER_COMPANIES.has(detail.company.trim().toLowerCase()) ? detail.company : null;
    const company = cleanText(detailCompany ?? slug.company ?? '', 200);
    const title = cleanText(detail?.title || `${slug.role}${slug.isInternship ? ' Internship' : ''}`);
    const detailLocation = detail?.location && !/^india \/ remote$/i.test(detail.location) ? detail.location : null;
    const location = cleanText(detailLocation ?? (slug.workFromHome ? 'Work From Home' : slug.city ?? 'India'));
    const workplace = slug.workFromHome ? 'remote' : detectWorkplace(location);
    const salary = parseSalary(detail?.stipendOrSalary);
    const description = detail?.description && !TEMPLATED_DESCRIPTION.test(detail.description) ? detail.description : '';
    return {
      title,
      company,
      location: /india/i.test(location) ? location : `${location}, India`,
      workplaceType: workplace === 'unknown' ? 'onsite' : workplace,
      remote: workplace === 'remote',
      employmentType: slug.isInternship ? 'internship' : 'full_time',
      salaryMin: salary.min,
      salaryMax: salary.max,
      salaryCurrency: salary.min !== null ? salary.currency ?? 'INR' : null,
      salaryPeriod: salary.period ?? (salary.min !== null && slug.isInternship ? 'month' : null),
      postedAt: null,
      applyUrl: url,
      description,
      source: 'internshala',
      sourceLabel: 'Internshala',
      sourceJobId: slug.id,
      tier: 1,
      raw: { url, detail },
    };
  },
  scopeOf: () => '*',
};

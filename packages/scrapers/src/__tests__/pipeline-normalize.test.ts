import { describe, expect, it } from 'vitest';
import {
  canonicalizeUrl,
  dedupeKeyFor,
  detectWorkplace,
  htmlToText,
  normalizeEmploymentType,
  normalizeSalaryPeriod,
  parseSalaryText,
  stableIdFromUrl,
  toIsoDate,
} from '../pipeline/normalize.js';

describe('parseSalaryText', () => {
  it.each([
    ['₹30,000 /month', { min: 30000, max: 30000, currency: 'INR', period: 'month' }],
    ['$90k - $120k', { min: 90000, max: 120000, currency: 'USD', period: null }],
    ['₹18 LPA - ₹34 LPA', { min: 1_800_000, max: 3_400_000, currency: 'INR', period: 'year' }],
    ['10-15 LPA', { min: 1_000_000, max: 1_500_000, currency: null, period: 'year' }],
    ['USD 90000 - 120000 /yr', { min: 90000, max: 120000, currency: 'USD', period: 'year' }],
    ['€50,000 per year', { min: 50000, max: 50000, currency: 'EUR', period: 'year' }],
    ['₹2,50,000 per annum', { min: 250000, max: 250000, currency: 'INR', period: 'year' }],
    ['$45/hour', { min: 45, max: 45, currency: 'USD', period: 'hour' }],
  ])('parses %s', (text, expected) => {
    expect(parseSalaryText(text)).toEqual(expected);
  });

  it.each(['Competitive', 'Competitive / Market Rate', '', 'Not disclosed', '50000', 'Unpaid'])(
    'returns nulls for unreadable or ambiguous "%s"',
    (text) => {
      expect(parseSalaryText(text)).toEqual({ min: null, max: null, currency: null, period: null });
    }
  );

  it('orders min and max', () => {
    expect(parseSalaryText('$120k - $90k')).toMatchObject({ min: 90000, max: 120000 });
  });
});

describe('toIsoDate', () => {
  const now = new Date('2026-10-01T00:00:00Z');
  it('parses ISO, RFC 2822 and epoch values', () => {
    expect(toIsoDate('2026-09-30T12:00:00Z', now)).toBe('2026-09-30T12:00:00.000Z');
    expect(toIsoDate('Wed, 30 Sep 2026 12:00:00 GMT', now)).toBe('2026-09-30T12:00:00.000Z');
    expect(toIsoDate(Date.UTC(2026, 8, 30), now)).toBe('2026-09-30T00:00:00.000Z');
    expect(toIsoDate(Date.UTC(2026, 8, 30) / 1000, now)).toBe('2026-09-30T00:00:00.000Z');
    expect(toIsoDate(String(Date.UTC(2026, 8, 30)), now)).toBe('2026-09-30T00:00:00.000Z');
  });
  it('rejects junk, far-future and pre-2000 dates', () => {
    expect(toIsoDate('yesterday', now)).toBeNull();
    expect(toIsoDate('2027-01-01T00:00:00Z', now)).toBeNull();
    expect(toIsoDate('1999-01-01T00:00:00Z', now)).toBeNull();
    expect(toIsoDate(null, now)).toBeNull();
    expect(toIsoDate('', now)).toBeNull();
  });
});

describe('canonicalizeUrl', () => {
  it('collapses ATS urls to the posting url', () => {
    expect(canonicalizeUrl('https://jobs.lever.co/acme/abc-123/apply?lever-source=x')).toBe(
      'https://jobs.lever.co/acme/abc-123'
    );
    expect(canonicalizeUrl('https://jobs.ashbyhq.com/acme/uuid-1/application')).toBe(
      'https://jobs.ashbyhq.com/acme/uuid-1'
    );
  });
  it('strips tracking params, hash, www and trailing slash', () => {
    expect(canonicalizeUrl('http://www.Example.com/careers/123/?utm_source=a&id=7&ref=b#apply')).toBe(
      'https://example.com/careers/123?id=7'
    );
  });
  it('is stable for equivalent urls', () => {
    expect(stableIdFromUrl('https://example.com/job/1?utm_medium=x')).toBe(
      stableIdFromUrl('https://www.example.com/job/1/')
    );
  });
});

describe('detectWorkplace / normalizeEmploymentType', () => {
  it('uses explicit hints first', () => {
    expect(detectWorkplace('remote', 'Berlin', 'Engineer')).toEqual({ workplaceType: 'remote', remote: true });
    expect(detectWorkplace('OnSite', 'Remote', 'Engineer')).toEqual({ workplaceType: 'onsite', remote: false });
    expect(detectWorkplace('Hybrid', '', '')).toEqual({ workplaceType: 'hybrid', remote: false });
  });
  it('falls back to location and title text', () => {
    expect(detectWorkplace(null, 'Remote - India', 'Engineer').remote).toBe(true);
    expect(detectWorkplace(null, 'Pune (Hybrid)', 'Engineer').workplaceType).toBe('hybrid');
    expect(detectWorkplace(null, 'Pune', 'Engineer').workplaceType).toBe('unknown');
  });
  it('maps employment hints and titles', () => {
    expect(normalizeEmploymentType('Full-time')).toBe('full_time');
    expect(normalizeEmploymentType('part_time')).toBe('part_time');
    expect(normalizeEmploymentType('Intern')).toBe('internship');
    expect(normalizeEmploymentType('freelance')).toBe('contract');
    expect(normalizeEmploymentType(null, 'Summer Internship 2027')).toBe('internship');
    expect(normalizeEmploymentType(null, 'Software Engineer')).toBe('unknown');
  });
  it('maps salary intervals', () => {
    expect(normalizeSalaryPeriod('per-year-salary')).toBe('year');
    expect(normalizeSalaryPeriod('1 YEAR')).toBe('year');
    expect(normalizeSalaryPeriod('per-month-salary')).toBe('month');
    expect(normalizeSalaryPeriod('per-hour-wage')).toBe('hour');
    expect(normalizeSalaryPeriod('one-time')).toBeNull();
  });
});

describe('htmlToText / dedupeKeyFor', () => {
  it('decodes escaped HTML (Greenhouse content) and strips tags', () => {
    expect(htmlToText('&lt;p&gt;Hello &amp;amp; welcome&lt;/p&gt;&lt;script&gt;x()&lt;/script&gt;')).toBe(
      'Hello & welcome'
    );
  });
  it('builds the same key for cosmetic variations', () => {
    const a = dedupeKeyFor({
      company: 'Razorpay Software Pvt. Ltd.',
      title: 'SDE-1 (Backend)',
      location: 'Bengaluru',
      remote: false,
    });
    const b = dedupeKeyFor({
      company: 'razorpay software',
      title: 'SDE 1 Backend',
      location: 'Bangalore',
      remote: false,
    });
    expect(a).toBe(b);
  });
  it('treats remote placeholders as "remote"', () => {
    expect(
      dedupeKeyFor({ company: 'A', title: 'B', location: 'Remote / Worldwide', remote: true }).endsWith('|remote')
    ).toBe(true);
  });
});

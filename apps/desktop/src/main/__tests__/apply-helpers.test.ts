import { describe, expect, it } from 'vitest';
import { applyReviewOverrides, companyFromUrl, resolveJobMeta } from '../apply-helpers';
import type { MasterProfile } from '@job-automator/automation';

const base: MasterProfile = { firstName: 'Aarav', lastName: 'Sharma', email: 'a@x.com', phone: '+911234567890', sponsorship: 'No' };

describe('companyFromUrl', () => {
  it('reads the company slug from ATS URLs', () => {
    expect(companyFromUrl('https://jobs.lever.co/meesho/abc-123')).toBe('Meesho');
    expect(companyFromUrl('https://boards.greenhouse.io/stripe/jobs/9')).toBe('Stripe');
    expect(companyFromUrl('https://jobs.ashbyhq.com/open-ai/1')).toBe('Open Ai');
  });
  it('falls back to the site name and never throws on junk', () => {
    expect(companyFromUrl('https://careers.acme.com/jobs/1')).toBe('Acme');
    expect(companyFromUrl('not a url')).toBeNull();
  });
});

describe('resolveJobMeta', () => {
  it('prefers what the UI sent, then saved jobs, then the URL, and never invents a generic company', () => {
    const url = 'https://jobs.lever.co/meesho/1';
    expect(resolveJobMeta(url, { [url]: { company: 'Meesho', title: 'SDE' } })).toEqual({ company: 'Meesho', title: 'SDE' });
    expect(resolveJobMeta(url, undefined, () => ({ company: 'Saved Co', title: 'Saved Role' }))).toEqual({ company: 'Saved Co', title: 'Saved Role' });
    expect(resolveJobMeta(url)).toEqual({ company: 'Meesho', title: 'Application' });
    expect(resolveJobMeta(url, undefined, () => { throw new Error('db down'); }).company).toBe('Meesho');
  });
});

describe('applyReviewOverrides', () => {
  it('applies edited review fields to a copy without mutating the saved profile', () => {
    const out = applyReviewOverrides(base, { fullName: 'Asha Rao Iyer', phone: '+919999999999', sponsorship: 'Yes', workAuth: 'No', noticePeriod: '15 days', desiredSalary: '15 LPA', coverLetter: 'Hello' });
    expect(out).toMatchObject({ firstName: 'Asha', lastName: 'Rao Iyer', phone: '+919999999999', sponsorship: 'Yes', authorizedToWork: false, noticePeriod: '15 days', salary: '15 LPA', coverLetterText: 'Hello' });
    expect(base.firstName).toBe('Aarav');
    expect(base.sponsorship).toBe('No');
  });
  it('ignores blank edits and missing overrides', () => {
    expect(applyReviewOverrides(base, { email: '   ' }).email).toBe('a@x.com');
    expect(applyReviewOverrides(base, undefined)).toBe(base);
  });
});

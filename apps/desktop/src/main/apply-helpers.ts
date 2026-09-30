import type { MasterProfile } from '@job-automator/automation';

export type JobMeta = Record<string, { company?: string; title?: string }>;

/** Best-effort company guess from an ATS URL (jobs.lever.co/<company>/..., boards.greenhouse.io/<company>/...). */
export function companyFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean)[0];
    if (/lever\.co|greenhouse\.io|ashbyhq\.com|workable\.com|smartrecruiters\.com/.test(u.hostname) && seg) {
      return seg.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }
    const host = u.hostname.replace(/^(www|jobs|careers|boards)\./, '').split('.')[0];
    return host ? host.charAt(0).toUpperCase() + host.slice(1) : null;
  } catch {
    return null;
  }
}

/** Company/title for the application tracker: what the UI sent, else saved jobs, else inferred from the URL. */
export function resolveJobMeta(
  url: string,
  meta?: JobMeta,
  lookupSaved?: (url: string) => { company?: string; title?: string } | null,
): { company: string; title: string } {
  const given = meta?.[url];
  let company = given?.company?.trim() || '';
  let title = given?.title?.trim() || '';
  if (!company || !title) {
    try {
      const saved = lookupSaved?.(url);
      if (saved) {
        company = company || String(saved.company || '');
        title = title || String(saved.title || '');
      }
    } catch {}
  }
  return { company: company || companyFromUrl(url) || 'Unknown company', title: title || 'Application' };
}

/** Apply the values the user edited on the review screen to a copy of the profile for that one application. */
export function applyReviewOverrides(base: MasterProfile, o: Record<string, string> | undefined): MasterProfile {
  if (!o) return base;
  const p: MasterProfile = { ...base };
  const v = (k: string) => (o[k] ?? '').trim();
  if (v('fullName')) {
    const [first, ...rest] = v('fullName').split(/\s+/);
    p.firstName = first;
    p.lastName = rest.join(' ');
  }
  if (v('email')) p.email = v('email');
  if (v('phone')) p.phone = v('phone');
  if (v('linkedin')) p.linkedin = v('linkedin');
  if (v('github')) p.github = v('github');
  if (v('noticePeriod')) p.noticePeriod = v('noticePeriod');
  if (v('desiredSalary')) p.salary = v('desiredSalary');
  if (v('sponsorship')) p.sponsorship = v('sponsorship');
  if (v('workAuth')) p.authorizedToWork = /^y/i.test(v('workAuth'));
  if (v('coverLetter')) p.coverLetterText = v('coverLetter');
  return p;
}


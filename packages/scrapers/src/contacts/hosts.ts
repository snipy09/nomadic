import { baseDomain } from '@job-automator/email-verifier';

/**
 * Hosts that belong to job boards, ATS vendors and social sites. Their pages are not a
 * company's own site and their addresses are not a company's people, so the contact
 * scraper never treats them as either.
 */
const JOB_HOSTS = [
  'greenhouse.io', 'lever.co', 'ashbyhq.com', 'myworkdayjobs.com', 'myworkdaysite.com', 'workday.com',
  'smartrecruiters.com', 'internshala.com', 'linkedin.com', 'naukri.com', 'indeed.com', 'indeed.co.in', 'wellfound.com',
  'angel.co', 'instahyre.com', 'cutshort.io', 'foundit.in', 'monsterindia.com', 'glassdoor.com', 'glassdoor.co.in',
  'workable.com', 'breezy.hr', 'recruitee.com', 'keka.com', 'darwinbox.in', 'darwinbox.com', 'freshteam.com',
  'zohorecruit.com', 'zohorecruit.in', 'jobvite.com', 'icims.com', 'taleo.net', 'successfactors.com', 'sapsf.com',
  'bamboohr.com', 'teamtailor.com', 'personio.de', 'personio.com', 'rippling.com', 'rippling-ats.com', 'remoteok.com',
  'remoteok.io', 'weworkremotely.com', 'arbeitnow.com', 'jobicy.com', 'himalayas.app', 'ycombinator.com',
  'workatastartup.com', 'notion.site', 'notion.so', 'google.com', 'forms.gle', 'typeform.com', 'airtable.com',
  'github.com', 'github.io', 'gitlab.com', 'medium.com', 'twitter.com', 'x.com', 'facebook.com', 'instagram.com',
  'youtube.com', 'hirist.tech', 'hirist.com', 'iimjobs.com', 'shine.com', 'timesjobs.com', 'apna.co', 'unstop.com',
  'hackerearth.com', 'hackerrank.com', 'jobs.lever.co', 'gem.com', 'pinpointhq.com', 'jazzhr.com', 'applytojob.com',
  'hire.trakstar.com', 'recruiterbox.com', 'trakstar.com', 'dover.com', 'dover.io', 'polymer.co', 'workinstartups.com',
];

const JOB_HOST_SET = new Set(JOB_HOSTS);

/** True when the host (or its base domain) is a job board, ATS, form or social site. */
export function isJobBoardHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, '');
  if (JOB_HOST_SET.has(h) || JOB_HOST_SET.has(baseDomain(h))) return true;
  return JOB_HOSTS.some((d) => h.endsWith(`.${d}`));
}

/** Hostname of an absolute http(s) URL, or null. */
export function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

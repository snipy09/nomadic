/**
 * What kind of address something is, from the address alone. Role addresses (careers@,
 * hr.india@) reach a team inbox; personal ones reach one person.
 */

export type AddressType = 'personal' | 'role';

/** A role address when the first part of the local part is one of these. */
const ROLE_FIRST = new Set([
  'careers', 'career', 'jobs', 'job', 'hiring', 'hire', 'hr', 'humanresources', 'talent', 'talentacquisition',
  'recruit', 'recruiting', 'recruitment', 'recruiter', 'recruiters', 'people', 'peopleops', 'apply', 'applications',
  'application', 'applicants', 'resume', 'resumes', 'cv', 'cvs', 'intern', 'interns', 'internship', 'internships',
  'campus', 'campushiring', 'university', 'graduates', 'freshers', 'info', 'hello', 'hi', 'contact', 'contactus',
  'team', 'joinus', 'join', 'work', 'workwithus', 'placement', 'placements', 'admin', 'support', 'office', 'sales',
  'marketing', 'press', 'media', 'help', 'enquiry', 'enquiries', 'inquiries', 'inquiry', 'engineering', 'founders',
  'opportunities', 'openings', 'staffing', 'onboarding', 'ops', 'operations', 'general', 'mail', 'email',
]);
/** A role address when any part of the local part is one of these (eng-hiring@, india.jobs@). */
const ROLE_ANY = new Set(['hiring', 'jobs', 'careers', 'recruiting', 'recruitment', 'talent', 'hr', 'resume', 'resumes', 'cv', 'internships', 'apply', 'placements']);

const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.in', 'ymail.com', 'rocketmail.com', 'hotmail.com',
  'outlook.com', 'outlook.in', 'live.com', 'live.in', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com',
  'proton.me', 'protonmail.com', 'pm.me', 'rediffmail.com', 'zohomail.com', 'zohomail.in', 'gmx.com', 'gmx.de',
  'gmx.net', 'mail.com', 'yandex.com', 'yandex.ru', 'hey.com', 'fastmail.com', 'tutanota.com', 'tuta.io', 'inbox.com',
]);

export function localPart(email: string): string {
  const at = email.lastIndexOf('@');
  return (at < 0 ? email : email.slice(0, at)).toLowerCase();
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at < 0 ? '' : email.slice(at + 1).toLowerCase();
}

export function isRoleLocalPart(local: string): boolean {
  const base = local.toLowerCase().split('+')[0];
  if (ROLE_FIRST.has(base)) return true;
  const parts = base.split(/[._-]+|(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])/).filter(Boolean);
  if (parts.length === 0) return false;
  if (ROLE_FIRST.has(parts[0])) return true;
  return parts.some((p) => ROLE_ANY.has(p));
}

export function addressType(email: string): AddressType {
  return isRoleLocalPart(localPart(email)) ? 'role' : 'personal';
}

export function isFreeMailDomain(domain: string): boolean {
  return FREE_MAIL.has(domain.toLowerCase());
}

/**
 * The registrable part of a host, good enough to compare a company's site with an address
 * ("careers.acme.co.in" and "acme.co.in" both give "acme.co.in"). Not a full public-suffix list.
 */
export function baseDomain(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, '').split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  const twoLevel = /^(?:co|com|net|org|gov|edu|ac|res|gen|firm|ind)$/.test(parts[parts.length - 2]) && parts[parts.length - 1].length === 2;
  return parts.slice(twoLevel ? -3 : -2).join('.');
}

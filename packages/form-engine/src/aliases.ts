/**
 * Attribute aliases (name / id / autocomplete / data-automation-id) per profile key.
 * Moved here from packages/automation/src/alias-dictionary.ts (which re-exports it).
 * Matching is on whole normalized tokens, never substrings of free text.
 */
export const ATS_FIELD_ALIASES: Record<string, string[]> = {
  firstName: ['first_name', 'given-name', 'fname', 'first name', 'applicant_first_name', 'given name', 'firstname', 'legalnamesection_firstname'],
  lastName: ['last_name', 'family-name', 'lname', 'last name', 'applicant_last_name', 'family name', 'surname', 'lastname', 'familyname', 'legalnamesection_lastname'],
  fullName: ['name', 'full_name', 'full name', 'applicant_name', 'candidate_name', 'your name', '_systemfield_name', 'fullname'],
  email: ['email', 'e-mail', 'user_email', 'contact_email', 'email address', 'email_address', '_systemfield_email', 'contactemail'],
  phone: ['phone', 'mobile', 'telephone', 'phone_number', 'contact_phone', 'contact number', 'mobile number', 'tel', 'phone-number', 'cellphone', 'tel-national'],
  linkedin: ['linkedin', 'linkedin_url', 'linkedin-url', 'linkedin profile', 'urls[linkedin]', 'custom-question-linkedin-profile', 'custom-question-linkedin'],
  github: ['github', 'github_url', 'github-url', 'github profile', 'urls[github]', 'custom-question-github-profile', 'custom-question-github'],
  portfolio: ['portfolio', 'portfolio_url', 'portfolio-url', 'website', 'personal_website', 'personal_url', 'website_url', 'homepage', 'urls[portfolio]', 'custom-question-website', 'custom-question-portfolio', 'url'],
  twitter: ['twitter', 'urls[twitter]', 'twitter_url'],
  projects: ['project_link', 'project_url', 'projects_url', 'project_links', 'projects_link', 'live_demo', 'demo_link', 'deployed_url', 'work_sample', 'work_samples', 'code_sample', 'project url', 'project link', 'projects'],
  coverLetter: ['cover_letter', 'coverletter', 'cover-letter', 'why_us', 'why_hire', 'why_are_you_interested', 'additional_info', 'additional_information', 'why do you want', 'tell us about', 'comments'],
  sponsorship: ['sponsorship', 'require visa', 'future sponsorship', 'work authorization', 'require sponsorship', 'authorized to work'],
  salary: ['desired salary', 'expected salary', 'compensation expectations', 'salary expectation', 'pay expectation', 'desired compensation', 'expected compensation', 'ctc'],
  noticePeriod: ['notice period', 'start date', 'how soon can you start', 'availability', 'available from', 'earliest start date'],
  currentCompany: ['org', 'company', 'current_company', 'employer', 'organization'],
  location: ['location', '_systemfield_location', 'candidate-location', 'current_location'],
  city: ['city', 'addresssection_city', 'address-level2'],
  postalCode: ['postal', 'postal_code', 'postalcode', 'zip', 'zipcode', 'postal-code', 'addresssection_postalcode'],
  address: ['address', 'address_line_1', 'address-line1', 'addresssection_addressline1', 'street-address'],
  country: ['country', 'country-name'],
};

/** Normalize an attribute value into comparable tokens. */
export function attrTokens(v: string | undefined): string[] {
  if (!v) return [];
  const lower = v.toLowerCase().trim();
  const out = new Set<string>([lower]);
  // urls[LinkedIn] -> linkedin ; job_application[first_name] -> first_name
  const bracket = lower.match(/\[([^\]]+)\]\s*$/);
  if (bracket) out.add(bracket[1]);
  lower.split(/[^a-z0-9_-]+/).filter(Boolean).forEach((t) => out.add(t));
  return [...out];
}

export function aliasKeyForAttrs(attrs: Array<string | undefined>): string | undefined {
  const tokens = attrs.flatMap(attrTokens);
  for (const [key, aliases] of Object.entries(ATS_FIELD_ALIASES)) {
    if (['coverLetter', 'sponsorship', 'salary', 'noticePeriod', 'projects'].includes(key)) continue;
    if (aliases.some((a) => tokens.includes(a))) return key;
  }
  return undefined;
}

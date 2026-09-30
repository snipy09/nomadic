export interface RecruiterLead {
  company: string;
  name: string;
  email: string;
  role: string;
  department: 'Engineering' | 'Talent Acquisition' | 'Product' | 'Executive';
  tier: 'MNC' | 'Startup' | 'Scaleup';
  source: string;
  linkedinUrl?: string;
  isIndian?: boolean;
}

/**
 * Recruiter discovery is intentionally disabled.
 *
 * The previous implementation combined randomly chosen first/last names with real company email domains and
 * guessed address patterns, then labelled the results "verified". Those people do not exist, so mail to them
 * bounces (or reaches strangers) and hurts the sender's reputation. A real implementation needs a real source
 * (public team pages, a licensed contact database, or addresses that pass SMTP verification).
 *
 * Until then this returns no leads rather than invented ones.
 */
export async function scrapeRecruiterLeads(
  _targetCompanies: string[] = [],
  _targetRole: string = 'Software Engineer'
): Promise<RecruiterLead[]> {
  return [];
}

import { prefs } from '../store/preferences';

export type OpportunityType = 'job' | 'internship' | 'both';

export const OPPORTUNITY_TYPE_KEY = 'nomadic_target_opportunity_type';

export function normalizeOpportunityType(type?: string | null): OpportunityType {
  if (!type) return 'both';
  const clean = String(type).toLowerCase().trim();
  if (clean === 'job' || clean === 'jobs' || clean === 'full-time' || clean === 'fulltime') return 'job';
  if (clean === 'internship' || clean === 'internships' || clean === 'intern') return 'internship';
  return 'both';
}

export function getSavedOpportunityType(): OpportunityType {
  return prefs.getOppType() ?? 'both';
}

export function setSavedOpportunityType(type: OpportunityType): void {
  prefs.setOppType(type);
}

export function mapOpportunityTypeToFeedTab(type: OpportunityType): 'all' | 'jobs' | 'internships' {
  if (type === 'job') return 'jobs';
  if (type === 'internship') return 'internships';
  return 'all';
}

export function getOpportunityTypeLabel(type: OpportunityType): string {
  switch (type) {
    case 'job': return 'Full-Time Jobs';
    case 'internship': return 'Internships';
    case 'both': return 'Jobs & Internships';
  }
}

import { describe, it, expect } from 'vitest';
import { normalizeWorkspaceMode, getAvailableTracks, getDefaultTabForMode } from '../utils/workspace-mode';
import { normalizeOpportunityType, mapOpportunityTypeToFeedTab, getOpportunityTypeLabel } from '../utils/opportunity-type';

describe('Unified Workspace Helpers Suite', () => {
  it('normalizes workspace modes correctly', () => {
    expect(normalizeWorkspaceMode('learner_only')).toBe('learner_only');
    expect(normalizeWorkspaceMode('seeker_only')).toBe('seeker_only');
    expect(normalizeWorkspaceMode('unified')).toBe('unified');
    expect(normalizeWorkspaceMode(null)).toBe('unified');
    expect(getAvailableTracks('learner_only')).toEqual(['learner']);
    expect(getAvailableTracks('seeker_only')).toEqual(['seeker']);
    expect(getDefaultTabForMode('seeker_only')).toBe('feed');
  });

  it('normalizes opportunity types correctly', () => {
    expect(normalizeOpportunityType('job')).toBe('job');
    expect(normalizeOpportunityType('internship')).toBe('internship');
    expect(normalizeOpportunityType('both')).toBe('both');
    expect(mapOpportunityTypeToFeedTab('job')).toBe('jobs');
    expect(mapOpportunityTypeToFeedTab('internship')).toBe('internships');
    expect(mapOpportunityTypeToFeedTab('both')).toBe('all');
    expect(getOpportunityTypeLabel('job')).toBe('Full-Time Jobs');
  });
});

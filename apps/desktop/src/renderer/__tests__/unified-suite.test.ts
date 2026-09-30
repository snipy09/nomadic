import { describe, it, expect } from 'vitest';
import { normalizeWorkspaceMode, getAvailableTracks, getDefaultTabForMode } from '../utils/workspace-mode';
import { normalizeOpportunityType, mapOpportunityTypeToFeedTab, getOpportunityTypeLabel } from '../utils/opportunity-type';
import { createBatchReviewState, updateBatchFieldGlobal } from '../utils/batch-copilot-helpers';

describe('Unified Workspace & Co-Pilot Helpers Suite', () => {
  it('is seeker-only: any stored workspace mode resolves to the seeker workspace', () => {
    expect(normalizeWorkspaceMode('learner_only')).toBe('seeker_only');
    expect(normalizeWorkspaceMode('unified')).toBe('seeker_only');
    expect(normalizeWorkspaceMode(null)).toBe('seeker_only');
    expect(getAvailableTracks()).toEqual(['seeker']);
    expect(getDefaultTabForMode()).toBe('feed');
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

  it('handles batch co-pilot states and global field updates', () => {
    const snapshots = [
      { id: '1', company: 'Linear', jobTitle: 'Frontend Dev', applyUrl: 'https://ashby/1', fields: [{ fieldKey: 'noticePeriod', label: 'Notice', value: '2 weeks', fieldType: 'text' as const }], status: 'ready' as const },
      { id: '2', company: 'Stripe', jobTitle: 'Backend Dev', applyUrl: 'https://greenhouse/2', fields: [{ fieldKey: 'noticePeriod', label: 'Notice', value: '1 month', fieldType: 'text' as const }], status: 'ready' as const }
    ];
    const state = createBatchReviewState(snapshots);
    expect(state.applications.length).toBe(2);
    expect(state.allReadyToSubmit).toBe(true);

    const updated = updateBatchFieldGlobal(state, 'noticePeriod', 'Immediately (0 days)');
    expect(updated.applications[0].fields[0].value).toBe('Immediately (0 days)');
    expect(updated.applications[1].fields[0].value).toBe('Immediately (0 days)');
  });
});

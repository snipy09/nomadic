import { describe, expect, it } from 'vitest';
import {
  PLANS,
  formatPrice,
  getPlan,
  hasPlanAccess,
  isFeatureEnabled,
  normalizeTier,
  parseFeatureOverrides,
  pricingSentence,
  resolveFeatures,
} from '../index';

describe('plans', () => {
  it('match the product decision: Free ₹0 / Pro ₹249 / Max ₹599', () => {
    expect(PLANS.map((p) => [p.id, p.priceInr])).toEqual([
      ['free', 0],
      ['pro', 249],
      ['max', 599],
    ]);
    expect(pricingSentence()).toBe('Free costs ₹0. Pro is ₹249 a month and Max is ₹599 a month.');
    expect(formatPrice(1499)).toBe('₹1,499');
    expect(PLANS.filter((p) => p.featured).map((p) => p.id)).toEqual(['pro']);
  });
  it('free Learn limits are 1 track + 10 practice/day', () => {
    expect(getPlan('free').limits).toMatchObject({ learnTracks: 1, practicePerDay: 10 });
    expect(getPlan('pro').limits.practicePerDay).toBe(Infinity);
  });
  it('no plan advertises a hidden feature', () => {
    const text = PLANS.flatMap((p) => p.features)
      .join(' ')
      .toLowerCase();
    expect(text).not.toMatch(/outreach|recruiter|vault|opportunit/);
  });
});

describe('tiers', () => {
  it('normalizes stored tiers', () => {
    expect(['trial', '', null, 'pro', 'seeker', 'lifetime', 'MAX'].map((t) => normalizeTier(t))).toEqual([
      'free',
      'free',
      'free',
      'pro',
      'pro',
      'max',
      'max',
    ]);
    expect(hasPlanAccess('pro', 'pro')).toBe(true);
    expect(hasPlanAccess('pro', 'max')).toBe(false);
  });
});

describe('feature flags', () => {
  it('hide Outreach, Resource Vault and Opportunity Board by default', () => {
    expect(isFeatureEnabled('outreach')).toBe(false);
    expect(isFeatureEnabled('resourceVault')).toBe(false);
    expect(isFeatureEnabled('opportunityBoard')).toBe(false);
    expect(isFeatureEnabled('learn')).toBe(true);
  });
  it('parses overrides and ignores unknown keys', () => {
    expect(parseFeatureOverrides('outreach=on, learn=off, bogus=on')).toEqual({ outreach: true, learn: false });
    expect(resolveFeatures('resourceVault').resourceVault).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { MasterProfileSchema, parseProfile, profileFullName, profileRequiresSponsorship, validateProfile } from '../profile.js';

describe('MasterProfile schema', () => {
  const base = { firstName: 'Jordan', lastName: 'Rivera', email: 'j@example.com', phone: '+1 512 555 0142' };

  it('accepts a minimal profile and keeps optional fields', () => {
    const res = validateProfile({ ...base, yearsOfExperience: 4, resumes: [{ name: 'a', targetRole: 'SWE', filePath: '/x.pdf', isDefault: true }] });
    expect(res.success).toBe(true);
    expect(res.profile?.yearsOfExperience).toBe(4);
  });

  it('accepts the legacy shape used by the desktop app (empty strings, callbacks, answer maps)', () => {
    const res = validateProfile({ ...base, email: '', linkedin: '', customAnswers: { q: 'a' }, cachedAnswers: {}, onAnswerResolved: () => {} });
    expect(res.success).toBe(true);
  });

  it('rejects missing required fields and bad types with readable paths', () => {
    const res = validateProfile({ firstName: 'J', email: 'not-an-email', phone: 5 });
    expect(res.success).toBe(false);
    const paths = res.errors.map((e) => e.path);
    expect(paths).toEqual(expect.arrayContaining(['lastName', 'email', 'phone']));
  });

  it('rejects negative years of experience and non-function callbacks', () => {
    expect(validateProfile({ ...base, yearsOfExperience: -1 }).success).toBe(false);
    expect(validateProfile({ ...base, onAnswerResolved: 'nope' }).success).toBe(false);
  });

  it('parseProfile throws with details', () => {
    expect(() => parseProfile({ firstName: 'x' })).toThrow(/Invalid profile: .*lastName/);
    expect(parseProfile(base).firstName).toBe('Jordan');
  });

  it('derives full name and sponsorship from typed and legacy fields', () => {
    expect(profileFullName(MasterProfileSchema.parse(base))).toBe('Jordan Rivera');
    expect(profileRequiresSponsorship({ ...base, sponsorship: 'No' })).toBe(false);
    expect(profileRequiresSponsorship({ ...base, sponsorship: 'Yes, H-1B' })).toBe(true);
    expect(profileRequiresSponsorship({ ...base, sponsorship: 'No', requiresSponsorship: true })).toBe(true);
    expect(profileRequiresSponsorship(base)).toBeUndefined();
  });
});

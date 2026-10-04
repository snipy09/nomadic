import { describe, expect, it } from 'vitest';
import { completeness, parseSkills, toForm, toMasterProfile, validate } from '../features/profile/profileForm';

describe('toForm never invents data', () => {
  it('returns empty values for an empty profile', () => {
    const f = toForm(null, null);
    expect(f.targetRole).toBe('');
    expect(f.yearsOfExperience).toBeNull();
    expect(f.expectedSalary).toBe('');
    expect(f.skills).toEqual([]);
    expect(f.noticePeriod).toBe('');
  });
  it('falls back to the signed-in user for name and email only', () => {
    const f = toForm({}, { fullName: 'Asha Rao', email: 'a@b.co' });
    expect([f.fullName, f.email, f.phone]).toEqual(['Asha Rao', 'a@b.co', '']);
  });
  it('reads skills from a techStack string and de-duplicates', () => {
    expect(parseSkills('React, react , Node,,')).toEqual(['React', 'Node']);
  });
});

describe('toMasterProfile', () => {
  const base = { firstName: 'A', lastName: 'B', email: 'x@y.zz', phone: '', linkedin: '', github: '', sponsorship: 'No', desiredSalary: '', noticePeriod: '', resumeText: 'RESUME', customAnswers: { q: 'a' }, groqApiKey: 'k' } as any;
  it('saves what the user entered and nothing more', () => {
    const f = toForm(base, null);
    const out = toMasterProfile({ ...f, fullName: 'Asha Kumari Rao', targetRole: 'SDE' }, base);
    expect(out.firstName).toBe('Asha');
    expect(out.lastName).toBe('Kumari Rao');
    expect(out.desiredSalary).toBe('');
    expect(out.noticePeriod).toBe('');
    expect(out.resumeText).toBe('RESUME');
    expect(out.groqApiKey).toBe('k');
  });
  it('always requires review before submit and keeps other answers', () => {
    const out = toMasterProfile(toForm(base, null), base);
    expect(out.askBeforeSubmit).toBe(true);
    expect(out.customAnswers).toMatchObject({ q: 'a', work_authorized: 'Yes' });
  });
  it('round-trips work authorization without leaking it into answers', () => {
    const out = toMasterProfile({ ...toForm(base, null), workAuthorized: false }, base);
    const f = toForm(out, null);
    expect(f.workAuthorized).toBe(false);
    expect(f.answers).toEqual({ q: 'a' });
  });
});

describe('profile facts kept in the answers map', () => {
  const base = { firstName: 'A', lastName: 'B', email: 'x@y.zz', customAnswers: { q: 'a' } } as any;
  it('saves location, country, preferred name, portfolio and years, and reads them back', () => {
    const f = { ...toForm(base, null), location: 'Pune, Maharashtra', country: 'India', preferredName: 'Ash', portfolio: 'ash.dev', yearsOfExperience: 0 };
    const out = toMasterProfile(f, base);
    expect(out.customAnswers).toMatchObject({ q: 'a', __profile_location: 'Pune, Maharashtra', __profile_country: 'India', __profile_preferred_name: 'Ash', __profile_portfolio: 'ash.dev', __profile_years: '0' });
    const back = toForm({ customAnswers: out.customAnswers } as any, null);
    expect([back.location, back.country, back.preferredName, back.portfolio, back.yearsOfExperience]).toEqual(['Pune, Maharashtra', 'India', 'Ash', 'ash.dev', 0]);
    expect(back.answers).toEqual({ q: 'a' });
  });
  it('drops cleared values instead of storing empty strings', () => {
    const saved = toMasterProfile({ ...toForm(base, null), country: 'India' }, base);
    const cleared = toMasterProfile({ ...toForm(saved, null), country: '' }, saved);
    expect(cleared.customAnswers).not.toHaveProperty('__profile_country');
  });
});

describe('validate and completeness', () => {
  it('flags bad email, links and experience', () => {
    const f = { ...toForm(null, null), fullName: 'A', email: 'nope', linkedin: 'example.com/in/a', github: 'github.com/a', yearsOfExperience: 99 };
    expect(Object.keys(validate(f)).sort()).toEqual(['email', 'linkedin', 'yearsOfExperience']);
  });
  it('accepts links without a scheme', () => {
    expect(validate({ ...toForm(null, null), fullName: 'A', email: 'a@b.co', linkedin: 'linkedin.com/in/a' })).toEqual({});
  });
  it('reports what is missing', () => {
    expect(completeness(toForm(null, null))).toEqual({ percent: 0, missing: ['Name', 'Email', 'Target role', 'Skills', 'Profile link'] });
    expect(completeness({ ...toForm(null, { fullName: 'A', email: 'a@b.co' }), targetRole: 'SDE', skills: ['C'], github: 'github.com/a' }).percent).toBe(100);
  });
});

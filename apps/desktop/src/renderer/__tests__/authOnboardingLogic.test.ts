import { describe, expect, it } from 'vitest';
import { BAD_CREDENTIALS, friendlyAuthError, validateAuth } from '../features/auth/authForm';
import {
  ROLE_OPTIONS, STEPS, applyReadinessErrors, buildOnboardingProfile, stepErrors, suggestedSkills, toggleSkill,
} from '../features/onboarding/onboardingLogic';
import { toForm } from '../features/profile/profileForm';
import { profileMastery } from '../features/feed/match';

const blank = { fullName: '', email: '', password: '' };

describe('validateAuth', () => {
  it('requires email, password and terms to sign in', () => {
    expect(validateAuth('signin', blank, false)).toEqual({
      email: 'Enter your email.',
      password: 'Enter your password.',
      terms: 'Accept the terms to continue.',
    });
  });

  it('does not ask for a name or a minimum length when signing in', () => {
    expect(validateAuth('signin', { fullName: '', email: 'a@b.co', password: 'x' }, true)).toEqual({});
  });

  it('requires a name and a 6+ character password to sign up', () => {
    const e = validateAuth('signup', { fullName: ' ', email: 'a@b', password: '12345' }, true);
    expect(e.fullName).toBe('Enter your name.');
    expect(e.email).toBe('Enter a valid email address.');
    expect(e.password).toBe('Use at least 6 characters.');
    expect(validateAuth('signup', { fullName: 'Asha', email: 'a@b.co', password: '123456' }, true)).toEqual({});
  });
});

describe('friendlyAuthError', () => {
  it('collapses every credential-related sign-in error into one message', () => {
    for (const raw of ['Incorrect email or password.', 'Incorrect password.', 'User not found', 'No account for this email', 'Please sign in with the email address your license was issued to.']) {
      expect(friendlyAuthError('signin', raw)).toBe(BAD_CREDENTIALS);
    }
  });

  it('keeps actionable non-credential messages', () => {
    expect(friendlyAuthError('signin', 'Too many failed attempts. Try again in 15 minutes.')).toBe('Too many failed attempts. Try again in 15 minutes.');
    expect(friendlyAuthError('signup', 'Password must be at least 6 characters.')).toBe('Password must be at least 6 characters.');
  });

  it('gives a generic retry message when there is no error text', () => {
    expect(friendlyAuthError('signin', undefined)).toBe('Sign-in failed. Please try again.');
    expect(friendlyAuthError('signup', '')).toBe('Sign-up failed. Please try again.');
  });
});

describe('onboarding steps', () => {
  it('has four steps in order', () => {
    expect(STEPS.map((s) => s.id)).toEqual(['about', 'target', 'resume', 'workspace']);
  });

  it('only checks the fields shown on the current step', () => {
    const form = toForm(null);
    expect(stepErrors('about', form)).toEqual({ fullName: 'Enter your name.', email: 'Enter your email.' });
    expect(stepErrors('target', form)).toEqual({});
    expect(stepErrors('workspace', form)).toEqual({});
  });

  it('offers catalogue roles and their skills, nothing for unknown roles', () => {
    expect(ROLE_OPTIONS).toContain('Frontend Engineer');
    expect(ROLE_OPTIONS).toContain('Data Analyst');
    const fe = suggestedSkills('frontend engineer');
    expect(fe.length).toBeGreaterThan(0);
    expect(fe).toContain('JavaScript Fundamentals');
    // Picked suggestions must be recognised by Feed matching (same catalogue).
    expect(Object.keys(profileMastery({ techStack: fe.join(', ') })).length).toBe(fe.length);
    expect(suggestedSkills('Astronaut')).toEqual([]);
  });

  it('toggles skills case-insensitively', () => {
    expect(toggleSkill(['React'], 'Python')).toEqual(['React', 'Python']);
    expect(toggleSkill(['React', 'Python'], 'python')).toEqual(['React']);
  });
});

describe('buildOnboardingProfile', () => {
  it('saves only what the user entered and keeps fields onboarding does not own', () => {
    const base = { resumeText: 'from parser', groqApiKey: 'k', desiredSalary: '' } as any;
    const form = { ...toForm(base), fullName: 'Asha Rao', email: 'asha@example.com', targetRole: 'Data Analyst', skills: ['SQL'] };
    const p = buildOnboardingProfile(form, base, []);
    expect(p.firstName).toBe('Asha');
    expect(p.lastName).toBe('Rao');
    expect(p.desiredTitle).toBe('Data Analyst');
    expect(p.techStack).toBe('SQL');
    expect(p.desiredSalary).toBe('');
    expect(p.phone).toBe('');
    expect(p.resumeText).toBe('from parser');
    expect(p.groqApiKey).toBe('k');
    expect(p.resumeFilePath).toBe(undefined);
  });

  it('uses the default resume path when one was uploaded', () => {
    const resumes = [
      { id: 1, name: 'a.pdf', targetRole: '', filePath: 'C:/a.pdf', isDefault: false },
      { id: 2, name: 'b.pdf', targetRole: '', filePath: 'C:/b.pdf', isDefault: true },
    ];
    expect(buildOnboardingProfile(toForm(null), null, resumes).resumeFilePath).toBe('C:/b.pdf');
  });
});

describe('applyReadinessErrors', () => {
  it('requires name, email, phone and a resume, and invents none of them', () => {
    const e = applyReadinessErrors(toForm(null), false);
    expect(Object.keys(e).sort()).toEqual(['email', 'fullName', 'phone', 'resume']);
    const ready = { ...toForm(null), fullName: 'Asha', email: 'a@b.co', phone: '+91 98765 43210' };
    expect(applyReadinessErrors(ready, true)).toEqual({});
  });
});

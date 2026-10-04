import { describe, expect, it } from 'vitest';
import { extractResumeFacts, mergeMissing } from '../features/answers/resumeFacts';

const RESUME = `Aarav Sharma
aarav.sharma@example.com | +91 98765 43210 | linkedin.com/in/aarav-sharma | github.com/aaravs/projects | https://aarav.dev
EDUCATION
National Institute of Technology, Tiruchirappalli 2022 - 2026
B.Tech in Computer Science and Engineering, CGPA: 8.42/10
SKILLS
Python, JavaScript, React, SQL, Git
Languages: English, Hindi, Tamil`;

describe('extractResumeFacts', () => {
  const f = extractResumeFacts(RESUME, new Date('2026-10-04'));

  it('reads contact details and links', () => {
    expect(f.email).toBe('aarav.sharma@example.com');
    expect(f.phone).toBe('+91 98765 43210');
    expect(f.linkedin).toBe('https://linkedin.com/in/aarav-sharma');
    expect(f.github).toBe('https://github.com/aaravs');
    expect(f.portfolio).toBe('https://aarav.dev');
  });

  it('reads education facts', () => {
    expect(f.answers).toMatchObject({
      degree: 'B.Tech',
      field_of_study: 'Computer Science and Engineering',
      university: 'National Institute of Technology, Tiruchirappalli',
      graduation_year: '2026',
      gpa: '8.42 / 10',
      languages: 'English, Hindi, Tamil',
    });
  });

  it('tags skills from the shared catalogue', () => {
    expect(f.skills.length).toBeGreaterThan(0);
  });

  it('returns nothing it did not find', () => {
    const none = extractResumeFacts('Hello world. I like building things.');
    expect(none.answers).toEqual({});
    expect(none.email).toBeUndefined();
    expect(none.linkedin).toBeUndefined();
  });
});

describe('mergeMissing', () => {
  it('fills only empty values', () => {
    expect(mergeMissing({ a: 'typed', b: '' }, { a: 'found', b: 'found', c: undefined })).toEqual({ a: 'typed', b: 'found' });
  });
});

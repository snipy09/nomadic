import { describe, expect, it } from 'vitest';
import { classifyRoleFamily, classifySeniority, refineEmploymentType } from '../pipeline/classify.js';

describe('classifyRoleFamily', () => {
  it.each([
    ['Senior Frontend Engineer (React)', 'frontend'],
    ['Backend Engineer, Payments', 'backend'],
    ['Full-Stack Developer', 'full_stack'],
    ['Data Analyst Intern', 'data_analyst'],
    ['Machine Learning Engineer', 'data_ml'],
    ['Data Scientist II', 'data_ml'],
    ['Associate Product Manager', 'product_manager'],
    ['Product Designer', 'design'],
    ['UX Researcher', 'design'],
    ['Site Reliability Engineer', 'devops'],
    ['Platform Engineer - Kubernetes', 'devops'],
    ['Account Executive', 'other'],
    ['Recruiter', 'other'],
  ])('%s -> %s', (title, family) => {
    expect(classifyRoleFamily(title)).toBe(family);
  });

  it('uses the description to place generic engineering titles', () => {
    expect(classifyRoleFamily('Software Engineer', 'You will build React and TypeScript UI with CSS and HTML.')).toBe(
      'frontend'
    );
    expect(classifyRoleFamily('Software Engineer', 'APIs, Postgres, Kafka and distributed systems.')).toBe('backend');
    expect(
      classifyRoleFamily('Software Engineer', 'react css html typescript api postgres database microservices')
    ).toBe('full_stack');
    expect(classifyRoleFamily('Software Engineer')).toBe('backend');
  });
});

describe('classifySeniority', () => {
  it.each([
    ['Software Engineering Intern', 'unknown', 'intern'],
    ['Backend Engineer', 'internship', 'intern'],
    ['Staff Engineer', 'full_time', 'lead'],
    ['Engineering Lead', 'full_time', 'lead'],
    ['Senior Data Analyst', 'full_time', 'senior'],
    ['Sr. Designer', 'full_time', 'senior'],
    ['Junior Developer', 'full_time', 'entry'],
    ['Software Engineer I', 'full_time', 'entry'],
    ['SDE-2', 'full_time', 'mid'],
    ['Product Manager', 'full_time', 'unknown'],
  ] as const)('%s (%s) -> %s', (title, type, expected) => {
    expect(classifySeniority(title, type)).toBe(expected);
  });

  it('marks unknown employment types of interns as internships', () => {
    expect(refineEmploymentType('unknown', 'intern')).toBe('internship');
    expect(refineEmploymentType('full_time', 'intern')).toBe('full_time');
    expect(refineEmploymentType('unknown', 'senior')).toBe('unknown');
  });
});

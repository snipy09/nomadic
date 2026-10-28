import { describe, expect, it } from 'vitest';
import { allProjects } from '../features/learn/catalog';
import { INTAKE_STEPS, intakeRecap, intakeStreamLabel, intakeSteps, levelStreams, roleStreams, stepProblem, weeklyMinutes } from '../features/learn/intakeSteps';
import { defaultIntakeDraft } from '../features/learn/learnModel';
import { DEFAULT_FILTERS, cardHours, filterCards, kindCounts, libraryCards, sortCards } from '../features/projects/projectsLogic';

const draft = defaultIntakeDraft('fullstack', '2026-10-05');

describe('intake pages', () => {
  it('Learn asks everything, one question per page, ending on the summary', () => {
    const steps = intakeSteps('full', draft);
    expect(steps[0]).toBe('role');
    expect(steps.at(-1)).toBe('summary');
    expect(new Set(steps).size).toBe(steps.length);
    for (const s of steps) expect(INTAKE_STEPS[s].title.length).toBeGreaterThan(0);
  });

  it('onboarding asks the short version', () => {
    const steps = intakeSteps('short', draft);
    expect(steps).not.toContain('extras');
    expect(steps).not.toContain('focus');
    expect(steps.at(-1)).toBe('summary');
  });

  it('never asks product or design students about DSA or Core CS', () => {
    for (const role of ['product-manager', 'design'] as const) {
      const d = { ...draft, role, aim: 'campus' as const };
      expect(roleStreams(role)).not.toContain('dsa');
      expect(roleStreams(role)).not.toContain('core_cs');
      expect(levelStreams(d)).toEqual(['dev', 'aptitude']);
      const recap = intakeRecap(d, intakeSteps('full', d)).map((r) => r.value).join(' ');
      expect(recap).not.toMatch(/DSA|Core CS/);
    }
    expect(intakeStreamLabel('dev', 'product-manager')).toBe('Product skills');
    expect(stepProblem('focus', { ...draft, role: 'product-manager', streams: ['dsa', 'core_cs'] })).toMatch(/at least one/);
  });

  it('keeps every stream for engineering roles', () => {
    expect(levelStreams({ role: 'fullstack', aim: 'campus' })).toEqual(['dsa', 'core_cs', 'dev', 'aptitude']);
    expect(levelStreams({ role: 'fullstack', aim: 'offcampus' })).toEqual(['dsa', 'core_cs', 'dev']);
    expect(intakeStreamLabel('dev', 'fullstack')).toBe('Development');
  });

  it('skips the DSA language for roles without DSA', () => {
    expect(intakeSteps('full', { ...draft, role: 'design' })).not.toContain('language');
    expect(intakeSteps('full', { ...draft, role: 'product-manager' })).not.toContain('language');
    expect(intakeSteps('full', draft)).toContain('language');
  });

  it('blocks a page until it is answered', () => {
    expect(stepProblem('role', draft, false)).toMatch(/pick the role/i);
    expect(stepProblem('role', draft, true)).toBeNull();
    expect(stepProblem('schedule', { ...draft, studyDays: [] })).toMatch(/study day/i);
    expect(stepProblem('schedule', { ...draft, weekdayMinutes: 0 })).toMatch(/time/i);
    expect(stepProblem('schedule', { ...draft, studyDays: [0, 6], weekdayMinutes: 0 })).toBeNull();
    expect(stepProblem('focus', { ...draft, streams: [] })).toMatch(/at least one/i);
    expect(stepProblem('aim', draft)).toBeNull();
  });

  it('adds up a week of study time', () => {
    expect(weeklyMinutes(draft)).toBe(5 * 60 + 2 * 150);
    expect(weeklyMinutes({ ...draft, studyDays: [1, 3] })).toBe(120);
  });

  it('recaps every answer in plain words', () => {
    const rows = intakeRecap(draft, intakeSteps('full', draft));
    expect(rows.map((r) => r.step)).toEqual(['role', 'aim', 'duration', 'schedule', 'level', 'language', 'focus', 'extras']);
    expect(rows.find((r) => r.step === 'role')!.value).toBe('Full Stack Engineer');
    expect(rows.find((r) => r.step === 'schedule')!.value).toContain('Every day');
    expect(rows.find((r) => r.step === 'extras')!.value).toBe('None');
    const aptitude = intakeRecap({ ...draft, aim: 'offcampus' }, ['level'])[0].value;
    expect(aptitude).not.toMatch(/aptitude/i);
  });
});

describe('project library', () => {
  const cards = libraryCards(allProjects());

  it('holds thousands of projects with unique ids, curated ones first', () => {
    expect(cards.length).toBeGreaterThan(2000);
    expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
    expect(cards[0].curated).toBe(true);
    expect(cards.every((c) => c.minutes > 0 && c.stages >= 3)).toBe(true);
  });

  it('filters by kind, level, role, length and every search word', () => {
    const backend = filterCards(cards, { ...DEFAULT_FILTERS, kind: 'backend', level: 'beginner' });
    expect(backend.length).toBeGreaterThan(100);
    expect(backend.every((c) => c.kind === 'backend' && c.level === 'beginner')).toBe(true);
    const search = filterCards(cards, { ...DEFAULT_FILTERS, query: 'expense FASTAPI' });
    expect(search.length).toBeGreaterThan(0);
    expect(search.every((c) => c.search.includes('expense') && c.search.includes('fastapi'))).toBe(true);
    const short = filterCards(cards, { ...DEFAULT_FILTERS, hours: 'lt10' });
    expect(short.every((c) => cardHours(c) < 10)).toBe(true);
    const role = filterCards(cards, { ...DEFAULT_FILTERS, role: 'data-analyst' });
    expect(role.every((c) => c.roles.includes('data-analyst'))).toBe(true);
    expect(filterCards(cards, { ...DEFAULT_FILTERS, query: 'zzzz-nothing' })).toEqual([]);
  });

  it('sorts the student role first, then curated, then easier', () => {
    const sorted = sortCards(cards, 'data-analyst');
    const firstOther = sorted.findIndex((c) => !c.roles.includes('data-analyst'));
    expect(sorted.slice(0, firstOther).every((c) => c.roles.includes('data-analyst'))).toBe(true);
    expect(sortCards(cards, null)[0].curated).toBe(true);
  });

  it('counts cards per kind', () => {
    const counts = kindCounts(cards);
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(cards.length);
    expect(counts.get('frontend')).toBeGreaterThan(0);
  });
});

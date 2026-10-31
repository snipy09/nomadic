import { describe, expect, it } from 'vitest';
import { buildPrompt, buildProjectHelpPrompt, checkOutput, parseProxyRequest } from '../../functions/ai-proxy/core.ts';

const USER = '11111111-2222-4333-8444-555555555555';
const envelope = (kind: string, payload: unknown) => ({ kind, user_id: USER, session_token: 'tok', device_fingerprint: 'dev', payload });

describe('roadmap_plan: whole-role tree (Learn v3)', () => {
  const req = parseProxyRequest(envelope('roadmap_plan', { format: 'tree', role: '  Quant trader ', level: 'beginner', note: 'I know Python' }));

  it('parses any role with a level and a note', () => {
    expect(req).toMatchObject({ kind: 'roadmap_plan', payload: { format: 'tree', role: 'Quant trader', level: 'beginner', note: 'I know Python' } });
    expect(() => parseProxyRequest(envelope('roadmap_plan', { format: 'tree', role: 'x', level: 'beginner' }))).toThrow(/role/);
    expect(() => parseProxyRequest(envelope('roadmap_plan', { format: 'tree', role: 'Quant trader', level: 'expert' }))).toThrow(/level/);
  });

  it('asks for subjects → modules → topics with a search phrase each, and 5 projects, with a longer time limit', () => {
    const p = buildPrompt(req);
    expect(p.system).toMatch(/SUBJECTS/);
    expect(p.system).toMatch(/exactly 5 PROJECTS/);
    expect(p.system).toMatch(/any job, in any field/);
    expect(JSON.parse(p.user)).toEqual({ ROLE: 'Quant trader', LEVEL: 'beginner', NOTE: 'I know Python' });
    expect(JSON.stringify(p.schema)).toContain('"search"');
    expect(p.timeoutMs).toBeGreaterThan(25_000);
  });

  it('keeps subjects that have topics and rejects a reply without any', () => {
    const out = checkOutput(req, {
      summary: 'x',
      subjects: [{ title: 'Maths', why: '', modules: [{ title: 'Probability', summary: '', topics: [{ title: 'Basics', covers: '', search: 'basics' }] }] }, { title: 'Empty', modules: [] }],
      projects: [{ title: 'P' }],
    }) as { subjects: unknown[]; projects: unknown[] };
    expect(out.subjects).toHaveLength(1);
    expect(out.projects).toHaveLength(1);
    expect(() => checkOutput(req, { subjects: [] })).toThrow();
    expect(() => checkOutput(req, { nope: true })).toThrow();
  });

  it('still parses the catalogue roadmap request (Learn v2)', () => {
    expect(() => parseProxyRequest(envelope('roadmap_plan', { intake: {} }))).toThrow(/intake/);
  });
});

describe('roadmap_plan: capstone plan', () => {
  const req = parseProxyRequest(
    envelope('roadmap_plan', {
      format: 'capstone',
      role: 'Digital marketer',
      level: 'beginner',
      project: { title: 'Campaign plan for a coaching institute', brief: 'Plan a launch', deliverable: 'A 6-page plan', level: 'starter', hours: 12 },
      modules: ['Campaigns and metrics'],
    })
  );
  it('builds a milestone and step plan with "done when" checks', () => {
    const p = buildPrompt(req);
    expect(p.system).toMatch(/MILESTONES/);
    expect(JSON.stringify(p.schema)).toContain('done_when');
    const out = checkOutput(req, { milestones: [{ title: 'Research', steps: [{ title: 'List competitors', detail: '', done_when: 'x', search: 'y' }] }, { title: 'Empty', steps: [] }] }) as { milestones: unknown[] };
    expect(out.milestones).toHaveLength(1);
    expect(() => checkOutput(req, { milestones: [] })).toThrow();
  });
});

describe('project_help: any role', () => {
  const base = { project: 'Campaign plan', stack: 'Google Sheets', stage: 'Research', goal: 'Know the market', question: 'How do I size the audience?' };
  it('mentors for the student\'s role when one is given', () => {
    const req = parseProxyRequest(envelope('project_help', { ...base, role: 'Digital marketer' }));
    expect(req.payload).toMatchObject({ role: 'Digital marketer' });
    expect(buildProjectHelpPrompt(req.payload as never).system).toMatch(/preparing to become a Digital marketer/);
  });
  it('keeps the engineering mentor without a role', () => {
    const req = parseProxyRequest(envelope('project_help', base));
    expect(buildProjectHelpPrompt(req.payload as never).system).toMatch(/senior engineer/);
  });
});

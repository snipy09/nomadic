import { describe, expect, it } from 'vitest';
import { buildSeedBundle, validateContentBundle, type ContentBundle } from '../src';
import { mod, prob, topic } from './v2-fixtures';

const base = (): ContentBundle => {
  const b = buildSeedBundle();
  return {
    ...b,
    modules: [mod('x.a', { skill_ids: ['dsa'] }), mod('x.b', { prerequisites: [{ module_id: 'x.a', kind: 'hard' }] })],
    topics: [topic('x.a.t', 'x.a', { problems: { must: ['lc:two-sum'], good: [], stretch: [] } }), topic('x.b.t', 'x.b')],
    problems: [prob('two-sum', 'easy')],
    projects: [],
  };
};
const errorsOf = (b: ContentBundle) => validateContentBundle(b).errors;

describe('v2 content validation', () => {
  it('accepts a consistent catalogue', () => expect(errorsOf(base())).toEqual([]));
  it('rejects an unknown module prerequisite', () => {
    const b = base();
    b.modules[1] = mod('x.b', { prerequisites: [{ module_id: 'ghost', kind: 'hard' }] });
    expect(errorsOf(b).join()).toMatch(/unknown module ghost/);
  });
  it('rejects a module cycle', () => {
    const b = base();
    b.modules[0] = mod('x.a', { prerequisites: [{ module_id: 'x.b', kind: 'soft' }] });
    expect(errorsOf(b).join()).toMatch(/cycle/);
  });
  it('rejects a problem that is not in the dataset', () => {
    const b = base();
    b.topics[0] = topic('x.a.t', 'x.a', { problems: { must: ['lc:ghost'], good: [], stretch: [] } });
    expect(errorsOf(b).join()).toMatch(/not in the dataset/);
  });
  it('rejects a paid-only problem outside stretch', () => {
    const b = base();
    b.problems = [prob('two-sum', 'easy', { paid_only: true })];
    expect(errorsOf(b).join()).toMatch(/paid-only/);
  });
  it('rejects unknown topic resources', () => {
    const b = base();
    b.topics[1] = topic('x.b.t', 'x.b', { resource_ids: ['ghost'] });
    expect(errorsOf(b).join()).toMatch(/unknown resource ghost/);
  });
  it('rejects a module without topics', () => {
    const b = base();
    b.topics = [b.topics[0]];
    expect(errorsOf(b).join()).toMatch(/x.b has no topics/);
  });
  it('rejects a topic outside its module prefix', () => {
    const b = base();
    b.topics[1] = topic('y.t', 'x.b');
    expect(errorsOf(b).join()).toMatch(/must start with its module id/);
  });
});

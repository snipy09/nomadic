import { describe, expect, it } from 'vitest';
import { runBench } from '../bench.js';
import { pickOptionIndex } from '../answerer.js';

describe('form engine benchmark (local ATS-style fixtures)', () => {
  it('meets the accuracy gate: >=90% correct, <2% wrong answers, no fixture below 75%', async () => {
    const r = await runBench();
    const detail = r.scores.flatMap((s) => s.failures.map((f) => `${s.fixture}: ${f}`)).join('\n');
    expect(r.accuracy, detail).toBeGreaterThanOrEqual(0.9);
    expect(r.wrongRate, detail).toBeLessThan(0.02);
    for (const s of r.scores) expect(s.correct / s.total, `${s.fixture}\n${detail}`).toBeGreaterThanOrEqual(0.75);
  }, 120000);

  it('never reports a form as submittable while a required unknown question is unanswered', async () => {
    const r = await runBench();
    for (const name of ['greenhouse-classic', 'internshala', 'workable-style']) {
      expect(r.scores.find((s) => s.fixture === name)!.canSubmit, name).toBe(false);
    }
  }, 120000);
});

describe('pickOptionIndex', () => {
  it('prefers exact, then prefix, then contains', () => {
    expect(pickOptionIndex(['Select', 'India', 'Indonesia'], 'India')).toBe(1);
    expect(pickOptionIndex(['Yes, I do', 'No, I do not'], 'No')).toBe(1);
  });
  it('returns -1 for no plausible match', () => {
    expect(pickOptionIndex(['Red', 'Blue'], 'Purple')).toBe(-1);
  });
});

import { describe, expect, it } from 'vitest';
import { PROMPT_MAX, chatGptUrl, stepPrompt, topicPrompt, youtubeSearchUrl } from '../features/learn/learnLinks';

describe('per-topic learn links', () => {
  const ctx = {
    role: 'Quant trader',
    level: 'beginner' as const,
    subject: 'Mathematics',
    module: 'Probability',
    topic: { title: 'Conditional probability and Bayes\' theorem', covers: 'Conditional probability, independence, Bayes rule with examples' },
  };

  it('searches YouTube for exactly one topic', () => {
    const url = youtubeSearchUrl('conditional probability bayes theorem explained');
    expect(url).toBe('https://www.youtube.com/results?search_query=conditional%20probability%20bayes%20theorem%20explained');
  });

  it('builds a ChatGPT prompt about one topic, with the role, level, module and what it covers', () => {
    const p = topicPrompt(ctx);
    expect(p).toContain('preparing to become a Quant trader');
    expect(p).toContain('I am a beginner');
    expect(p).toContain('Teach me "Conditional probability and Bayes\' theorem" (part of Probability, in Mathematics)');
    expect(p).toContain('Cover: Conditional probability, independence, Bayes rule with examples.');
    expect(p).toContain('wait for my answers');
    expect(p).not.toMatch(/https?:/);
  });

  it('keeps every prompt short enough for a link', () => {
    const long = topicPrompt({ ...ctx, topic: { title: 'x'.repeat(300), covers: 'y'.repeat(3000) } });
    expect(long.length).toBeLessThanOrEqual(PROMPT_MAX);
    expect(chatGptUrl(long).startsWith('https://chatgpt.com/?q=')).toBe(true);
  });

  it('guides a capstone step without doing it for the student', () => {
    const p = stepPrompt({ role: 'Digital marketer', project: 'Campaign plan', milestone: 'Research', step: { title: 'List five competitors', detail: 'Use public pages', done_when: 'A table of five' } });
    expect(p).toContain('step "List five competitors"');
    expect(p).toContain('It is done when: A table of five');
    expect(p).toContain('without doing it all for me');
    expect(p.length).toBeLessThanOrEqual(PROMPT_MAX);
  });
});

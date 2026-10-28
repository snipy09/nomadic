import { describe, expect, it } from 'vitest';
import { learnIndex } from '../features/learn/catalog';
import { PROMPT_MAX, chatGptPrompt, chatGptUrl, youtubeSearchUrl } from '../features/learn/learnLinks';

const index = learnIndex();
const topics = [...index.topics.values()];
const dsaTopic = topics.find((t) => index.modules.get(t.module_id)?.stream === 'dsa')!;
const dsaModule = index.modules.get(dsaTopic.module_id)!;

describe('lesson links', () => {
  it('searches YouTube for the lesson, in the DSA language', () => {
    const url = youtubeSearchUrl(dsaTopic, dsaModule, { language: 'java' });
    expect(url.startsWith('https://www.youtube.com/results?search_query=')).toBe(true);
    const q = decodeURIComponent(url.split('=')[1]);
    expect(q).toContain(dsaTopic.title);
    expect(q).toContain('Java');
    expect(q).toMatch(/tutorial$/);
  });

  it('builds a ChatGPT prompt from the lesson and the intake', () => {
    const prompt = chatGptPrompt(dsaTopic, dsaModule, { role: 'fullstack', aim: 'campus', language: 'python', levels: { dsa: 'some', core_cs: 'new', dev: 'new', aptitude: 'new' } });
    expect(prompt).toContain(dsaTopic.title);
    expect(prompt).toContain('Python');
    expect(prompt).toContain('placements in India');
    expect(prompt).toMatch(/practice questions/);
    const first = (dsaTopic.learn_items[0] ?? dsaTopic.key_points[0]) as string | undefined;
    if (first) expect(prompt).toContain(first);
  });

  it('keeps every prompt short enough for a link', () => {
    for (const t of topics) {
      const p = chatGptPrompt(t, index.modules.get(t.module_id), { role: 'fullstack', aim: 'campus', language: 'cpp' });
      expect(p.length).toBeLessThanOrEqual(PROMPT_MAX);
      expect(chatGptUrl(p).length).toBeLessThan(8192);
    }
  });

  it('encodes the prompt into the ChatGPT link', () => {
    const url = chatGptUrl('Teach me "two pointers" & sliding window?');
    expect(url).toBe(`https://chatgpt.com/?q=${encodeURIComponent('Teach me "two pointers" & sliding window?')}`);
    expect(decodeURIComponent(url.slice('https://chatgpt.com/?q='.length))).toContain('&');
  });
});

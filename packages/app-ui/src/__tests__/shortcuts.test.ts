import { describe, expect, it } from 'vitest';
import { goShortcut, isTypingTarget, tabForGoKey } from '../components/shell/shortcuts';

describe('go-to shortcuts', () => {
  it('maps letters to pages and back', () => {
    expect(tabForGoKey('j')).toBe('feed');
    expect(tabForGoKey('H')).toBe('home');
    expect(tabForGoKey('x')).toBeNull();
    expect(goShortcut('applications')).toEqual(['G', 'A']);
    expect(goShortcut('help')).toBeUndefined();
  });

  it('never fires while typing', () => {
    const el = (tag: string, attrs: Record<string, string> = {}) => ({ tagName: tag.toUpperCase(), isContentEditable: false, getAttribute: (k: string) => attrs[k] ?? null });
    expect(isTypingTarget(el('input') as any)).toBe(true);
    expect(isTypingTarget(el('textarea') as any)).toBe(true);
    expect(isTypingTarget(el('div', { role: 'combobox' }) as any)).toBe(true);
    expect(isTypingTarget({ ...el('div'), isContentEditable: true } as any)).toBe(true);
    expect(isTypingTarget(el('button') as any)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

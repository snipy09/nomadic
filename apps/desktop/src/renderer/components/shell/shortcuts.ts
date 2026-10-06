/**
 * Keyboard navigation, Linear style: press G, then a letter, to jump to a page.
 * Pure helpers so the key handling is testable without a DOM.
 */
import type { TabType } from '../../types';

export const GO_KEYS: Partial<Record<TabType, string>> = {
  home: 'h',
  'learner-roadmaps': 'l',
  'learner-interview-prep': 'p',
  'learner-projects': 'r',
  feed: 'j',
  applications: 'a',
  answers: 'w',
  settings: 's',
};

const BY_KEY: Record<string, TabType> = Object.fromEntries(Object.entries(GO_KEYS).map(([tab, k]) => [k, tab as TabType]));

/** Keys shown in tooltips and the command palette, e.g. ['G', 'J']. */
export function goShortcut(tab: TabType): string[] | undefined {
  const k = GO_KEYS[tab];
  return k ? ['G', k.toUpperCase()] : undefined;
}

/** The page for the letter pressed after G, if any. */
export const tabForGoKey = (key: string): TabType | null => BY_KEY[key.toLowerCase()] ?? null;

/** Typing in a field, or holding a modifier, never triggers single-key shortcuts. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (el.isContentEditable) return true;
  const role = el.getAttribute?.('role');
  return role === 'textbox' || role === 'combobox';
}

/** How long after G the second key still counts. */
export const GO_WINDOW_MS = 1200;

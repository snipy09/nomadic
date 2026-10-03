import { extendTailwindMerge } from 'tailwind-merge';

/** tailwind-merge taught about the preset's custom font sizes and shadows. */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['caption', 'label', 'body', 'body-lg', 'heading', 'title', 'headline', 'display'] }],
      shadow: [{ shadow: ['e1', 'e2', 'e3'] }],
      'font-weight': [{ font: ['regular', 'strong'] }],
    },
  },
});

export type ClassValue = string | number | false | null | undefined | ClassValue[];

function flatten(values: ClassValue[], out: string[]): void {
  for (const v of values) {
    if (!v && v !== 0) continue;
    if (Array.isArray(v)) flatten(v, out);
    else out.push(String(v));
  }
}

/** Join class names and resolve Tailwind conflicts (later wins). */
export function cn(...values: ClassValue[]): string {
  const out: string[] = [];
  flatten(values, out);
  return twMerge(out.join(' '));
}

/**
 * Keyboard focus ring shared by every interactive element.
 * Outline (not box-shadow) so it never fights elevation shadows, and it follows border-radius.
 */
export const focusRing =
  'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

/** Focus treatment for text fields: border + soft halo, shown on any focus (mouse included). */
export const fieldFocus =
  'outline-none focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-focus/25 focus:border-accent focus:ring-[3px] focus:ring-focus/25';

export type Size = 'sm' | 'md' | 'lg';
export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

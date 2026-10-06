/**
 * Detects pages the engine must hand to the user: sign-in / account walls,
 * CAPTCHAs, and email-verification steps.
 */
import type { Page } from 'playwright';
import { prepareFrame } from './dom.js';
import { wallsInPage } from './agent/inpage.js';

export type Wall = 'login' | 'captcha' | 'email_verification';

/** Sign-in pages recognisable from the URL alone. */
export function isLoginUrl(url: string): boolean {
  return /\/(login|signin|sign-in|auth)(\/|\?|$)|accounts\.google\.com/.test(url.toLowerCase());
}

export async function detectWalls(page: Page): Promise<Wall[]> {
  const walls = new Set<Wall>();
  if (isLoginUrl(page.url())) walls.add('login');
  for (const frame of page.frames()) {
    await prepareFrame(frame);
    const found = await frame.evaluate(wallsInPage).catch(() => [] as string[]);
    found.forEach((w) => walls.add(w as Wall));
  }
  return [...walls];
}

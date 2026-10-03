/**
 * Detects pages the engine must hand to the user: sign-in / account walls,
 * CAPTCHAs, and email-verification steps.
 */
import type { Page } from 'playwright';
import { prepareFrame } from './dom.js';

export type Wall = 'login' | 'captcha' | 'email_verification';

export async function detectWalls(page: Page): Promise<Wall[]> {
  const walls = new Set<Wall>();
  const url = page.url().toLowerCase();
  if (/\/(login|signin|sign-in|auth)(\/|\?|$)|accounts\.google\.com/.test(url)) walls.add('login');
  for (const frame of page.frames()) {
    await prepareFrame(frame);
    const found = await frame.evaluate(() => {
      const vis = (el: Element) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        const s = getComputedStyle(el as HTMLElement);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
      };
      const text = (document.body?.innerText || '').toLowerCase();
      const out: string[] = [];
      const pw = Array.from(document.querySelectorAll('input[type="password"]')).some(vis);
      if (pw && /sign in|log in|login|create account|password/.test(text)) out.push('login');
      if (/sign in to apply|log in to apply|create an account to apply|register to apply|login to continue/.test(text)) out.push('login');
      const cap = Array.from(document.querySelectorAll('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="turnstile"], iframe[src*="challenges.cloudflare"], .g-recaptcha, .h-captcha, .cf-turnstile')).some(vis);
      if (cap) out.push('captcha');
      if (/verify your email|verification code|we (have )?sent (you )?(a|an) (code|email)|enter the (6-digit |)code/.test(text)) out.push('email_verification');
      return out;
    }).catch(() => [] as string[]);
    found.forEach((w) => walls.add(w as Wall));
  }
  return [...walls];
}

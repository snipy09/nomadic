import fs from 'fs';
import { chromium, type Browser, type Page } from 'playwright';
import type { FormField } from '../contracts.js';
import { DomFormReader } from '../reader.js';

/** Launch Chromium if available (CI without browsers skips the DOM suites). */
export async function tryLaunch(): Promise<Browser | null> {
  const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, '/opt/pw-browsers/chromium'].find((p) => p && fs.existsSync(p));
  try {
    return await chromium.launch({ executablePath });
  } catch {
    return null;
  }
}

/** Minimal React-like value tracker: values set via the element's own setter are ignored, like React. */
export const MINI_REACT = `<script>
window.__state = {};
function controlled(el){
  const key = el.name || el.id;
  const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
  let tracked = d.get.call(el);
  __state[key] = tracked;
  Object.defineProperty(el, 'value', { configurable: true, get(){ return d.get.call(this); }, set(v){ tracked = String(v); d.set.call(this, v); } });
  const on = () => { const cur = d.get.call(el); if (cur === tracked) return; tracked = cur; __state[key] = cur; };
  el.addEventListener('input', on); el.addEventListener('change', on);
  el.addEventListener('blur', () => setTimeout(() => { d.set.call(el, __state[key] || ''); tracked = __state[key] || ''; }, 0));
}
document.addEventListener('DOMContentLoaded', () => document.querySelectorAll('[data-controlled]').forEach(controlled));
</script>`;

export async function newPage(browser: Browser, html: string): Promise<Page> {
  const ctx = await browser.newContext();
  await ctx.addInitScript({ content: 'window.__name = window.__name || ((f) => f);' });
  const page = await ctx.newPage();
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8">${MINI_REACT}</head><body>${html}</body></html>`);
  return page;
}

export async function readFields(page: Page): Promise<FormField[]> {
  return new DomFormReader().read(page);
}

export async function fieldByLabel(page: Page, label: string): Promise<FormField> {
  const fields = await readFields(page);
  const f = fields.find((x) => x.label === label);
  if (!f) throw new Error(`field "${label}" not found; have: ${fields.map((x) => x.label).join(' | ')}`);
  return f;
}

export const sampleProfile = () => ({
  firstName: 'Jordan',
  lastName: 'Rivera',
  email: 'jordan@example.com',
  phone: '+1 512 555 0142',
  location: 'Austin, TX, USA',
  city: 'Austin',
  state: 'Texas',
  country: 'United States',
  linkedin: 'https://linkedin.com/in/jordan',
  github: 'https://github.com/jordan',
  workAuthorized: true,
  requiresSponsorship: false,
  willingToRelocate: false,
  yearsOfExperience: 5,
  desiredSalary: '$145,000',
  noticePeriod: '2 weeks',
  earliestStartDate: '2026-11-02',
  techStack: 'TypeScript, React, PostgreSQL',
  summaryText: 'Engineer.',
  languages: ['English'],
});

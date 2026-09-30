import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { chromium, type Browser, type Page } from 'playwright';
import { canSubmit, fillForm } from './engine.js';
import type { FillReport, FormProfile } from './types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURE_DIR = path.join(here, '..', 'fixtures');

export function sampleProfile(resumeFilePath: string): FormProfile {
  return {
    firstName: 'Aarav',
    lastName: 'Sharma',
    email: 'aarav.sharma@example.com',
    phone: '+91 98765 43210',
    linkedin: 'https://linkedin.com/in/aarav-sharma',
    github: 'https://github.com/aaravs',
    portfolio: 'https://aarav.dev',
    city: 'Bengaluru',
    country: 'India',
    currentCompany: 'Acme Labs',
    currentTitle: 'Software Engineer',
    yearsExperience: '3',
    salary: '12 LPA',
    noticePeriod: '30 days',
    summary: 'Software engineer with 3 years of experience building web platforms in TypeScript, React and Node.js.',
    resumeFilePath,
    needsSponsorship: false,
    authorizedToWork: true,
    willingToRelocate: true,
  };
}

export function makeResume(): string {
  const p = path.join(os.tmpdir(), 'nomadic-bench-resume.pdf');
  fs.writeFileSync(p, '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
  return p;
}

type Expect = {
  sel?: string; value?: string; digits?: string; file?: boolean; nonEmpty?: boolean; empty?: boolean; needsUser?: boolean;
  radio?: string; label?: string; pressed?: string; check?: string; unchecked?: string;
  attr?: string; name?: string; frame?: number; anyOf?: string[];
};

export interface FormScore {
  fixture: string;
  total: number;
  correct: number;
  wrong: number;
  missed: number;
  failures: string[];
  canSubmit: boolean;
  ms: number;
  report: FillReport;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function check(page: Page, e: Expect, report: FillReport): Promise<'correct' | 'wrong' | 'missed'> {
  const frame = page.frames()[e.frame ?? 0] || page.mainFrame();
  if (e.radio) {
    const state = await frame.locator(`input[type=radio][name="${e.radio}"]`).evaluateAll((els: any[]) => {
      const r = els.find((x) => x.checked);
      if (!r) return null;
      const root = r.getRootNode();
      const l = r.closest('label') || (r.id ? root.querySelector(`label[for="${r.id}"]`) : null);
      return (l?.textContent || r.value || '').trim();
    });
    if (state == null) return 'missed';
    return norm(state) === norm(e.label!) ? 'correct' : 'wrong';
  }
  if (e.pressed) {
    const state = await frame.evaluate((sel) => {
      const b = Array.from(document.querySelectorAll<HTMLElement>(`${sel} button`)).find((x) => x.classList.contains('active') || x.getAttribute('aria-pressed') === 'true');
      return b ? (b.textContent || '').trim() : null;
    }, e.pressed);
    if (state == null) return 'missed';
    return norm(state) === norm(e.label!) ? 'correct' : 'wrong';
  }
  if (e.check) return (await frame.locator(e.check).isChecked().catch(() => false)) ? 'correct' : 'missed';
  if (e.unchecked) {
    const n = await frame.evaluate((sel) => Array.from(document.querySelectorAll<HTMLInputElement>(sel)).filter((x) => x.checked).length, e.unchecked);
    return n === 0 ? 'correct' : 'wrong';
  }
  if (e.attr) {
    const v = await frame.locator(e.attr).getAttribute(e.name!);
    if (!v) return 'missed';
    return norm(v) === norm(e.value!) ? 'correct' : 'wrong';
  }
  const loc = frame.locator(e.sel!).first();
  if (e.file) return (await loc.evaluate((el: any) => el.files?.length || 0)) > 0 ? 'correct' : 'missed';
  const tag = await loc.evaluate((el: any) => el.tagName);
  const val: string =
    tag === 'SELECT' ? await loc.evaluate((el: any) => (el.selectedIndex > 0 ? el.options[el.selectedIndex].textContent.trim() : '')) : await loc.inputValue();
  if (e.empty) {
    const escalated = report.fields.some((f) => f.status === 'needs_user');
    return val === '' && (!e.needsUser || escalated) ? 'correct' : 'wrong';
  }
  if (e.nonEmpty) return val.trim() ? 'correct' : 'missed';
  if (!val) return 'missed';
  if (e.digits) return val.replace(/\D/g, '') === e.digits ? 'correct' : 'wrong';
  if (e.anyOf) return e.anyOf.some((v) => norm(v) === norm(val)) ? 'correct' : 'wrong';
  return norm(val) === norm(e.value!) ? 'correct' : 'wrong';
}

export async function runFixture(browser: Browser, name: string, profile: FormProfile): Promise<FormScore> {
  const expects: Expect[] = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, `${name}.expected.json`), 'utf8'));
  const page = await browser.newPage();
  await page.goto(pathToFileURL(path.join(FIXTURE_DIR, `${name}.html`)).href);
  await page.waitForLoadState('load');
  const t0 = Date.now();
  const report = await fillForm(page, profile);
  const ms = Date.now() - t0;
  let correct = 0, wrong = 0, missed = 0;
  const failures: string[] = [];
  for (const e of expects) {
    const r = await check(page, e, report).catch(() => 'missed' as const);
    if (r === 'correct') correct++;
    else {
      if (r === 'wrong') wrong++; else missed++;
      failures.push(`${r}: ${JSON.stringify(e)}`);
    }
  }
  await page.close();
  return { fixture: name, total: expects.length, correct, wrong, missed, failures, canSubmit: canSubmit(report), ms, report };
}

export function listFixtures(): string[] {
  return fs.readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.expected.json')).map((f) => f.replace('.expected.json', ''));
}

export async function runBench(): Promise<{ scores: FormScore[]; accuracy: number; wrongRate: number }> {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined),
  });
  const profile = sampleProfile(makeResume());
  const scores: FormScore[] = [];
  for (const f of listFixtures()) scores.push(await runFixture(browser, f, profile));
  await browser.close();
  const total = scores.reduce((a, s) => a + s.total, 0);
  return {
    scores,
    accuracy: scores.reduce((a, s) => a + s.correct, 0) / total,
    wrongRate: scores.reduce((a, s) => a + s.wrong, 0) / total,
  };
}

export function toMarkdown(r: Awaited<ReturnType<typeof runBench>>): string {
  const rows = r.scores.map((s) => `| ${s.fixture} | ${s.correct}/${s.total} | ${s.wrong} | ${s.missed} | ${s.ms} ms |`).join('\n');
  const fails = r.scores.flatMap((s) => s.failures.map((f) => `- ${s.fixture}: ${f}`)).join('\n') || '- none';
  return `# Form engine benchmark\n\nAccuracy: **${(r.accuracy * 100).toFixed(1)}%** · Wrong-answer rate: **${(r.wrongRate * 100).toFixed(1)}%**\n\n| Fixture | Correct | Wrong | Missed | Time |\n|---|---|---|---|---|\n${rows}\n\n## Failures\n${fails}\n`;
}

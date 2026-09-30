import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';
import { runNewFormEngine, toFormProfile } from '../form-engine-bridge.js';
import type { MasterProfile } from '../auto-apply-engine.js';
import { FIXTURE_DIR, makeResume } from '../../../form-engine/src/bench.js';

const master: MasterProfile = {
  firstName: 'Aarav', lastName: 'Sharma', email: 'aarav.sharma@example.com', phone: '+91 98765 43210',
  linkedin: 'https://linkedin.com/in/aarav-sharma', sponsorship: 'Yes', resumeFilePath: makeResume(),
  summaryText: 'Software engineer with 3 years building web platforms.',
};

describe('form-engine bridge', () => {
  it('maps MasterProfile without inventing data', () => {
    const p = toFormProfile(master);
    expect(p.needsSponsorship).toBe(true);
    expect(p.github).toBeUndefined();
    expect(p.resumeFilePath).toBe(master.resumeFilePath);
  });

  it('fills a Lever-style form and refuses to call it submittable when data is missing', async () => {
    const browser = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined });
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.join(FIXTURE_DIR, 'lever.html')).href);
    const out = await runNewFormEngine(page, master);
    expect(out.foundForm).toBe(true);
    expect(await page.inputValue('input[name=email]')).toBe('aarav.sharma@example.com');
    // Sponsorship needed => "Will you require visa sponsorship" must be Yes.
    expect(await page.locator('input[name="cards[abc][field1]"][value=Yes]').isChecked()).toBe(true);
    // "Years of experience" is required and not in this profile -> must be reported, not guessed.
    expect(out.safeToSubmit).toBe(false);
    expect(out.report.fields.some((f) => f.status === 'needs_user' && /years/i.test(f.label))).toBe(true);
    await browser.close();
  }, 60000);
});

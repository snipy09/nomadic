import fs from 'fs';
import { afterAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { dispatchSpecializedPortalBot } from '../bots/bot-dispatcher.js';
import { adapterFor } from '../bots/portal-adapter.js';
import { AutoApplyEngine } from '../auto-apply-engine.js';
import type { MasterProfile } from '../auto-apply-engine.js';

async function tryLaunch(): Promise<Browser | null> {
  const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, '/opt/pw-browsers/chromium'].find((p) => p && fs.existsSync(p));
  try { return await chromium.launch({ executablePath }); } catch { return null; }
}
const browser = await tryLaunch();
afterAll(async () => { await browser?.close(); });

const profile: MasterProfile = {
  firstName: 'Aarav', lastName: 'Sharma', email: 'aarav@example.in', phone: '+91 98765 43210',
  noticePeriod: 'Immediately', coverLetter: 'I build React apps.', github: 'https://github.com/aarav',
};

describe('portal adapters', () => {
  it('routes URLs to adapters', () => {
    expect(adapterFor('https://jobs.ashbyhq.com/acme/123/application').id).toBe('ashby');
    expect(adapterFor('https://boards.greenhouse.io/acme/jobs/1').id).toBe('greenhouse');
    expect(adapterFor('https://jobs.lever.co/acme/uuid/apply').id).toBe('lever');
    expect(adapterFor('https://internshala.com/internship/detail/x').id).toBe('internshala');
    expect(adapterFor('https://acme.wd5.myworkdayjobs.com/x/job/1').id).toBe('workday');
    expect(adapterFor('https://careers.acme.com/apply').id).toBe('generic');
  });

  it('maps engine events onto the desktop status events', () => {
    expect(AutoApplyEngine.toStatusEvent({ type: 'field_filled', fieldId: 'a', label: 'Email', kind: 'text', value: 'x', source: 'profile', attempt: 1 }))
      .toMatchObject({ phase: 'filling', colorState: 'green', formEvent: { type: 'field_filled' } });
    expect(AutoApplyEngine.toStatusEvent({ type: 'needs_user', label: 'Referral', reason: 'not in profile', required: true }))
      .toMatchObject({ phase: 'user_input_required', colorState: 'red', actionRequired: 'not in profile' });
  });
});

describe.skipIf(!browser)('InternshalaBot on FormEngine', () => {
  it('opens the modal, fills it, and does not submit', async () => {
    const ctx = await browser!.newContext();
    await ctx.addInitScript({ content: 'window.__name = window.__name || ((f) => f);' });
    const page = await ctx.newPage();
    await page.setContent(`<button id="easy_apply_button" onclick="document.getElementById('m').style.display='block'">Apply now</button>
      <div id="m" class="modal" style="display:none"><form id="application-form" onsubmit="event.preventDefault();window.__submitted=true">
        <div class="form-group"><div class="assessment_question">Why should you be hired for this role?</div><textarea id="cover_letter" required></textarea></div>
        <div class="form-group"><div class="assessment_question">Confirm your availability</div>
          <div class="radio"><label><input type="radio" name="confirm_availability" value="yes_available" required> Yes, I am available to join immediately</label></div>
          <div class="radio"><label><input type="radio" name="confirm_availability" value="no_available"> No (Please specify your availability)</label></div></div>
        <input type="submit" id="submit" value="Submit"></form></div>`);
    const res = await dispatchSpecializedPortalBot(page, 'https://internshala.com/internship/detail/web-dev', profile);
    expect(res?.success).toBe(true);
    expect(res?.fieldsFilled).toBe(2);
    expect(res?.submitted).toBe(false);
    expect(await page.inputValue('#cover_letter')).toBe('I build React apps.');
    expect(await page.isChecked('input[value="yes_available"]')).toBe(true);
    expect(await page.evaluate(() => (window as any).__submitted === true)).toBe(false);
    expect(res?.report?.readyToSubmit).toBe(true);
    await ctx.close();
  });
});

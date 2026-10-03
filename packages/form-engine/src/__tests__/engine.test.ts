import { afterAll, describe, expect, it, vi } from 'vitest';
import { FormEngine } from '../engine.js';
import type { FormEngineEvent } from '../contracts.js';
import type { LlmClient } from '../llm.js';
import { DomFormReader } from '../reader.js';
import { newPage, sampleProfile, tryLaunch } from './helpers.js';

const browser = await tryLaunch();
afterAll(async () => { await browser?.close(); });

const FORM = `<form onsubmit="event.preventDefault(); window.__submitted = true;">
  <div class="field"><label for="fn">First Name *</label><input id="fn" required></div>
  <div class="field"><label for="em">Email</label><input id="em" type="email"></div>
  <div class="field"><label for="why">Why do you want to work here?</label><textarea id="why"></textarea></div>
  <fieldset><legend>Will you require visa sponsorship?</legend><label><input type="radio" name="sp" value="Yes">Yes</label><label><input type="radio" name="sp" value="No">No</label></fieldset>
  <div class="field"><label><input type="checkbox" id="mk"> Send me job alerts</label></div>
  <div class="field"><label for="ref">Who referred you? *</label><input id="ref" required></div>
  <button type="submit">Submit application</button>
</form>`;

describe.skipIf(!browser)('DomFormReader', () => {
  it('reads iframes and open shadow roots with resolved labels', async () => {
    const page = await newPage(browser!, `
      <div><span id="lbl">Given name</span><input aria-labelledby="lbl"></div>
      <input placeholder="Family name">
      <iframe srcdoc="<label for='e'>Email</label><input id='e' type='email' required>"></iframe>
      <x-host></x-host>
      <script>customElements.define('x-host', class extends HTMLElement { connectedCallback(){ const r=this.attachShadow({mode:'open'}); r.innerHTML='<label for=c>City</label><input id=c>'; } });</script>`);
    await page.waitForTimeout(100);
    const fields = await new DomFormReader().read(page);
    const labels = fields.map((f) => f.label);
    expect(labels).toEqual(expect.arrayContaining(['Given name', 'Family name', 'Email', 'City']));
    const email = fields.find((f) => f.label === 'Email')!;
    expect(email.frameIndex).toBe(1);
    expect(email.required).toBe(true);
    const city = fields.find((f) => f.label === 'City')!;
    expect(city.shadowHostPath?.length).toBe(1);
  });

  it('skips hidden steps and modals unless asked', async () => {
    const page = await newPage(browser!, '<div style="display:none"><label for="h">Hidden</label><input id="h"></div><label for="v">Visible</label><input id="v">');
    expect((await new DomFormReader().read(page)).map((f) => f.label)).toEqual(['Visible']);
    expect((await new DomFormReader({ includeHidden: true }).read(page)).map((f) => f.label)).toContain('Hidden');
  });
});

describe.skipIf(!browser)('FormEngine', () => {
  it('fills, emits events, calls the LLM at most once, and never submits', async () => {
    const page = await newPage(browser!, FORM);
    const llm: LlmClient = { completeJson: vi.fn(async (_s, u) => ({ answers: Object.fromEntries(JSON.parse(u).QUESTIONS.map((q: any) => [q.id, 'Because of the mission.'])) })) };
    const events: FormEngineEvent[] = [];
    const engine = new FormEngine({ llm, onEvent: (e) => events.push(e) });
    const report = await engine.fill(page, sampleProfile() as any);

    expect(await page.evaluate(() => (window as any).__submitted === true)).toBe(false);
    expect(llm.completeJson).toHaveBeenCalledTimes(1);
    expect(report.llmCalls).toBe(1);
    expect(await page.inputValue('#fn')).toBe('Jordan');
    expect(await page.inputValue('#why')).toBe('Because of the mission.');
    expect(await page.isChecked('input[value="No"]')).toBe(true);
    expect(await page.isChecked('#mk')).toBe(false);
    expect(await page.inputValue('#ref')).toBe('');
    expect(report.unresolvedRequired.map((o) => o.field.label)).toEqual(['Who referred you?']);
    expect(report.readyToSubmit).toBe(false);
    expect(events.filter((e) => e.type === 'field_filled').length).toBe(report.filled);
    expect(events).toContainEqual(expect.objectContaining({ type: 'needs_user', label: 'Who referred you?', required: true }));
  });

  it('blocks submit() while required fields are unresolved, then submits when resolved', async () => {
    const page = await newPage(browser!, FORM);
    const engine = new FormEngine({ llm: null });
    const report = await engine.fill(page, sampleProfile() as any);
    const blocked = await engine.submit(page, report);
    expect(blocked).toMatchObject({ submitted: false, blocked: true });
    expect(await page.evaluate(() => (window as any).__submitted === true)).toBe(false);

    const report2 = await engine.fill(page, { ...sampleProfile(), customAnswers: { 'Who referred you?': 'Sam Lee' } } as any);
    expect(report2.readyToSubmit).toBe(true);
    const done = await engine.submit(page, report2);
    expect(done.submitted).toBe(true);
    expect(await page.evaluate(() => (window as any).__submitted === true)).toBe(true);
  });

  it('retries only fields that fail verification (max 2 retries)', async () => {
    const page = await newPage(browser!, `<label for="a">First Name</label><input id="a">
      <label for="b">Last Name</label><input id="b">
      <script>let n=0; document.getElementById('a').addEventListener('change', e => { if (n++ < 2) setTimeout(() => { e.target.value=''; }, 10); });</script>`);
    const engine = new FormEngine({ llm: null });
    const report = await engine.fill(page, sampleProfile() as any);
    const first = report.fields.find((o) => o.field.label === 'First Name')!;
    const last = report.fields.find((o) => o.field.label === 'Last Name')!;
    expect(first.status).toBe('filled');
    expect(first.attempts).toBeGreaterThan(1);
    expect(last.attempts).toBe(1);
    expect(await page.inputValue('#a')).toBe('Jordan');
  });

  it('reports login walls and does not fill passwords', async () => {
    const page = await newPage(browser!, '<h2>Sign In</h2><label for="e">Email Address</label><input id="e"><label for="p">Password</label><input id="p" type="password" required><button>Sign In</button>');
    const events: FormEngineEvent[] = [];
    const report = await new FormEngine({ llm: null, onEvent: (e) => events.push(e) }).fill(page, sampleProfile() as any);
    expect(report.walls).toContain('login');
    expect(report.readyToSubmit).toBe(false);
    expect(await page.inputValue('#p')).toBe('');
    expect(events).toContainEqual(expect.objectContaining({ type: 'needs_user', wall: 'login' }));
  });

  it('walks multi-step flows with fillSteps without pressing submit', async () => {
    const page = await newPage(browser!, `<form onsubmit="event.preventDefault(); window.__submitted = true;">
      <section id="s1"><label for="f">First Name</label><input id="f"><button type="button" onclick="s1.style.display='none';s2.style.display=''">Next</button></section>
      <section id="s2" style="display:none"><label for="c">City</label><input id="c"><button type="submit">Submit</button></section></form>`);
    const report = await new FormEngine({ llm: null }).fillSteps(page, sampleProfile() as any);
    expect(await page.inputValue('#f')).toBe('Jordan');
    expect(await page.inputValue('#c')).toBe('Austin');
    expect(report.filled).toBe(2);
    expect(await page.evaluate(() => (window as any).__submitted === true)).toBe(false);
  });
});

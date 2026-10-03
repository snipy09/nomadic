import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Answer } from '../contracts.js';
import { CheckboxWriter, ComboboxWriter, DateWriter, FileWriter, RadioWriter, RichTextWriter, SelectWriter, TextWriter, formatDate, parseDate } from '../writers/index.js';
import { fieldByLabel, newPage, tryLaunch } from './helpers.js';

const browser = await tryLaunch();
afterAll(async () => { await browser?.close(); });
type Answered = Extract<Answer, { status: 'answered' }>;
const ans = (value: string, extra: Partial<Answered> = {}): Answered => ({ fieldId: 'x', status: 'answered', value, source: 'profile', ...extra });

describe('date helpers', () => {
  it('parses ISO and US dates but not relative phrases', () => {
    expect(parseDate('2026-11-02')).toEqual([2026, 11, 2]);
    expect(parseDate('11/02/2026')).toEqual([2026, 11, 2]);
    expect(parseDate('2 weeks')).toBeNull();
  });
  it('formats per placeholder / input type', () => {
    expect(formatDate([2026, 11, 2], 'MM/DD/YYYY')).toBe('11/02/2026');
    expect(formatDate([2026, 11, 2], 'DD.MM.YYYY')).toBe('02.11.2026');
    expect(formatDate([2026, 11, 2], undefined, 'date')).toBe('2026-11-02');
  });
});

describe.skipIf(!browser)('field writers (DOM)', () => {
  it('TextWriter: value sticks on a React-controlled input', async () => {
    const page = await newPage(browser!, '<label for="n">Name</label><input id="n" name="n" data-controlled>');
    const field = await fieldByLabel(page, 'Name');
    const res = await new TextWriter().write(page, field, ans('Jordan Rivera'));
    expect(res).toMatchObject({ ok: true, actual: 'Jordan Rivera' });
    await page.locator('#n').blur();
    await page.waitForTimeout(20);
    expect(await page.evaluate(() => (window as any).__state.n)).toBe('Jordan Rivera');
  });

  it('TextWriter: reports failure when the page rejects the value', async () => {
    const page = await newPage(browser!, '<label for="z">Zip</label><input id="z" oninput="this.value=\'\'">');
    const res = await new TextWriter().write(page, await fieldByLabel(page, 'Zip'), ans('78701'));
    expect(res.ok).toBe(false);
  });

  it('SelectWriter: picks by label on a hidden select2-style select and fires change', async () => {
    const page = await newPage(browser!, `<label>Gender <select id="g" style="position:absolute;left:-9999px;width:1px" onchange="window.changed=this.value">
      <option value="">--</option><option value="1">Male</option><option value="3">Decline To Self Identify</option></select></label>`);
    const res = await new SelectWriter().write(page, await fieldByLabel(page, 'Gender'), ans('Decline to self-identify', { match: ['decline'] }));
    expect(res.ok).toBe(true);
    expect(await page.evaluate(() => (window as any).changed)).toBe('3');
  });

  it('RadioWriter: clicks the label of an opacity:0 radio', async () => {
    const page = await newPage(browser!, `<fieldset><legend>Sponsorship?</legend>
      <span><input type="radio" id="r1" name="s" value="Yes" style="opacity:0;position:absolute;width:1px;height:1px"><label for="r1">Yes</label></span>
      <span><input type="radio" id="r2" name="s" value="No" style="opacity:0;position:absolute;width:1px;height:1px"><label for="r2">No</label></span></fieldset>`);
    const res = await new RadioWriter().write(page, await fieldByLabel(page, 'Sponsorship?'), ans('No'));
    expect(res).toMatchObject({ ok: true, actual: 'No' });
    expect(await page.isChecked('#r2')).toBe(true);
  });

  it('RadioWriter: Yes/No button groups', async () => {
    const page = await newPage(browser!, `<div class="entry"><label>Authorized?</label><div class="yesno">
      <button type="button" onclick="this.setAttribute('aria-pressed','true');this.nextElementSibling.setAttribute('aria-pressed','false')">Yes</button>
      <button type="button" onclick="this.setAttribute('aria-pressed','true');this.previousElementSibling.setAttribute('aria-pressed','false')">No</button></div></div>`);
    const res = await new RadioWriter().write(page, await fieldByLabel(page, 'Authorized?'), ans('Yes'));
    expect(res).toMatchObject({ ok: true, actual: 'Yes' });
  });

  it('CheckboxWriter: checks consent, unchecks opt-in, handles groups', async () => {
    const page = await newPage(browser!, `
      <div><input type="checkbox" id="c1" style="opacity:0;position:absolute"><label for="c1">I agree to the privacy notice</label></div>
      <div><label><input type="checkbox" id="c2" checked> Send me job alerts</label></div>
      <fieldset><legend>Languages</legend><label><input type="checkbox" name="l" value="en"> English</label><label><input type="checkbox" name="l" value="es"> Spanish</label><label><input type="checkbox" name="l" value="fr"> French</label></fieldset>`);
    const w = new CheckboxWriter();
    expect((await w.write(page, await fieldByLabel(page, 'I agree to the privacy notice'), ans('true'))).ok).toBe(true);
    expect((await w.write(page, await fieldByLabel(page, 'Send me job alerts'), ans('false'))).ok).toBe(true);
    expect(await page.isChecked('#c1')).toBe(true);
    expect(await page.isChecked('#c2')).toBe(false);
    const g = await w.write(page, await fieldByLabel(page, 'Languages'), ans('English|Spanish', { values: ['English', 'Spanish'] }));
    expect(g).toMatchObject({ ok: true, actual: 'English|Spanish' });
  });

  it('ComboboxWriter: react-select style input and portal listbox button', async () => {
    const page = await newPage(browser!, `
      <div class="select__container"><label id="v-l" for="v">Veteran Status</label>
        <div class="select-shell"><div class="select__single-value"></div><input id="v" role="combobox" aria-labelledby="v-l" aria-expanded="false"
          onfocus="openMenu(this)"></div></div>
      <div><label id="lb" for="b">Country</label><button id="b" type="button" aria-haspopup="listbox" aria-labelledby="lb" onclick="openPortal(this)">Select One</button></div>
      <script>
        function openMenu(inp){ if (document.getElementById('m')) return; const m=document.createElement('div'); m.id='m'; m.setAttribute('role','listbox');
          ['I am a veteran',"I don't wish to answer"].forEach(t=>{const o=document.createElement('div');o.setAttribute('role','option');o.textContent=t;
          o.onclick=()=>{inp.closest('.select-shell').querySelector('.select__single-value').textContent=t;m.remove();}; m.appendChild(o);}); inp.parentElement.appendChild(m); }
        function openPortal(btn){ const ul=document.createElement('ul'); ul.setAttribute('role','listbox'); ['India','United States of America'].forEach(t=>{const li=document.createElement('li');
          li.setAttribute('role','option'); li.textContent=t; li.onclick=()=>{btn.textContent=t;btn.setAttribute('value',t);ul.remove();}; ul.appendChild(li);}); document.body.appendChild(ul); }
      </script>`);
    const w = new ComboboxWriter();
    const r1 = await w.write(page, await fieldByLabel(page, 'Veteran Status'), ans('Decline', { match: ["don't wish"] }));
    expect(r1).toMatchObject({ ok: true, actual: "I don't wish to answer" });
    const r2 = await w.write(page, await fieldByLabel(page, 'Country'), ans('United States', { match: ['^United States'] }));
    expect(r2).toMatchObject({ ok: true, actual: 'United States of America' });
  });

  it('ComboboxWriter: fails cleanly when no option matches', async () => {
    const page = await newPage(browser!, `<label id="lb" for="b">Pick</label><button id="b" type="button" aria-haspopup="listbox" aria-labelledby="lb"
      onclick="const u=document.createElement('ul');u.setAttribute('role','listbox');u.innerHTML='<li role=option>A</li>';document.body.appendChild(u)">Select</button>`);
    const r = await new ComboboxWriter().write(page, await fieldByLabel(page, 'Pick'), ans('Z'));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no option matches/);
  });

  it('DateWriter: native date and MM/DD/YYYY text inputs', async () => {
    const page = await newPage(browser!, '<label for="d1">Start</label><input id="d1" type="date"><label for="d2">Earliest Start Date</label><input id="d2" placeholder="MM/DD/YYYY">');
    const w = new DateWriter();
    expect((await w.write(page, await fieldByLabel(page, 'Start'), ans('2026-11-02'))).actual).toBe('2026-11-02');
    expect((await w.write(page, await fieldByLabel(page, 'Earliest Start Date'), ans('2026-11-02'))).actual).toBe('11/02/2026');
    expect((await w.write(page, await fieldByLabel(page, 'Start'), ans('2 weeks'))).ok).toBe(false);
  });

  it('FileWriter: attaches to a hidden file input', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fe-')), 'r.pdf');
    fs.writeFileSync(file, '%PDF-1.4\n');
    const page = await newPage(browser!, '<div class="field"><label>Resume</label><button type="button">Attach</button><input type="file" id="f" style="display:none"></div>');
    const res = await new FileWriter().write(page, await fieldByLabel(page, 'Resume'), ans(file));
    expect(res).toMatchObject({ ok: true, actual: '@file' });
    expect((await new FileWriter().write(page, await fieldByLabel(page, 'Resume'), ans('/nope.pdf'))).ok).toBe(false);
  });

  it('RichTextWriter: contenteditable editor', async () => {
    const page = await newPage(browser!, '<div id="l">Cover letter</div><div id="e" contenteditable="true" role="textbox" aria-labelledby="l"></div>');
    const res = await new RichTextWriter().write(page, await fieldByLabel(page, 'Cover letter'), ans('I build data products.'));
    expect(res.ok).toBe(true);
    expect(await page.innerText('#e')).toContain('I build data products.');
  });
});

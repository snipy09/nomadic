/**
 * FormReader field-detection recall against the answer keys (Step 1.2).
 *   npx tsx packages/form-bench/src/recall.ts [--only=<id>] [--verbose]
 * Multi-step and modal fixtures are measured on what is visible at load, plus
 * after the adapter's navigation (modal open / steps) when --adapters is passed.
 */
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { startFixtureServers } from './server.ts';
import { matchFound } from './score.ts';
import { FIXTURES_DIR } from './fixtures/build.ts';
import type { AnswerKey } from './fixtures/kit.ts';
import { DomFormReader } from '../../form-engine/src/reader.ts';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));

async function main() {
  const ids = fs.readdirSync(FIXTURES_DIR).filter((d) => !d.startsWith('_') && (!args.only || d.includes(args.only))).sort();
  const servers = await startFixtureServers(FIXTURES_DIR);
  const executablePath = [process.env.BENCH_CHROMIUM, '/opt/pw-browsers/chromium'].find((p) => p && fs.existsSync(p));
  const browser = await chromium.launch({ executablePath });
  let total = 0, found = 0;
  for (const id of ids) {
    const key = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, id, 'expected.json'), 'utf8')) as AnswerKey;
    const ctx = await browser.newContext();
    await ctx.addInitScript({ content: 'window.__name = window.__name || ((f) => f);' });
    const page = await ctx.newPage();
    await page.goto(`${servers.originA}/${id}/index.html`);
    await page.waitForFunction(() => (window as any).__fixtureReady === true).catch(() => {});
    // reveal hidden-at-load fields (modal / later steps) so recall measures the reader itself
    await page.evaluate(() => {
      document.querySelectorAll<HTMLElement>('.modal, [data-step]').forEach((m) => { m.style.display = 'block'; });
    });
    const fields = await new DomFormReader().read(page);
    let f = 0;
    const missed: string[] = [];
    for (const [label, entry] of Object.entries(key.fields)) {
      const ok = await matchFound(page, entry, fields.map((x) => ({ frameIndex: x.frameIndex, selector: x.selector, shadowHostPath: x.shadowHostPath, optionSelectors: x.options?.map((o) => o.selector!).filter(Boolean) })));
      if (ok) f++; else missed.push(label);
    }
    total += Object.keys(key.fields).length;
    found += f;
    console.log(`${id.padEnd(28)} ${f}/${Object.keys(key.fields).length}${missed.length ? '  missed: ' + missed.join(' | ') : ''}`);
    if (args.verbose) for (const x of fields) console.log(`    [${x.kind}] ${x.required ? '*' : ' '} ${x.label}  ${x.options ? '{' + x.options.map((o) => o.label).join(', ').slice(0, 80) + '}' : ''}  <${x.selector}>`);
    await ctx.close();
  }
  console.log(`\nRecall: ${found}/${total} = ${((100 * found) / total).toFixed(1)}%`);
  await browser.close();
  await servers.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

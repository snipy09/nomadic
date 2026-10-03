/**
 * Captures live application pages as static fixtures.
 *
 *   npx tsx packages/form-bench/src/capture.ts [--only=<id>] [--headed]
 *
 * For each target in capture-urls.json it opens the page, optionally clicks a
 * selector (e.g. Internshala "Apply now"), inlines same-origin iframes' HTML
 * as sibling files, strips scripts (so the snapshot is static), records a HAR,
 * and writes fixtures/<id>/index.html plus a skeleton expected.json listing
 * every detected control so the answer key can be filled in by hand.
 */
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { BENCH_ROOT, FIXTURES_DIR } from './fixtures/build.ts';

interface Target { id: string; ats: string; url: string; clickBeforeCapture?: string }

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));

async function main() {
  const cfg = JSON.parse(fs.readFileSync(path.join(BENCH_ROOT, 'capture-urls.json'), 'utf8')) as { targets: Target[] };
  const targets = cfg.targets.filter((t) => !t.url.includes('<') && (!args.only || t.id.includes(args.only)));
  if (!targets.length) {
    console.log('No capturable targets: replace the <placeholders> in packages/form-bench/capture-urls.json first.');
    return;
  }
  const executablePath = [process.env.BENCH_CHROMIUM, '/opt/pw-browsers/chromium'].find((p) => p && fs.existsSync(p));
  const browser = await chromium.launch({ headless: args.headed !== 'true', executablePath });
  for (const t of targets) {
    const dir = path.join(FIXTURES_DIR, t.id);
    fs.mkdirSync(dir, { recursive: true });
    const context = await browser.newContext({ recordHar: { path: path.join(dir, 'capture.har'), content: 'embed' }, viewport: { width: 1280, height: 900 } });
    await context.addInitScript({ content: 'window.__name = window.__name || ((f) => f);' });
    const page = await context.newPage();
    try {
      await page.goto(t.url, { waitUntil: 'networkidle', timeout: 60_000 });
      if (t.clickBeforeCapture) {
        await page.click(t.clickBeforeCapture, { timeout: 10_000 }).catch(() => {});
        await page.waitForTimeout(1500);
      }
      const frames = page.frames().slice(1);
      const frameFiles: Record<string, string> = {};
      for (let i = 0; i < frames.length; i++) {
        const html = await frames[i].content().catch(() => '');
        if (html) frameFiles[`frame-${i + 1}.html`] = html;
      }
      let html = await page.content();
      html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<base\b[^>]*>/gi, '');
      html = html.replace('<head>', `<head><base href="${new URL(t.url).origin}/"><script src="../_shared/runtime.js"></script>`);
      fs.writeFileSync(path.join(dir, 'index.html'), html);
      for (const [name, content] of Object.entries(frameFiles)) fs.writeFileSync(path.join(dir, name), content);

      const controls = await page.evaluate(() => Array.from(document.querySelectorAll('input:not([type=hidden]), textarea, select, [role=combobox], [role=radiogroup], [contenteditable=true]')).map((el) => {
        const e = el as HTMLInputElement;
        const label = (e.id && document.querySelector(`label[for="${e.id}"]`)?.textContent) || e.getAttribute('aria-label') || e.closest('label')?.textContent || e.placeholder || e.name || '';
        return { label: label.replace(/\s+/g, ' ').trim().slice(0, 120), selector: e.id ? `[id="${e.id}"]` : e.name ? `[name="${e.name}"]` : el.tagName.toLowerCase(), type: e.type || el.getAttribute('role') || el.tagName.toLowerCase() };
      }));
      const fields: Record<string, unknown> = {};
      for (const c of controls) {
        if (!c.label || fields[c.label]) continue;
        const read = c.type === 'select-one' ? 'select' : c.type === 'radio' ? 'radio' : c.type === 'checkbox' ? 'checkbox' : c.type === 'file' ? 'file' : 'value';
        fields[c.label] = { expected: 'TODO', selector: c.selector, read, category: 'profile' };
      }
      const keyPath = path.join(dir, 'expected.json');
      if (!fs.existsSync(keyPath)) {
        fs.writeFileSync(keyPath + '.todo', JSON.stringify({ id: t.id, ats: t.ats, title: await page.title(), sourceUrl: t.url, profile: 'sample.json', walls: [], fields }, null, 2) + '\n');
      }
      console.log(`captured ${t.id}: ${controls.length} controls, ${frames.length} frames -> ${path.relative(process.cwd(), dir)} (fill expected.json.todo and rename to expected.json)`);
    } catch (err: any) {
      console.error(`failed ${t.id}: ${err?.message || err}`);
    } finally {
      await context.close();
    }
  }
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });

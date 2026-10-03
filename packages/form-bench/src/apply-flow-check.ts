/**
 * End-to-end check of the new apply flow (navigate -> adapter -> FormEngine.fill
 * -> review -> submit) on every fixture, using the same code path as
 * AutoApplyEngine.submitApplication but with a local browser context.
 *
 *   npx tsx packages/form-bench/src/apply-flow-check.ts [--only=<id>]
 *
 * Expected: forms whose required fields are all answerable get submitted;
 * forms with unresolved required fields or walls are left for the user.
 */
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { startFixtureServers } from './server.ts';
import { BENCH_ROOT, FIXTURES_DIR, loadProfile } from './fixtures/build.ts';
import type { AnswerKey } from './fixtures/kit.ts';
import { AutoApplyEngine } from '../../automation/src/auto-apply-engine.ts';
import { runFormEngineApply } from '../../automation/src/apply-flow.ts';
import type { MasterProfile } from '../../form-engine/src/profile.ts';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const PORTAL: Record<string, 'ashby' | 'greenhouse' | 'lever' | 'internshala' | 'workday' | 'generic'> = { ashby: 'ashby', greenhouse: 'greenhouse', lever: 'lever', internshala: 'internshala', workday: 'workday', other: 'generic' };

async function main() {
  globalThis.fetch = (async () => { throw new Error('network disabled'); }) as typeof fetch;
  const ids = fs.readdirSync(FIXTURES_DIR).filter((d) => !d.startsWith('_') && (!args.only || d.includes(args.only))).sort();
  const servers = await startFixtureServers(FIXTURES_DIR);
  const executablePath = [process.env.BENCH_CHROMIUM, '/opt/pw-browsers/chromium'].find((p) => p && fs.existsSync(p));
  const browser = await chromium.launch({ executablePath });
  const rows: string[] = [];
  for (const id of ids) {
    const key = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, id, 'expected.json'), 'utf8')) as AnswerKey;
    const profile = loadProfile(key.profile) as MasterProfile;
    profile.resumeFilePath = path.join(BENCH_ROOT, 'profiles', 'sample-resume.pdf');
    const ctx = await browser.newContext();
    await ctx.addInitScript({ content: 'window.__name = window.__name || ((f) => f);' });
    const events: string[] = [];
    const t0 = Date.now();
    const res = await runFormEngineApply(AutoApplyEngine, ctx, `${servers.originA}/${id}/index.html`, profile, (e) => { if (typeof e !== 'string' && e.formEvent) events.push(e.formEvent.type); }, { portal: PORTAL[key.ats] });
    const submitted = await Promise.all(ctx.pages().flatMap((p) => p.frames()).map((f) => f.evaluate(() => Boolean((window as any).__submitted)).catch(() => false)));
    const pending = res.needsUser?.filter((n) => n.required).map((n) => n.label) || [];
    const row = `${id.padEnd(28)} filled ${String(res.fieldsFilledCount ?? 0).padStart(2)}  submitted ${res.submitted ? 'yes' : 'no '} (page saw submit: ${submitted.some(Boolean) ? 'yes' : 'no'})  login ${res.requiresLogin ? 'yes' : 'no'}  needs_user(required) ${pending.length}${pending.length ? ' [' + pending.join('; ').slice(0, 80) + ']' : ''}  events ${events.length}  ${((Date.now() - t0) / 1000).toFixed(1)}s`;
    console.log(row);
    if (args.verbose) for (const n of res.needsUser || []) console.log(`      needs_user: ${n.label} :: ${n.reason}`);
    rows.push(row);
    await ctx.close();
  }
  await browser.close();
  await servers.close();
  if (args.write) fs.writeFileSync(path.join(BENCH_ROOT, 'results', 'apply-flow-check.txt'), rows.join('\n') + '\n');
}
main().catch((e) => { console.error(e); process.exit(1); });

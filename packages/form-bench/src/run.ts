/**
 * Form-filling benchmark runner.
 *
 *   (--engine=old, the legacy chain, was removed in Step 1.7; baseline kept in results/baseline.*)
 *   npm run bench:forms -- --engine=new            # FormEngine   -> results/new-engine.{json,md}
 *   options: --only=<substring>  --llm=mock|none (new engine)  --out=<name>  --headed
 *
 * Each fixture is served from a local static server (plus a second origin for
 * cross-origin iframes), loaded in headless Chromium, filled by the engine, and
 * scored field by field against fixtures/<id>/expected.json. Outbound network is
 * disabled so runs are deterministic and never hit an LLM provider.
 */
import fs from 'fs';
import path from 'path';
import { chromium, type Browser } from 'playwright';
import { startFixtureServers } from './server.ts';
import { scoreFixture, type FieldScore } from './score.ts';
import { BENCH_ROOT, FIXTURES_DIR, loadProfile } from './fixtures/build.ts';
import type { AnswerKey } from './fixtures/kit.ts';
import type { BenchEngine, EngineRunInfo } from './engines/types.ts';
import type { MasterProfile } from '../../form-engine/src/profile.ts';

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const [k, ...v] = a.slice(2).split('=');
    return [k, v.length ? v.join('=') : 'true'];
  })
) as Record<string, string>;

const engineName = (args.engine || 'new') as 'old' | 'new';
const RESULTS_DIR = path.join(BENCH_ROOT, 'results');

export interface FormResult {
  id: string;
  ats: string;
  title: string;
  fields: number;
  found: number | null;
  filled: number;
  correct: number;
  wrong: number;
  skipped: number;
  missing: number;
  timeMs: number;
  submitClicked: boolean;
  wallsExpected: string[];
  wallsReported: string[];
  needsUser: number | null;
  llmCalls: number | null;
  error?: string;
  notes?: string[];
  details: FieldScore[];
}

function findChromium(): string | undefined {
  const candidates = [process.env.BENCH_CHROMIUM, process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, '/opt/pw-browsers/chromium'];
  return candidates.find((c) => c && fs.existsSync(c));
}

function disableNetwork() {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(url)) return realFetch(input, init);
    throw new Error(`network disabled in benchmark: ${url.split('?')[0]}`);
  }) as typeof fetch;
}

async function loadEngine(): Promise<BenchEngine> {
  if (engineName === 'new') {
    const mod = await import('./engines/new.ts');
    return mod.createNewEngine({ llm: (args.llm as 'mock' | 'none') || 'mock' });
  }
  // The legacy engine was deleted in Step 1.7. Its scoreboard is results/baseline.{json,md};
  // to re-run it, check out commit 14b3480 (last commit with the legacy solvers).
  throw new Error('--engine=old was removed with the legacy solvers (Step 1.7); see results/baseline.md or check out commit 14b3480');
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms))]);
}

async function runFixture(browser: Browser, engine: BenchEngine, key: AnswerKey, origin: string): Promise<FormResult> {
  const profile = loadProfile(key.profile) as MasterProfile;
  profile.resumeFilePath = path.join(BENCH_ROOT, 'profiles', 'sample-resume.pdf');
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // tsx compiles with keepNames, which wraps functions passed to page.evaluate in __name(); shim it in every frame.
  await context.addInitScript({ content: 'window.__name = window.__name || ((f) => f);' });
  const page = await context.newPage();
  let info: EngineRunInfo = {};
  let error: string | undefined;
  await page.goto(`${origin}/${key.id}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => (window as any).__fixtureReady === true, null, { timeout: 5000 }).catch(() => {});
  for (const f of page.frames()) await f.waitForLoadState('load').catch(() => {});
  const t0 = Date.now();
  try {
    info = await withTimeout(engine.run(page, profile, key), 120_000, key.id);
  } catch (err: any) {
    error = err?.message || String(err);
  }
  const timeMs = Date.now() - t0;
  await page.waitForTimeout(250);
  const details = await scoreFixture(page, key, info.fields);
  let submitClicked = false;
  for (const f of page.frames()) {
    submitClicked = submitClicked || (await f.evaluate(() => Boolean((window as any).__submitted)).catch(() => false));
  }
  await context.close();
  const count = (v: FieldScore['verdict']) => details.filter((d) => d.verdict === v).length;
  const isFilled = (d: FieldScore) => (Array.isArray(d.actual) ? d.actual.length > 0 : d.actual !== '' && d.actual !== 'false');
  return {
    id: key.id, ats: key.ats, title: key.title,
    fields: details.length,
    found: info.fields ? details.filter((d) => d.found).length : null,
    filled: details.filter(isFilled).length,
    correct: count('correct'), wrong: count('wrong'), skipped: count('skipped'), missing: count('missing'),
    timeMs, submitClicked,
    wallsExpected: key.walls, wallsReported: info.walls || [],
    needsUser: info.needsUser ?? null, llmCalls: info.llmCalls ?? null,
    error, notes: info.notes, details,
  };
}

function pct(n: number, d: number) { return d ? `${((100 * n) / d).toFixed(1)}%` : '-'; }

export function summarize(results: FormResult[]) {
  const sum = (k: keyof FormResult) => results.reduce((n, r) => n + (typeof r[k] === 'number' ? (r[k] as number) : 0), 0);
  const fields = sum('fields');
  const byCat: Record<string, { n: number; correct: number; wrong: number; skipped: number }> = {};
  for (const r of results) for (const d of r.details) {
    const c = (byCat[d.category] ||= { n: 0, correct: 0, wrong: 0, skipped: 0 });
    c.n++;
    if (d.verdict === 'correct') c.correct++;
    else if (d.verdict === 'wrong') c.wrong++;
    else c.skipped++;
  }
  return {
    forms: results.length, fields,
    found: results.every((r) => r.found !== null) ? sum('found') : null,
    filled: sum('filled'), correct: sum('correct'), wrong: sum('wrong'), skipped: sum('skipped'), missing: sum('missing'),
    accuracy: fields ? sum('correct') / fields : 0,
    wrongRate: fields ? sum('wrong') / fields : 0,
    wrongPerFilled: sum('filled') ? sum('wrong') / sum('filled') : 0,
    submitClicked: results.filter((r) => r.submitClicked).length,
    wallsDetected: results.filter((r) => r.wallsExpected.length && r.wallsExpected.every((w) => r.wallsReported.includes(w))).length,
    wallsExpected: results.filter((r) => r.wallsExpected.length).length,
    totalTimeMs: sum('timeMs'),
    byCategory: byCat,
  };
}

function markdown(results: FormResult[], title: string, extra: string): string {
  const s = summarize(results);
  const lines: string[] = [];
  lines.push(`# ${title}`, '', extra, '');
  lines.push(`Generated by \`npm run bench:forms -- --engine=${engineName}${engineName === 'new' ? ` --llm=${args.llm || 'mock'}` : ''}\` on ${new Date().toISOString().slice(0, 10)}.`, '');
  lines.push('## Totals', '');
  lines.push('| Forms | Fields | Found | Filled | Correct | Wrong | Skipped | Accuracy | Wrong rate (of fields) | Wrong rate (of filled) | Submit clicked | Walls reported | Total time |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  lines.push(`| ${s.forms} | ${s.fields} | ${s.found ?? 'n/a'} | ${s.filled} | ${s.correct} | ${s.wrong} | ${s.skipped + s.missing} | ${pct(s.correct, s.fields)} | ${pct(s.wrong, s.fields)} | ${pct(s.wrong, s.filled)} | ${s.submitClicked}/${s.forms} | ${s.wallsDetected}/${s.wallsExpected} | ${(s.totalTimeMs / 1000).toFixed(1)}s |`);
  lines.push('', '## By answer category', '', '| Category | Fields | Correct | Wrong | Skipped | Accuracy |', '|---|---|---|---|---|---|');
  for (const [c, v] of Object.entries(s.byCategory)) lines.push(`| ${c} | ${v.n} | ${v.correct} | ${v.wrong} | ${v.skipped} | ${pct(v.correct, v.n)} |`);
  lines.push('', '## Per form', '', '| Fixture | ATS | Fields | Found | Filled | Correct | Wrong | Skipped | Time | Submit clicked | Notes |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    const note = [r.error ? `error: ${r.error}` : '', r.wallsExpected.length ? `walls expected ${r.wallsExpected.join(',')}, reported ${r.wallsReported.join(',') || 'none'}` : '', r.llmCalls != null ? `llm calls ${r.llmCalls}` : '', r.needsUser != null ? `needs_user ${r.needsUser}` : ''].filter(Boolean).join('; ');
    lines.push(`| ${r.id} | ${r.ats} | ${r.fields} | ${r.found ?? 'n/a'} | ${r.filled} | ${r.correct} | ${r.wrong} | ${r.skipped + r.missing} | ${(r.timeMs / 1000).toFixed(1)}s | ${r.submitClicked ? 'yes' : 'no'} | ${note} |`);
  }
  lines.push('', '## Wrong answers', '', '| Fixture | Field | Expected | Actual |', '|---|---|---|---|');
  for (const r of results) for (const d of r.details) if (d.verdict === 'wrong') {
    const fmt = (v: unknown) => String(Array.isArray(v) ? v.join(' / ') : v).replace(/\|/g, '\\|').slice(0, 90);
    lines.push(`| ${r.id} | ${fmt(d.label)} | ${fmt(d.expected)} | ${fmt(d.actual)} |`);
  }
  lines.push('', '## Definitions', '',
    '- **Fields**: entries in the fixture answer key (`expected.json`).',
    '- **Found**: answer-key fields the engine\'s FormReader detected (the legacy engine has no reader, so n/a).',
    '- **Filled**: answer-key fields holding a value after the run (after a simulated React re-render, so values that did not "stick" count as empty).',
    '- **Correct**: value matches the key (`@empty` = must stay empty, `@nonempty` = any answer, `@file` = a file attached).',
    '- **Wrong**: a value that does not match, including anything written into a field whose answer is not in the profile (`trap`) and opt-ins that should stay unchecked.',
    '- **Skipped**: left empty although an answer was expected.',
    '- **Submit clicked**: the engine pressed submit on its own (the fixture intercepts it).', '');
  return lines.join('\n');
}

async function main() {
  disableNetwork();
  const engine = await loadEngine();
  const ids = fs.readdirSync(FIXTURES_DIR).filter((d) => !d.startsWith('_') && fs.existsSync(path.join(FIXTURES_DIR, d, 'expected.json'))).sort();
  const selected = args.only ? ids.filter((i) => args.only.split(',').some((o) => i.includes(o))) : ids;
  const servers = await startFixtureServers(FIXTURES_DIR);
  const browser = await chromium.launch({ headless: args.headed !== 'true', executablePath: findChromium() });
  const results: FormResult[] = [];
  try {
    for (const id of selected) {
      const key = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, id, 'expected.json'), 'utf8')) as AnswerKey;
      const r = await runFixture(browser, engine, key, servers.originA);
      results.push(r);
      console.log(`${id.padEnd(28)} fields ${String(r.fields).padStart(2)}  found ${String(r.found ?? '-').padStart(2)}  filled ${String(r.filled).padStart(2)}  correct ${String(r.correct).padStart(2)}  wrong ${String(r.wrong).padStart(2)}  skipped ${String(r.skipped + r.missing).padStart(2)}  ${(r.timeMs / 1000).toFixed(1)}s${r.submitClicked ? '  SUBMIT-CLICKED' : ''}${r.error ? '  ERROR ' + r.error : ''}`);
    }
  } finally {
    await browser.close();
    await servers.close();
  }
  const s = summarize(results);
  console.log(`\nTOTAL forms ${s.forms} fields ${s.fields} correct ${s.correct} wrong ${s.wrong} skipped ${s.skipped + s.missing} accuracy ${pct(s.correct, s.fields)} wrong-rate ${pct(s.wrong, s.fields)} (of filled ${pct(s.wrong, s.filled)}) submit-clicked ${s.submitClicked}`);

  const outName = args.out || (engineName === 'old' ? 'baseline' : args.llm === 'none' ? 'new-engine-no-llm' : 'new-engine');
  if (!args.only || args.out) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(path.join(RESULTS_DIR, `${outName}.json`), JSON.stringify({ engine: engineName, llm: engineName === 'new' ? args.llm || 'mock' : null, summary: s, results }, null, 2) + '\n');
    const title = engineName === 'old' ? 'Form benchmark: baseline (legacy engine)' : `Form benchmark: new FormEngine (${args.llm === 'none' ? 'no LLM' : 'mock LLM'})`;
    const extra = engineName === 'old'
      ? 'Legacy chain from `AutoApplyEngine.submitApplication` (specialized bot, AI pilot, FormFiller, OmniFormSolver with auto-submit, FormSubmitter, stepper) run against static fixtures with network disabled.'
      : '`FormEngine` via the ATS adapters in `packages/automation/src/bots`, network disabled. With `--llm=mock`, the single batched LLM call is answered by a deterministic stub (open-ended questions only; profile facts never come from the model).';
    fs.writeFileSync(path.join(RESULTS_DIR, `${outName}.md`), markdown(results, title, extra));
    console.log(`Wrote results/${outName}.json and results/${outName}.md`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

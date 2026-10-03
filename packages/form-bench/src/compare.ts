/**
 * Adds the old-vs-new comparison and the Step 1.7 gate to results/new-engine.md.
 *   npx tsx packages/form-bench/src/compare.ts
 */
import fs from 'fs';
import path from 'path';
import { BENCH_ROOT } from './fixtures/build.ts';

const R = path.join(BENCH_ROOT, 'results');
const load = (n: string) => (fs.existsSync(path.join(R, `${n}.json`)) ? JSON.parse(fs.readFileSync(path.join(R, `${n}.json`), 'utf8')) : null);
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

const old = load('baseline');
const neu = load('new-engine');
const noLlm = load('new-engine-no-llm');
if (!old || !neu) throw new Error('run the old and new benchmarks first');

const row = (name: string, s: any) =>
  `| ${name} | ${s.fields} | ${s.found ?? 'n/a'} | ${s.filled} | ${s.correct} | ${s.wrong} | ${s.skipped + s.missing} | ${pct(s.accuracy)} | ${pct(s.wrongRate)} | ${pct(s.wrongPerFilled)} | ${s.submitClicked}/${s.forms} | ${s.wallsDetected}/${s.wallsExpected} | ${(s.totalTimeMs / 1000).toFixed(1)}s |`;

const gatePass = neu.summary.accuracy >= old.summary.accuracy && neu.summary.wrongRate < 0.02 && (!noLlm || (noLlm.summary.wrongRate < 0.02 && noLlm.summary.accuracy >= old.summary.accuracy));
const cats = Object.keys({ ...old.summary.byCategory, ...neu.summary.byCategory });
const catRows = cats.map((c) => {
  const o = old.summary.byCategory[c] || { n: 0, correct: 0, wrong: 0 };
  const n = neu.summary.byCategory[c] || { n: 0, correct: 0, wrong: 0 };
  const m = noLlm?.summary.byCategory[c] || { n: 0, correct: 0, wrong: 0 };
  const f = (v: any) => (v.n ? `${v.correct}/${v.n} (${v.wrong} wrong)` : '-');
  return `| ${c} | ${f(o)} | ${f(n)} | ${noLlm ? f(m) : '-'} |`;
});

const section = [
  '## Old vs new',
  '',
  '| Engine | Fields | Found | Filled | Correct | Wrong | Skipped | Accuracy | Wrong rate (of fields) | Wrong rate (of filled) | Submit clicked | Walls reported | Total time |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  row('legacy (baseline)', old.summary),
  row('FormEngine, mock LLM', neu.summary),
  ...(noLlm ? [row('FormEngine, no LLM', noLlm.summary)] : []),
  '',
  '| Category | Legacy | FormEngine (mock LLM) | FormEngine (no LLM) |',
  '|---|---|---|---|',
  ...catRows,
  '',
  '### Step 1.7 gate',
  '',
  `Gate: new accuracy >= legacy accuracy and wrong-answer rate < 2% (both LLM modes). Result: **${gatePass ? 'PASS' : 'FAIL'}** ` +
    `(legacy ${pct(old.summary.accuracy)} / ${pct(old.summary.wrongRate)} wrong; new ${pct(neu.summary.accuracy)} / ${pct(neu.summary.wrongRate)} wrong` +
    `${noLlm ? `; new without LLM ${pct(noLlm.summary.accuracy)} / ${pct(noLlm.summary.wrongRate)} wrong` : ''}).`,
  '',
  '### Caveats',
  '',
  '- The fixtures are static re-creations of ATS markup patterns written for this benchmark, not captured live pages (live capture is scripted in `src/capture.ts` but needs real URLs). The new engine was developed against the same fixtures, so its score is an upper bound until live captures are added; the legacy engine was not tuned to them.',
  '- "Mock LLM" stands in for the one batched Groq call and answers only open-ended prose (11 fields). Without an LLM those fields become `needs_user` instead of being filled.',
  '- The legacy run disables network, so its Gemini/Groq calls fail fast and it falls back to its built-in templates, as it would offline.',
  '',
].join('\n');

const file = path.join(R, 'new-engine.md');
let body = fs.readFileSync(file, 'utf8');
body = body.replace(/## Old vs new[\s\S]*?(?=## Totals)/, '');
body = body.replace('## Totals', `${section}\n## Totals`);
fs.writeFileSync(file, body);
console.log(`gate ${gatePass ? 'PASS' : 'FAIL'}; wrote ${path.relative(process.cwd(), file)}`);

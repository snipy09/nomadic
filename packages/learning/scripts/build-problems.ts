/**
 * Writes scripts/seed-source/v2/problems.json: one ProblemInfo per curated
 * problem slug, built from packages/app-core/data/practice/leetcode-companies.json
 * (company counts, tags, difficulty) plus the paid-only flags. Fails when a
 * curated slug is not in the dataset. Run before build-seed after changing
 * problem lists: `npm run build-problems -w @job-automator/learning`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { buildProblemIndex, type CompanyDataset } from '../src/v2/problems';
import { curatedSlugs } from './seed-source/v2';
import { KNOWN_PAID_ONLY } from './seed-source/v2/paid-only';

const datasetUrl = new URL('../../../packages/app-core/data/practice/leetcode-companies.json', import.meta.url);
const paidUrl = new URL('./seed-source/v2/paid-only.json', import.meta.url);
const outUrl = new URL('./seed-source/v2/problems.json', import.meta.url);

const dataset = JSON.parse(readFileSync(datasetUrl, 'utf8')) as CompanyDataset;
const checked: Record<string, boolean> = existsSync(paidUrl) ? JSON.parse(readFileSync(paidUrl, 'utf8')) : {};
const paid: Record<string, boolean> = { ...Object.fromEntries(KNOWN_PAID_ONLY.map((s) => [s, true])), ...checked };

const index = new Map(buildProblemIndex(dataset, paid).map((p) => [p.ref, p]));
const slugs = curatedSlugs();
const missing = slugs.filter((s) => !index.has(`lc:${s}`));
if (missing.length) {
  console.error(`not in the dataset: ${missing.join(', ')}`);
  process.exit(1);
}
const out = slugs.map((s) => index.get(`lc:${s}`)!);
writeFileSync(outUrl, JSON.stringify(out, null, 1) + '\n');
const flagged = out.filter((p) => p.paid_only === true).length;
console.log(`problems.json: ${out.length} problems (${flagged} paid-only, ${out.filter((p) => p.paid_only === null).length} not checked)`);

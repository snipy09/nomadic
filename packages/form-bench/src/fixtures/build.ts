/**
 * Generates every fixture page and answer key into packages/form-bench/fixtures/.
 *   npx tsx packages/form-bench/src/fixtures/build.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resetUuid, type Fixture } from './kit.ts';
import { ashbyFixtures } from './ashby.ts';
import { greenhouseFixtures } from './greenhouse.ts';
import { leverFixtures } from './lever.ts';
import { internshalaFixtures } from './internshala.ts';
import { workdayFixtures } from './workday.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Profile = Record<string, any>;

const here = path.dirname(fileURLToPath(import.meta.url));
export const BENCH_ROOT = path.resolve(here, '..', '..');
export const FIXTURES_DIR = path.join(BENCH_ROOT, 'fixtures');

export function loadProfile(file: string): Profile {
  return JSON.parse(fs.readFileSync(path.join(BENCH_ROOT, 'profiles', file), 'utf8'));
}

export function buildAll(): Fixture[] {
  resetUuid();
  const sample = loadProfile('sample.json');
  const intern = loadProfile('intern.json');
  return [
    ...ashbyFixtures(sample),
    ...greenhouseFixtures(sample),
    ...leverFixtures(sample),
    ...internshalaFixtures(intern),
    ...workdayFixtures(sample),
  ];
}

function main() {
  const fixtures = buildAll();
  const ids = new Set<string>();
  for (const f of fixtures) {
    if (ids.has(f.key.id)) throw new Error(`duplicate fixture id ${f.key.id}`);
    ids.add(f.key.id);
    const dir = path.join(FIXTURES_DIR, f.key.id);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(f.files)) fs.writeFileSync(path.join(dir, name), content);
    fs.writeFileSync(path.join(dir, 'expected.json'), JSON.stringify(f.key, null, 2) + '\n');
  }
  const total = fixtures.reduce((n, f) => n + Object.keys(f.key.fields).length, 0);
  console.log(`Wrote ${fixtures.length} fixtures (${total} answer-key fields) to ${path.relative(process.cwd(), FIXTURES_DIR)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

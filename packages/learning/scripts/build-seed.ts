/** Writes the validated content bundle to seed/bundle.json (fails on validation errors). */
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildSeedBundle, validateContentBundle } from '../src';

const bundle = buildSeedBundle();
const report = validateContentBundle(bundle);
report.warnings.forEach((w) => console.warn(`warn: ${w}`));
if (report.errors.length) {
  report.errors.forEach((e) => console.error(`error: ${e}`));
  process.exit(1);
}
mkdirSync(new URL('../seed/', import.meta.url), { recursive: true });
writeFileSync(new URL('../seed/bundle.json', import.meta.url), JSON.stringify(bundle, null, 2) + '\n');
console.log(
  `seed/bundle.json: ${bundle.skills.length} skills, ${bundle.resources.length} resources, ${bundle.practice_items.length} items`
);

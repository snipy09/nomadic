/**
 * Builds the content bundle in memory and validates it without writing anything
 * (safe to run while someone else edits the sources). Optional argument: a module
 * id prefix to print topic stats for, e.g. `npx tsx scripts/check-content.ts dev.react`.
 */
import { LearnTopicSchema, buildSeedBundle, validateContentBundle } from '../src';

const bundle = buildSeedBundle();
const report = validateContentBundle(bundle);
let bad = 0;
for (const t of bundle.topics) {
  const r = LearnTopicSchema.safeParse(t);
  if (!r.success) {
    bad++;
    console.error(`topic ${t.id}: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
}
for (const e of report.errors) console.error(`error: ${e}`);
const prefix = process.argv[2];
if (prefix) {
  for (const t of bundle.topics.filter((x) => x.id.startsWith(prefix))) {
    const tasks = t.tasks.reduce((n, k) => n + k.minutes, 0);
    console.log(`${t.id} [${t.tier}] learn ${t.learn_minutes} min, tasks ${tasks} min, ${t.learn_items.length} learn items, ${t.quiz_item_ids.length} quiz`);
  }
}
console.log(`${bundle.topics.length} topics, ${bundle.practice_items.length} practice items, ${report.errors.length + bad} errors`);
process.exit(report.errors.length + bad ? 1 : 0);

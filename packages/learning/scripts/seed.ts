/** Upserts the content bundle into Supabase (service role). Resources keep their link-check status. */
import { createClient } from '@supabase/supabase-js';
import { buildSeedBundle, validateContentBundle } from '../src';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
const b = buildSeedBundle();
const report = validateContentBundle(b);
if (report.errors.length) throw new Error(report.errors.join('\n'));
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function up(table: string, rows: object[], onConflict: string, ignoreDuplicates = false) {
  const { error } = await db.from(table).upsert(rows, { onConflict, ignoreDuplicates });
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`${table}: ${rows.length}`);
}

await up('skills', b.skills, 'id');
await up('skill_prerequisites', b.prerequisites, 'skill_id,prerequisite_id');
await up('role_families', b.roles, 'id');
await up('role_skills', b.role_skills, 'role_id,skill_id');
// New resources start unverified; existing rows keep status from the link checker.
await up(
  'learning_resources',
  b.resources.map(({ status: _s, last_checked: _l, http_status: _h, fail_count: _f, ...r }) => r),
  'id',
  true
);
await up('lessons', b.lessons, 'id');
await up(
  'practice_items',
  b.practice_items.map((p) => ({
    id: p.id,
    skill_id: p.skill_id,
    lesson_id: p.lesson_id,
    kind: p.kind,
    difficulty: p.difficulty,
    company_tags: p.company_tags,
    body: p,
    status: p.status,
    ai_drafted: p.ai_drafted,
    version: p.version,
  })),
  'id'
);

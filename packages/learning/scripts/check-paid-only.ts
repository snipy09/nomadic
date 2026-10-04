/**
 * Asks LeetCode's public GraphQL API whether each curated problem is
 * paid-only (question(titleSlug){isPaidOnly}) and writes
 * scripts/seed-source/v2/paid-only.json. Run on a machine with internet
 * access, then `npm run build-problems` and `npm run build-seed`.
 * Unanswered slugs are left out (they stay "not checked").
 */
import { writeFileSync } from 'node:fs';
import { curatedSlugs } from './seed-source/v2';

const QUERY = 'query q($s: String!) { question(titleSlug: $s) { isPaidOnly } }';

async function isPaidOnly(slug: string): Promise<boolean | null> {
  try {
    const res = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Referer: 'https://leetcode.com', 'User-Agent': 'NomadicContentCheck/1.0' },
      body: JSON.stringify({ query: QUERY, variables: { s: slug } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { question?: { isPaidOnly?: boolean } | null } };
    const v = body.data?.question?.isPaidOnly;
    return typeof v === 'boolean' ? v : null;
  } catch {
    return null;
  }
}

async function main() {
  const out: Record<string, boolean> = {};
  const slugs = curatedSlugs();
  for (const [i, slug] of slugs.entries()) {
    const v = await isPaidOnly(slug);
    if (v !== null) out[slug] = v;
    console.log(`${String(i + 1).padStart(4)}/${slugs.length} ${v === null ? 'unknown' : v ? 'PAID' : 'free'} ${slug}`);
    await new Promise((r) => setTimeout(r, 250));
  }
  writeFileSync(new URL('./seed-source/v2/paid-only.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
  console.log(`checked ${Object.keys(out).length} of ${slugs.length}; ${Object.values(out).filter(Boolean).length} paid-only`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Link checker for learning_resources (run weekly). HEAD then GET; 2xx/3xx =>
 * active, 404/410 or 3 consecutive failures => broken (hidden by RLS).
 * Usage: tsx scripts/check-links.ts            (checks the seed, prints a report)
 *        tsx scripts/check-links.ts --update   (updates Supabase; needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
 */
import { buildSeedBundle, type LearningResource } from '../src';

export type LinkVerdict = { status: 'active' | 'broken' | 'unknown'; http_status: number | null };

export async function checkResource(url: string, fetchImpl: typeof fetch = fetch): Promise<LinkVerdict> {
  const init = {
    redirect: 'follow' as const,
    signal: AbortSignal.timeout(10_000),
    headers: { 'User-Agent': 'NomadicLinkCheck/1.0' },
  };
  try {
    let res = await fetchImpl(url, { ...init, method: 'HEAD' });
    if (res.status === 405 || res.status === 403) res = await fetchImpl(url, { ...init, method: 'GET' });
    if (res.status < 400) return { status: 'active', http_status: res.status };
    if (res.status === 404 || res.status === 410) return { status: 'broken', http_status: res.status };
    return { status: 'unknown', http_status: res.status };
  } catch {
    return { status: 'unknown', http_status: null };
  }
}

/** Next row state: unknown results only become broken after 3 consecutive failures. */
export function nextResourceState(r: Pick<LearningResource, 'status' | 'fail_count'>, v: LinkVerdict) {
  if (v.status === 'active') return { status: 'active' as const, fail_count: 0 };
  const fail_count = r.fail_count + 1;
  if (v.status === 'broken' || fail_count >= 3) return { status: 'broken' as const, fail_count };
  return { status: r.status, fail_count };
}

async function main() {
  const update = process.argv.includes('--update');
  const resources = buildSeedBundle().resources;
  let client: any = null;
  let rows: LearningResource[] = resources;
  if (update) {
    const { createClient } = await import('@supabase/supabase-js');
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await client.from('learning_resources').select('*').neq('status', 'retired');
    if (error) throw error;
    rows = data;
  }
  for (const r of rows) {
    const v = await checkResource(r.url);
    const next = nextResourceState(r, v);
    console.log(`${next.status.padEnd(10)} ${String(v.http_status ?? '-').padEnd(4)} ${r.url}`);
    if (client) {
      await client
        .from('learning_resources')
        .update({ ...next, http_status: v.http_status, last_checked: new Date().toISOString() })
        .eq('id', r.id);
    }
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!))
  main().catch((e) => (console.error(e), process.exit(1)));

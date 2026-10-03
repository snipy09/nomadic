import type { Logger } from '../sources/types.ts';
import type { ScrapeAlert, SourceRunStats } from './types.ts';

/**
 * Health alerts: a source that returns 0 records, or drops by more than 50%
 * versus its previous run.
 */
export function computeAlerts(
  sources: SourceRunStats[],
  previous: Record<string, number | null>,
  dropThreshold = 0.5,
): ScrapeAlert[] {
  const alerts: ScrapeAlert[] = [];
  for (const s of sources) {
    if (s.status === 'skipped') continue;
    const prev = previous[s.key] ?? null;
    if (s.fetched === 0) {
      alerts.push({
        source: s.key,
        kind: 'zero',
        current: 0,
        previous: prev,
        message: `${s.label} (${s.key}) returned 0 jobs${prev ? ` (previous run: ${prev})` : ''}${s.errors[0] ? `; first error: ${s.errors[0]}` : ''}`,
      });
    } else if (prev !== null && prev > 0 && s.fetched < prev * (1 - dropThreshold)) {
      const pct = Math.round((1 - s.fetched / prev) * 100);
      alerts.push({
        source: s.key,
        kind: 'drop',
        current: s.fetched,
        previous: prev,
        message: `${s.label} (${s.key}) dropped ${pct}% vs last run (${prev} -> ${s.fetched})`,
      });
    }
  }
  return alerts;
}

/**
 * Logs alerts and, when `webhookUrl` is set (SCRAPER_ALERT_WEBHOOK_URL), POSTs a
 * Slack/Discord-compatible payload: `{ text, content, alerts }`.
 */
export async function dispatchAlerts(
  alerts: ScrapeAlert[],
  opts: { log: Logger; webhookUrl?: string; fetchImpl?: typeof fetch; runId?: string },
): Promise<{ delivered: boolean; error?: string }> {
  if (alerts.length === 0) return { delivered: false };
  for (const a of alerts) opts.log.warn(`[scrape alert] ${a.message}`);
  if (!opts.webhookUrl) return { delivered: false };

  const text = `Nomadic scraper alert${opts.runId ? ` (run ${opts.runId})` : ''}:\n${alerts.map(a => `- ${a.message}`).join('\n')}`;
  try {
    const res = await (opts.fetchImpl ?? fetch)(opts.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, content: text, alerts }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { delivered: false, error: `webhook HTTP ${res.status}` };
    return { delivered: true };
  } catch (err) {
    return { delivered: false, error: err instanceof Error ? err.message : String(err) };
  }
}

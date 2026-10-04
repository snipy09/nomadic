import type { PipelineReport, SourceStats } from './run.js';

/** Human-readable views of a PipelineReport (console table, markdown benchmark). */

function pct(part: number, whole: number): string {
  if (whole === 0) return '–';
  return `${Math.round((part / whole) * 1000) / 10}%`;
}

export function formatRunTable(report: PipelineReport): string {
  const header = [
    'source',
    'tier',
    'status',
    'fetched',
    'valid',
    'invalid',
    'dupes',
    'link fail',
    'upserted',
    'expired',
    'ms',
    'alert',
  ];
  const rows = report.sources.map((s) => [
    s.source,
    String(s.tier),
    s.status,
    String(s.fetched),
    String(s.valid),
    String(s.invalid),
    String(s.duplicates),
    String(s.linkFailed),
    String(s.upserted),
    String(s.expired),
    String(s.durationMs),
    s.alert ?? '',
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  return [line(header), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n');
}

/** Plain-text summary written after every run (opens in Notepad). */
export function formatRunSummary(report: PipelineReport, opts: { maxNew?: number; region?: string } = {}): string {
  const t = report.totals;
  const secs = Math.max(0, Math.round((Date.parse(report.finishedAt) - Date.parse(report.startedAt)) / 1000));
  const local = (iso: string) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const failed = report.sources.filter((s) => s.status === 'error' || s.alert);
  const lines = [
    'NOMADIC SCRAPE SUMMARY',
    '======================',
    `Run:        ${report.runId}`,
    `Started:    ${local(report.startedAt)} IST (took ${Math.floor(secs / 60)}m ${secs % 60}s)`,
    `Mode:       ${report.published ? 'published to Supabase' : 'dry run (nothing written)'}${opts.region ? `, region ${opts.region}` : ''}`,
    '',
    `New jobs added:        ${t.newJobs}${opts.maxNew ? ` (limit ${opts.maxNew} per run)` : ''}`,
    `Existing jobs updated: ${t.refreshed}`,
    `Left for next run:     ${t.deferred}`,
    `Duplicates skipped:    ${t.duplicates}`,
    `Dead/closed links:     ${t.linkFailed}`,
    `Expired (no longer listed or dead): ${t.expired + t.legacyExpired}`,
    `Fetched in total:      ${t.fetched} (${t.valid} valid)`,
    '',
    'BY SOURCE',
    formatRunTableWithNew(report),
    '',
    failed.length
      ? `PROBLEMS\n${failed.map((s) => `- ${s.source}: ${s.error ?? s.alert}`).join('\n')}`
      : 'PROBLEMS\n- none',
  ];
  const warnings = report.sources.flatMap((s) => s.warnings.map((w) => `- ${s.source}: ${w}`));
  if (warnings.length) lines.push('', 'WARNINGS', ...warnings);
  if (report.newJobs.length) {
    lines.push('', `NEW JOBS (${report.newJobs.length})`);
    report.newJobs.forEach((j, i) =>
      lines.push(`${String(i + 1).padStart(3)}. ${j.title} | ${j.company} | ${j.location || (j.remote ? 'Remote' : '-')} | ${j.source}`, `     ${j.applyUrl}`)
    );
  }
  return lines.join('\n') + '\n';
}

function formatRunTableWithNew(report: PipelineReport): string {
  const header = ['source', 'status', 'fetched', 'new', 'next run', 'dupes', 'link fail', 'expired'];
  const rows = report.sources.map((s) => [
    s.source,
    s.status,
    String(s.fetched),
    String(s.newJobs),
    String(s.deferred),
    String(s.duplicates),
    String(s.linkFailed),
    String(s.expired),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  return [line(header), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n');
}

/** One CSV line per run for a running history. */
export const SUMMARY_CSV_HEADER = 'started_at,run_id,published,new,updated,next_run,duplicates,link_failed,expired,fetched,problems';
export function formatSummaryCsvRow(report: PipelineReport): string {
  const t = report.totals;
  const problems = report.sources.filter((s) => s.status === 'error' || s.alert).map((s) => s.source).join(' ');
  return [report.startedAt, report.runId, report.published, t.newJobs, t.refreshed, t.deferred, t.duplicates, t.linkFailed, t.expired + t.legacyExpired, t.fetched, problems].join(',');
}

function benchRow(s: SourceStats): string {
  const checked = s.linkOk + s.linkFailed + s.linkUnknown;
  return [
    s.source,
    String(s.tier),
    String(s.fetched),
    pct(s.valid, s.fetched),
    pct(s.linkOk, checked),
    pct(s.duplicates, s.valid),
    pct(s.linkFailed, checked),
    String(s.durationMs),
    s.error ? s.error.replace(/\|/g, '/').slice(0, 80) : s.warnings.length ? `${s.warnings.length} warning(s)` : '',
  ].join(' | ');
}

/** Markdown scoreboard: one row per source (Step 0.4 metrics). */
export function formatBenchMarkdown(report: PipelineReport, title = 'Scraper benchmark'): string {
  const t = report.totals;
  return [
    `# ${title}`,
    '',
    `Run \`${report.runId}\` from ${report.startedAt} to ${report.finishedAt}. Link check: ${report.linkCheck}${
      report.linkCheck === 'http' ? ' (every apply URL fetched, including official-API links)' : ''
    }.`,
    '',
    '| source | tier | jobs returned | % schema-valid | % reachable apply URL | % duplicates (cross-source) | % closed/dead/invalid | run time (ms) | errors |',
    '|---|---|---|---|---|---|---|---|---|',
    ...report.sources.map((s) => `| ${benchRow(s)} |`),
    '',
    `Totals: ${t.fetched} fetched, ${t.valid} valid, ${t.duplicates} duplicates, ${t.linkFailed} failed link checks, ${t.unique} unique live jobs.`,
    '',
    'Definitions: *reachable* = HTTP check returned 2xx/3xx with no closed-job phrase, out of links checked (network errors count as not reachable). *Duplicates* = postings dropped because a higher-tier or richer copy of the same job (same canonical URL, or same company + title + location) was kept. *Closed/dead/invalid* = 404/410, a closed-job phrase on the page, or a directory/search URL instead of a posting.',
    '',
    report.alerts.length ? `Alerts:\n${report.alerts.map((a) => `- ${a}`).join('\n')}` : 'Alerts: none.',
    '',
  ].join('\n');
}

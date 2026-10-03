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

import React, { useMemo, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import {
  Badge, Button, Card, Checkbox, EmptyState, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@nomadic/ui';
import { getApi } from '../../types';
import { buildSourceHealth, formatDateTime, formatDuration, formatPercent, formatRelative } from './adminLogic';
import { AdminErrorState, LoadingRows } from './shared';
import { useAdminQuery } from './useAdminQuery';

const WINDOWS = [
  { value: '1', label: 'Last 24 hours' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
];

/** Scraper health from scrape_runs (written by the scrape pipeline) and live job counts. */
export function ScraperPanel() {
  const [days, setDays] = useState('7');
  const [failuresOnly, setFailuresOnly] = useState(false);
  const health = useAdminQuery(() => getApi().adminScrapeHealth(Number(days)), days);

  const sources = useMemo(
    () => (health.data ? buildSourceHealth(health.data.sources, health.data.activeJobsBySource) : []),
    [health.data],
  );
  const runs = (health.data?.runs ?? []).filter((r) => !failuresOnly || r.status === 'error');
  const totals = useMemo(() => {
    const all = health.data?.runs ?? [];
    return {
      runs: all.length,
      failures: all.filter((r) => r.status === 'error').length,
      activeJobs: Object.values(health.data?.activeJobsBySource ?? {}).reduce((a, b) => a + b, 0),
      failing: sources.filter((s) => s.tone === 'danger').length,
    };
  }, [health.data, sources]);

  let body: React.ReactNode;
  if (health.error) body = <AdminErrorState title="Could not load scraper health" error={health.error} code={health.code} onRetry={health.refresh} />;
  else if (health.loading && !health.data) body = <LoadingRows label="Loading scraper health" />;
  else if (sources.length === 0 && totals.runs === 0) {
    body = (
      <EmptyState bordered icon={<Activity />} title="No scraper runs in this window"
        description="Runs appear here after the scrape workflow publishes to the database. If it should have run, check the workflow logs." />
    );
  } else {
    body = (
      <div className="flex flex-col gap-6">
        <dl className="grid grid-cols-4 gap-3">
          {[
            ['Runs', totals.runs],
            ['Failed runs', totals.failures],
            ['Sources failing now', totals.failing],
            ['Active jobs', totals.activeJobs],
          ].map(([k, v]) => (
            <Card key={k} padding="sm" variant="sunken">
              <dt className="text-caption text-fg-subtle">{k}</dt>
              <dd className="text-title font-strong text-fg">{Number(v).toLocaleString()}</dd>
            </Card>
          ))}
        </dl>

        <section aria-labelledby="scraper-sources-heading" className="flex flex-col gap-3">
          <h3 id="scraper-sources-heading" className="text-heading font-strong text-fg">By source</h3>
          <Table aria-label="Sources">
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Health</TableHead>
                <TableHead align="right">Runs</TableHead>
                <TableHead align="right">Failure rate</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead>Last success</TableHead>
                <TableHead align="right">Upserted</TableHead>
                <TableHead align="right">Active jobs</TableHead>
                <TableHead>Last error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((s) => (
                <TableRow key={s.source}>
                  <TableCell className="font-strong">{s.source}</TableCell>
                  <TableCell><Badge tone={s.tone} size="sm" dot>{s.label}</Badge></TableCell>
                  <TableCell align="right">{s.runs}</TableCell>
                  <TableCell align="right">{s.runs ? formatPercent(s.failureRate) : 'None'}</TableCell>
                  <TableCell muted className="whitespace-nowrap">{formatRelative(s.lastRunAt)}</TableCell>
                  <TableCell muted className="whitespace-nowrap">{formatRelative(s.lastOkAt)}</TableCell>
                  <TableCell align="right">{s.upserted.toLocaleString()}</TableCell>
                  <TableCell align="right">{s.activeJobs.toLocaleString()}</TableCell>
                  <TableCell className="max-w-[240px] truncate text-danger-fg" title={s.lastError ?? undefined}>{s.lastError ?? ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        <section aria-labelledby="scraper-runs-heading" className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <h3 id="scraper-runs-heading" className="mr-auto text-heading font-strong text-fg">Recent runs</h3>
            <Checkbox checked={failuresOnly} onCheckedChange={(c) => setFailuresOnly(c === true)} label="Only failures" />
          </div>
          {runs.length === 0 ? (
            <EmptyState size="sm" bordered title={failuresOnly ? 'No failed runs in this window' : 'No runs in this window'} />
          ) : (
            <Table aria-label="Recent runs" density="compact">
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead align="right">Fetched</TableHead>
                  <TableHead align="right">Valid</TableHead>
                  <TableHead align="right">Duplicates</TableHead>
                  <TableHead align="right">Dead links</TableHead>
                  <TableHead align="right">Upserted</TableHead>
                  <TableHead align="right">Duration</TableHead>
                  <TableHead>Error or alert</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell muted className="whitespace-nowrap"><time dateTime={r.startedAt}>{formatDateTime(r.startedAt)}</time></TableCell>
                    <TableCell>{r.source}</TableCell>
                    <TableCell><Badge tone={r.status === 'error' ? 'danger' : 'success'} size="sm">{r.status === 'error' ? 'Failed' : 'OK'}</Badge></TableCell>
                    <TableCell align="right">{r.fetched}</TableCell>
                    <TableCell align="right">{r.valid}</TableCell>
                    <TableCell align="right">{r.duplicates}</TableCell>
                    <TableCell align="right">{r.linkFailed}</TableCell>
                    <TableCell align="right">{r.upserted}</TableCell>
                    <TableCell align="right" muted>{formatDuration(r.durationMs)}</TableCell>
                    <TableCell className="max-w-[260px] truncate" title={r.error ?? r.alert ?? undefined}>
                      {r.error ? <span className="text-danger-fg">{r.error}</span> : r.alert ? <span className="text-warning-fg">{r.alert}</span> : ''}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto text-body text-fg-muted">
          {health.data ? `Since ${formatDateTime(health.data.since)}.` : 'Pipeline runs per source.'}
        </p>
        <Select aria-label="Time window" value={days} onValueChange={setDays} options={WINDOWS} />
        <Button variant="secondary" size="sm" leftIcon={<RefreshCw />} loading={health.loading && !!health.data} onClick={health.refresh}>Refresh</Button>
      </div>
      {body}
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { History, RefreshCw } from 'lucide-react';
import {
  Badge, Button, EmptyState, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@nomadic/ui';
import { getApi } from '../../types';
import type { AdminAuditEntry, AdminAuditPage, AdminAuditTargetType } from '@nomadic/app-core/shared/admin';
import { actionLabel, actionTone, describeChange, formatDateTime, formatRelative } from './adminLogic';
import { AdminErrorState, LoadingRows } from './shared';
import { useAdminQuery, type AdminQuery } from './useAdminQuery';

const PAGE = 50;

type TargetFilter = 'all' | AdminAuditTargetType;

const FILTERS: { value: TargetFilter; label: string }[] = [
  { value: 'all', label: 'All changes' },
  { value: 'user', label: 'Users' },
  { value: 'lesson', label: 'Lessons' },
  { value: 'resource', label: 'Resources' },
  { value: 'admin', label: 'Refused access' },
];

function AuditRows({ entries, compact }: { entries: AdminAuditEntry[]; compact?: boolean }) {
  return (
    <Table aria-label="Audit log" density={compact ? 'compact' : 'default'}>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          {!compact && <TableHead>Admin</TableHead>}
          <TableHead>Action</TableHead>
          {!compact && <TableHead>Target</TableHead>}
          <TableHead>Change</TableHead>
          <TableHead>Reason</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((e) => (
          <TableRow key={e.id}>
            <TableCell muted className="whitespace-nowrap">
              <time dateTime={e.createdAt} title={formatDateTime(e.createdAt)}>{formatRelative(e.createdAt)}</time>
            </TableCell>
            {!compact && <TableCell className="max-w-[180px] truncate">{e.actorEmail ?? 'Unknown'}</TableCell>}
            <TableCell className="whitespace-nowrap"><Badge tone={actionTone(e.action)} size="sm">{actionLabel(e.action)}</Badge></TableCell>
            {!compact && (
              <TableCell className="max-w-[200px] truncate" title={e.targetId ?? undefined}>
                {e.targetLabel ?? e.targetId ?? 'None'}
              </TableCell>
            )}
            <TableCell className="min-w-[180px] text-fg-muted">{describeChange(e)}</TableCell>
            <TableCell className="min-w-[160px] max-w-[280px] break-words">{e.reason ?? <span className="text-fg-subtle">None</span>}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Audit entries for one query (used by the panel and the user drawer). */
export function AuditList({ query, compact, emptyText }: { query: AdminQuery<AdminAuditPage>; compact?: boolean; emptyText: string }) {
  if (query.error) return <AdminErrorState title="Could not load the audit log" error={query.error} code={query.code} onRetry={query.refresh} />;
  if (query.loading && !query.data) return <LoadingRows label="Loading audit log" rows={compact ? 3 : 6} />;
  const entries = query.data?.entries ?? [];
  if (entries.length === 0) return <EmptyState size="sm" bordered icon={<History />} title={emptyText} />;
  return <AuditRows entries={entries} compact={compact} />;
}

export function AuditPanel() {
  const [filter, setFilter] = useState<TargetFilter>('all');
  const [older, setOlder] = useState<AdminAuditEntry[]>([]);
  const [olderHasMore, setOlderHasMore] = useState<boolean | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);

  const targetType = filter === 'all' ? undefined : filter;
  const first = useAdminQuery(() => getApi().adminListAudit({ limit: PAGE, targetType }), filter);

  useEffect(() => { setOlder([]); setOlderHasMore(null); setOlderError(null); }, [filter, first.data]);

  const entries = [...(first.data?.entries ?? []), ...older];
  const hasMore = olderHasMore ?? first.data?.hasMore ?? false;

  const loadOlder = async () => {
    const last = entries[entries.length - 1];
    if (!last) return;
    setLoadingOlder(true);
    setOlderError(null);
    try {
      const res = await getApi().adminListAudit({ limit: PAGE, targetType, beforeId: last.id });
      if (res.ok) {
        setOlder((o) => [...o, ...res.data.entries]);
        setOlderHasMore(res.data.hasMore);
      } else setOlderError(res.error);
    } catch {
      setOlderError('Could not load older entries.');
    } finally {
      setLoadingOlder(false);
    }
  };

  let body: React.ReactNode;
  if (first.error) body = <AdminErrorState title="Could not load the audit log" error={first.error} code={first.code} onRetry={first.refresh} />;
  else if (first.loading && !first.data) body = <LoadingRows label="Loading audit log" />;
  else if (entries.length === 0) {
    body = (
      <EmptyState
        bordered
        icon={<History />}
        title={filter === 'all' ? 'No admin changes yet' : 'No changes of this kind'}
        description="Every plan, status and content change made in these tools is recorded here. Entries cannot be edited or deleted."
      />
    );
  } else {
    body = (
      <div className="flex flex-col gap-3">
        <AuditRows entries={entries} />
        {olderError && <p role="alert" className="text-label text-danger-fg">{olderError}</p>}
        {hasMore && (
          <div><Button variant="secondary" onClick={() => void loadOlder()} loading={loadingOlder}>Load older entries</Button></div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto text-body text-fg-muted">Append-only record of every admin change, newest first.</p>
        <Select aria-label="Filter audit log" value={filter} onValueChange={(v) => setFilter(v as TargetFilter)} options={FILTERS} />
        <Button variant="secondary" size="sm" leftIcon={<RefreshCw />} loading={first.loading && !!first.data} onClick={first.refresh}>Refresh</Button>
      </div>
      {body}
    </div>
  );
}

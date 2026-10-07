import React, { useMemo, useState } from 'react';
import { BookOpen, RefreshCw, Search, X } from 'lucide-react';
import {
  Badge, Button, EmptyState, IconButton, Input, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Tabs, TabsList, TabsTrigger, useToast,
} from '@nomadic/ui';
import { getApi } from '../../types';
import {
  CONTENT_STATUSES, RESOURCE_STATUSES, type AdminContentKind, type AdminContentList, type AdminLessonItem,
  type AdminResourceItem, type ResourceStatus,
} from '@nomadic/app-core/shared/admin';
import {
  CONTENT_STATUS_LABELS, RESOURCE_STATUS_LABELS, contentStatusTone, formatDateTime, formatRelative, linkCheckPassed,
  resourceStatusOptions,
} from './adminLogic';
import { LessonEditorDrawer } from './LessonEditorDrawer';
import { AdminErrorState, ConfirmChangeDialog, LoadingRows } from './shared';
import { useAdminQuery } from './useAdminQuery';

const KINDS: { value: AdminContentKind; label: string }[] = [
  { value: 'skills', label: 'Skills' },
  { value: 'lessons', label: 'Lessons' },
  { value: 'resources', label: 'Resources' },
  { value: 'practice', label: 'Practice' },
];

function statusFilterOptions(kind: AdminContentKind) {
  if (kind === 'resources') return [{ value: 'all', label: 'All statuses' }, ...RESOURCE_STATUSES.map((s) => ({ value: s, label: RESOURCE_STATUS_LABELS[s] }))];
  return [{ value: 'all', label: 'All statuses' }, ...CONTENT_STATUSES.map((s) => ({ value: s, label: CONTENT_STATUS_LABELS[s] }))];
}

const statusText = (s: string) =>
  (CONTENT_STATUS_LABELS as Record<string, string>)[s] ?? (RESOURCE_STATUS_LABELS as Record<string, string>)[s] ?? s;

const StatusBadge = ({ status }: { status: string }) => <Badge tone={contentStatusTone(status)} size="sm">{statusText(status)}</Badge>;

/** Learning content (migration 007): list everything with its status; edit lesson text and resource status. */
export function ContentPanel() {
  const { toast } = useToast();
  const [kind, setKind] = useState<AdminContentKind>('lessons');
  const [status, setStatus] = useState('all');
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [editLessonId, setEditLessonId] = useState<string | null>(null);
  const [resourceId, setResourceId] = useState<string | null>(null);
  const [nextStatus, setNextStatus] = useState<ResourceStatus | null>(null);

  const q = useMemo(() => ({ kind, status: kind === 'skills' || status === 'all' ? undefined : status, query: search || undefined }), [kind, status, search]);
  const list = useAdminQuery(() => getApi().adminListContent(q), JSON.stringify(q));
  const data: AdminContentList | null = list.data && list.data.kind === kind ? list.data : null;

  const lesson = editLessonId && data?.kind === 'lessons' ? data.items.find((l) => l.id === editLessonId) ?? null : null;
  const resource = resourceId && data?.kind === 'resources' ? data.items.find((r) => r.id === resourceId) ?? null : null;

  const changeKind = (k: string) => { setKind(k as AdminContentKind); setStatus('all'); };
  const submitSearch = (e: React.FormEvent) => { e.preventDefault(); setSearch(draft.trim()); };

  const openResource = (r: AdminResourceItem) => { setResourceId(r.id); setNextStatus(null); };
  const saveResource = async (reason: string) => {
    if (!resource || !nextStatus) return 'Pick a new status.';
    const res = await getApi().adminSetResourceStatus({ id: resource.id, expectedVersion: resource.version, status: nextStatus, reason });
    if (!res.ok) return res.error;
    toast({ title: 'Resource updated', description: `${resource.title} is now ${RESOURCE_STATUS_LABELS[nextStatus].toLowerCase()} (version ${res.data.version}).`, tone: 'success' });
    list.refresh();
    return null;
  };

  let body: React.ReactNode;
  if (list.error) body = <AdminErrorState title="Could not load content" error={list.error} code={list.code} onRetry={list.refresh} />;
  else if (!data) body = <LoadingRows label="Loading content" />;
  else if (data.items.length === 0) {
    body = search || status !== 'all'
      ? <EmptyState bordered icon={<Search />} title="Nothing matches" description="Try another search or status."
          actions={<Button variant="secondary" onClick={() => { setDraft(''); setSearch(''); setStatus('all'); }}>Clear filters</Button>} />
      : <EmptyState bordered icon={<BookOpen />} title={`No ${kind} yet`} description="Content is loaded from the curated seed in packages/learning (npm run seed)." />;
  } else if (data.kind === 'skills') {
    body = (
      <Table aria-label="Skills" stickyHeader>
        <TableHeader><TableRow>
          <TableHead>Skill</TableHead><TableHead>Category</TableHead><TableHead align="right">Level</TableHead>
          <TableHead align="right">Lessons</TableHead><TableHead align="right">Resources</TableHead><TableHead align="right">Practice</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {data.items.map((s) => (
            <TableRow key={s.id}>
              <TableCell><div className="font-strong text-fg">{s.name}</div><div className="text-caption text-fg-subtle">{s.id}</div></TableCell>
              <TableCell muted>{s.category}</TableCell>
              <TableCell align="right">{s.level}</TableCell>
              <TableCell align="right">{s.lessonCount}</TableCell>
              <TableCell align="right">{s.resourceCount}</TableCell>
              <TableCell align="right">{s.practiceCount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  } else if (data.kind === 'lessons') {
    body = (
      <Table aria-label="Lessons" stickyHeader>
        <TableHeader><TableRow>
          <TableHead>Lesson</TableHead><TableHead>Skill</TableHead><TableHead>Status</TableHead>
          <TableHead align="right">Version</TableHead><TableHead>Updated</TableHead>
          <TableHead align="right"><span className="sr-only">Actions</span></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {data.items.map((l: AdminLessonItem) => (
            <TableRow key={l.id}>
              <TableCell className="max-w-[320px]">
                <div className="flex items-center gap-2"><span className="truncate font-strong text-fg">{l.title}</span>{l.aiDrafted && <Badge tone="warning" size="sm">AI drafted</Badge>}</div>
                <div className="truncate text-caption text-fg-subtle">{l.id}</div>
              </TableCell>
              <TableCell muted>{l.skillId}</TableCell>
              <TableCell><StatusBadge status={l.status} /></TableCell>
              <TableCell align="right">{l.version}</TableCell>
              <TableCell muted className="whitespace-nowrap">{formatRelative(l.updatedAt)}</TableCell>
              <TableCell align="right"><Button size="sm" variant="ghost" onClick={() => setEditLessonId(l.id)} aria-label={`Edit ${l.title}`}>Edit</Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  } else if (data.kind === 'resources') {
    body = (
      <Table aria-label="Resources" stickyHeader>
        <TableHeader><TableRow>
          <TableHead>Resource</TableHead><TableHead>Status</TableHead><TableHead>Link check</TableHead>
          <TableHead align="right">Version</TableHead><TableHead>Source</TableHead>
          <TableHead align="right"><span className="sr-only">Actions</span></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {data.items.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="max-w-[340px]">
                <div className="truncate font-strong text-fg">{r.title}</div>
                <div className="truncate text-caption text-fg-subtle" title={r.url}>{r.provider} · {r.url}</div>
              </TableCell>
              <TableCell><StatusBadge status={r.status} /></TableCell>
              <TableCell className="whitespace-nowrap">
                {r.lastChecked
                  ? <span className={linkCheckPassed(r) ? 'text-success-fg' : 'text-danger-fg'} title={formatDateTime(r.lastChecked)}>HTTP {r.httpStatus ?? '?'} · {formatRelative(r.lastChecked)}</span>
                  : <span className="text-fg-subtle">Never checked</span>}
              </TableCell>
              <TableCell align="right">{r.version}</TableCell>
              <TableCell muted className="max-w-[160px] truncate" title={r.source}>{r.source}</TableCell>
              <TableCell align="right"><Button size="sm" variant="ghost" onClick={() => openResource(r)} aria-label={`Change status of ${r.title}`}>Change status</Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  } else {
    body = (
      <Table aria-label="Practice items" stickyHeader>
        <TableHeader><TableRow>
          <TableHead>Item</TableHead><TableHead>Skill</TableHead><TableHead>Kind</TableHead><TableHead>Difficulty</TableHead>
          <TableHead>Status</TableHead><TableHead align="right">Version</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {data.items.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="max-w-[360px]">
                <div className="truncate text-fg">{p.prompt || p.id}</div>
                <div className="truncate text-caption text-fg-subtle">{p.id}{p.aiDrafted ? ' · AI drafted' : ''}</div>
              </TableCell>
              <TableCell muted>{p.skillId}</TableCell>
              <TableCell muted>{p.kind}</TableCell>
              <TableCell muted>{p.difficulty}</TableCell>
              <TableCell><StatusBadge status={p.status} /></TableCell>
              <TableCell align="right">{p.version}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={kind} onValueChange={changeKind} variant="segmented">
        <TabsList aria-label="Content type">
          {KINDS.map((k) => <TabsTrigger key={k.value} value={k.value}>{k.label}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      <div className="flex flex-wrap items-center gap-3">
        <form role="search" onSubmit={submitSearch} className="flex min-w-[240px] flex-1 items-center gap-2">
          <Input
            wrapperClassName="flex-1"
            leftIcon={<Search />}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Search ${kind}`}
            aria-label={`Search ${kind}`}
            maxLength={200}
            rightSlot={draft ? <IconButton label="Clear search" icon={<X />} size="sm" variant="ghost" tooltip={false} onClick={() => { setDraft(''); setSearch(''); }} /> : undefined}
          />
          <Button type="submit" variant="secondary">Search</Button>
        </form>
        {kind !== 'skills' && <Select aria-label="Status" value={status} onValueChange={setStatus} options={statusFilterOptions(kind)} />}
        <Button variant="secondary" size="sm" leftIcon={<RefreshCw />} loading={list.loading && !!data} onClick={list.refresh}>Refresh</Button>
      </div>
      {kind === 'resources' && (
        <p className="text-caption text-fg-subtle">Resources come only from curated, link-checked URLs in the seed. They cannot be added or generated here; you can change their status.</p>
      )}
      {body}

      <LessonEditorDrawer lesson={lesson} onClose={() => setEditLessonId(null)} onSaved={list.refresh} />
      <ConfirmChangeDialog
        open={resource !== null}
        onOpenChange={(o) => { if (!o) setResourceId(null); }}
        title="Change resource status"
        confirmLabel="Change status"
        canConfirm={!!nextStatus && !!resource && nextStatus !== resource.status}
        summary={resource && (
          <ul className="flex flex-col gap-1">
            <li><span className="text-fg-subtle">Resource:</span> {resource.title}</li>
            <li className="break-all"><span className="text-fg-subtle">URL:</span> {resource.url}</li>
            <li><span className="text-fg-subtle">Current status:</span> {RESOURCE_STATUS_LABELS[resource.status] ?? resource.status} (version {resource.version})</li>
            <li><span className="text-fg-subtle">Last link check:</span> {resource.lastChecked ? `HTTP ${resource.httpStatus ?? '?'} on ${formatDateTime(resource.lastChecked)}` : 'never'}</li>
          </ul>
        )}
        onConfirm={saveResource}
      >
        {resource && (
          <Select
            aria-label="New status"
            placeholder="Choose a new status"
            value={nextStatus ?? undefined}
            onValueChange={(v) => setNextStatus(v as ResourceStatus)}
            options={resourceStatusOptions(resource).filter((o) => o.value !== resource.status)}
          />
        )}
      </ConfirmChangeDialog>
    </div>
  );
}

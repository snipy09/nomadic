import React, { useCallback, useMemo, useState } from 'react';
import { BellRing, Briefcase, LayoutGrid, List, Plus, RefreshCw, Search, X } from 'lucide-react';
import {
  Button, Card, EmptyState, FilterBar, IconButton, Input, PageHeader, Select, Skeleton, Tabs, TabsList, TabsTrigger, useToast,
} from '@nomadic/ui';
import type { Application } from '../../types';
import { prefs } from '../../store/preferences';
import {
  DEFAULT_FILTERS, STAGES, dueFollowUps, filterApplications, followUpLabel, groupByStage, isFiltered, modeLabel, modesPresent, sortApplications,
  stageCounts, statusLabel, type ApplicationFilters, type SortKey, type StageFilter,
} from './applicationsLogic';
import { useApplications } from './useApplications';
import { ApplicationsBoard } from './ApplicationsBoard';
import { ApplicationsList } from './ApplicationsList';
import { ApplicationDrawer } from './ApplicationDrawer';
import { AddApplicationDialog } from './AddApplicationDialog';
import { IS_MOBILE } from '../../platform';
import { ApplicationCard } from './ApplicationCard';

interface ApplicationsViewProps {
  /** Next action from the empty state. */
  onBrowseJobs?: () => void;
}

type ViewMode = 'board' | 'list';

export const ApplicationsView: React.FC<ApplicationsViewProps> = ({ onBrowseJobs }) => {
  const { toast } = useToast();
  const data = useApplications();
  // The phone defaults to the list: board columns are wider than a phone screen.
  const [view, setView] = useState<ViewMode>(() => (IS_MOBILE && !prefs.hasApplicationsView() ? 'list' : prefs.getApplicationsView()));
  const [filters, setFilters] = useState<ApplicationFilters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortKey>('recent');
  const [openId, setOpenId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const visible = useMemo(() => sortApplications(filterApplications(data.apps, filters), sort), [data.apps, filters, sort]);
  const groups = useMemo(() => groupByStage(visible), [visible]);
  const counts = useMemo(() => stageCounts(data.apps), [data.apps]);
  const modes = useMemo(() => modesPresent(data.apps), [data.apps]);
  const due = useMemo(() => dueFollowUps(data.apps), [data.apps]);
  const opened = openId === null ? null : data.apps.find((a) => a.id === openId) ?? null;

  const changeView = (v: ViewMode) => { setView(v); prefs.setApplicationsView(v); };
  const setFilter = <K extends keyof ApplicationFilters>(k: K, v: ApplicationFilters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  const move = useCallback(async (app: Application, status: string) => {
    const ok = await data.move(app, status);
    if (ok) toast({ title: `Moved to ${statusLabel(status)}`, description: `${app.title} at ${app.company}`, tone: 'success' });
    else toast({ title: 'Status not changed', description: 'The change could not be saved. Try again.', tone: 'danger' });
  }, [data, toast]);

  const saveNotes = useCallback(async (app: Application, notes: string) => {
    const ok = await data.saveNotes(app, notes);
    if (ok) toast({ title: 'Notes saved', tone: 'success' });
    return ok;
  }, [data, toast]);

  const setFollowUp = useCallback(async (app: Application, followUpAt: string | null) => {
    const ok = await data.setFollowUp(app, followUpAt);
    if (!ok) toast({ title: 'Follow-up not saved', description: 'Try again.', tone: 'danger' });
    return ok;
  }, [data, toast]);

  const remove = useCallback(async (app: Application) => {
    setOpenId(null);
    const ok = await data.remove(app);
    if (ok) toast({ title: 'Application deleted', description: `${app.title} at ${app.company}` });
    else toast({ title: 'Could not delete the application', description: 'It is back in your tracker. Try again.', tone: 'danger' });
  }, [data, toast]);

  const add = useCallback(async (draft: Parameters<typeof data.add>[0]) => {
    const res = await data.add(draft);
    if (res.ok) toast({ title: 'Application added', description: `${draft.title.trim()} at ${draft.company.trim()}`, tone: 'success' });
    return res;
  }, [data, toast]);

  const summary = data.loading && data.apps.length === 0
    ? 'Loading…'
    : `${counts.total} tracked · ${counts.interviewing} interviewing · ${counts.offer} ${counts.offer === 1 ? 'offer' : 'offers'}${counts.attention ? ` · ${counts.attention} need action` : ''}`;

  const shownStages = filters.stage === 'all' ? STAGES.map((s) => s.id) : [filters.stage];

  let body: React.ReactNode;
  if (data.error) {
    body = <EmptyState tone="danger" bordered title="Could not load applications" description={data.error} actions={<Button onClick={data.refresh}>Try again</Button>} />;
  } else if (data.loading && data.apps.length === 0) {
    body = view === 'board' ? (
      <div className="flex gap-3 overflow-hidden" aria-busy="true" aria-label="Loading applications">
        {STAGES.map((s) => (
          <div key={s.id} className="flex w-64 min-w-64 flex-col gap-2 rounded-lg border border-line bg-surface-sunken p-2">
            <Skeleton height={16} width="50%" />
            <Skeleton height={120} radius="lg" />
            <Skeleton height={120} radius="lg" />
          </div>
        ))}
      </div>
    ) : (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading applications">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height={40} radius="md" />)}
      </div>
    );
  } else if (data.apps.length === 0) {
    body = (
      <EmptyState
        bordered
        icon={<Briefcase />}
        title="No applications yet"
        description="Apply from the Job board and every application is tracked here. You can also log one you made elsewhere."
        actions={
          <>
            {onBrowseJobs && <Button onClick={onBrowseJobs}>Go to Job board</Button>}
            <Button variant="secondary" leftIcon={<Plus />} onClick={() => setAdding(true)}>Add application</Button>
          </>
        }
      />
    );
  } else if (visible.length === 0) {
    body = (
      <EmptyState
        bordered
        icon={<Search />}
        title="No applications match these filters"
        description="Try a different search, stage or source."
        actions={<Button variant="secondary" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear filters</Button>}
      />
    );
  } else if (view === 'board') {
    body = <ApplicationsBoard groups={groups} stages={shownStages} onOpen={(a) => setOpenId(a.id ?? null)} onMove={(a, s) => void move(a, s)} />;
  } else if (IS_MOBILE) {
    // Phone: one card per application instead of the wide table.
    body = (
      <ul className="flex flex-col gap-2" aria-label="Applications">
        {visible.map((a) => (
          <li key={a.id ?? a.apply_url}>
            <ApplicationCard app={a} onOpen={() => setOpenId(a.id ?? null)} onMove={(s) => void move(a, s)} />
          </li>
        ))}
      </ul>
    );
  } else {
    body = <ApplicationsList apps={visible} onOpen={(a) => setOpenId(a.id ?? null)} onMove={(a, s) => void move(a, s)} />;
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 pb-24">
      <PageHeader
        title="Applications"
        description={<span aria-live="polite">{summary}</span>}
        actions={
          <>
            <IconButton label="Refresh applications" icon={<RefreshCw />} variant="secondary" loading={data.loading && data.apps.length > 0} onClick={data.refresh} />
            <Button leftIcon={<Plus />} onClick={() => setAdding(true)}>Add application</Button>
          </>
        }
      />

      {due.length > 0 && !data.error && (
        <Card padding="sm" variant="sunken" role="region" aria-label="Follow-ups due" className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-body font-strong text-fg">
            <BellRing className="size-4" aria-hidden="true" />
            {due.length === 1 ? '1 follow-up due' : `${due.length} follow-ups due`}
          </p>
          <ul className="flex flex-col gap-1">
            {due.slice(0, 5).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 text-body">
                <span className="text-fg">{a.title} at {a.company}</span>
                <span className="text-caption text-fg-subtle">{followUpLabel(a)}</span>
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setOpenId(a.id ?? null)}>Open</Button>
                <Button size="sm" variant="ghost" onClick={() => void setFollowUp(a, null)} aria-label={`Mark follow-up done for ${a.title} at ${a.company}`}>Done</Button>
              </li>
            ))}
          </ul>
          {due.length > 5 && <p className="text-caption text-fg-subtle">and {due.length - 5} more</p>}
        </Card>
      )}

      {data.apps.length > 0 && !data.error && (
        <FilterBar aria-label="Filter applications">
          <Input
            wrapperClassName="min-w-[220px] flex-1"
            leftIcon={<Search />}
            value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
            placeholder="Search company, role or notes"
            aria-label="Search applications"
            rightSlot={filters.search ? <IconButton label="Clear search" icon={<X />} size="sm" variant="ghost" tooltip={false} onClick={() => setFilter('search', '')} /> : undefined}
          />
          <Select
            aria-label="Stage"
            value={filters.stage}
            onValueChange={(v) => setFilter('stage', v as StageFilter)}
            options={[{ value: 'all', label: 'All stages' }, ...STAGES.map((s) => ({ value: s.id, label: `${s.label} (${counts[s.id]})` }))]}
          />
          {modes.length > 1 && (
            <Select
              aria-label="How applied"
              value={filters.mode}
              onValueChange={(v) => setFilter('mode', v)}
              options={[{ value: 'all', label: 'Any source' }, ...modes.map((m) => ({ value: m, label: modeLabel(m) }))]}
            />
          )}
          <Select
            aria-label="Sort by"
            value={sort}
            onValueChange={(v) => setSort(v as SortKey)}
            options={[{ value: 'recent', label: 'Newest applied' }, { value: 'activity', label: 'Recently updated' }, { value: 'company', label: 'Company A–Z' }]}
          />
          <Tabs variant="segmented" value={view} onValueChange={(v) => changeView(v as ViewMode)}>
            <TabsList aria-label="Layout">
              <TabsTrigger value="board" icon={<LayoutGrid />}>Board</TabsTrigger>
              <TabsTrigger value="list" icon={<List />}>List</TabsTrigger>
            </TabsList>
          </Tabs>
          {isFiltered(filters) && <Button size="sm" variant="ghost" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear filters</Button>}
        </FilterBar>
      )}

      {body}

      <ApplicationDrawer
        app={opened}
        onClose={() => setOpenId(null)}
        onMove={(a, s) => void move(a, s)}
        onSaveNotes={saveNotes}
        onSetFollowUp={setFollowUp}
        onDelete={(a) => void remove(a)}
        onCopied={() => toast({ title: 'Link copied', tone: 'success' })}
      />
      <AddApplicationDialog open={adding} onOpenChange={setAdding} onSubmit={add} />
    </div>
  );
};

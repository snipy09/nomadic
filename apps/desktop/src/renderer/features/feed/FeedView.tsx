import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Briefcase, ChevronLeft, ChevronRight, RefreshCw, Search, X } from 'lucide-react';
import {
  Badge, Button, Card, EmptyState, IconButton, Input, Select, Skeleton, Tabs, TabsList, TabsTrigger, useToast,
} from '@nomadic/ui';
import type { AppUser, Job, MasterProfile } from '../../types';
import { isTabEnabled } from '../../features';
import { prefs } from '../../store/preferences';
import { useApplyRunner } from '../apply/useApplyRunner';
import { feedLimit } from '../billing/billingLogic';
import { useEntitlements } from '../billing/useEntitlements';
import { filterAndSort, pageRange, withoutHidden, type FeedTab, type LocationFilter, type ScoredJob, type SortKey } from './feedLogic';
import { combinedMastery, inferRole, matchJob, profileMastery } from './match';
import { useLearnedMastery } from './useLearnedMastery';
import { useFeed } from './useFeed';
import { JobCard } from './JobCard';
import { JobDrawer } from './JobDrawer';

interface FeedViewProps {
  profile: MasterProfile;
  onUpdateProfile?: (p: MasterProfile) => void;
  onLog: (msg: string) => void;
  onNavigateToOutreach?: (company: string, jobTitle: string) => void;
  currentUser?: AppUser | null;
  onOpenUpgrade?: (feature?: string) => void;
}

const TABS: Array<{ id: FeedTab; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'internships', label: 'Internships' },
  { id: 'internshala', label: 'Internshala' },
  { id: 'remote', label: 'Remote' },
  { id: 'high_match', label: 'High match' },
  { id: 'saved', label: 'Saved' },
  { id: 'hidden', label: 'Hidden' },
];

const initialTab = (): FeedTab => {
  const t = prefs.getOppType();
  return t === 'job' ? 'jobs' : t === 'internship' ? 'internships' : 'all';
};

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export const FeedView: React.FC<FeedViewProps> = ({ profile, onUpdateProfile, onLog, onNavigateToOutreach, currentUser, onOpenUpgrade }) => {
  const { toast } = useToast();
  const [tab, setTab] = useState<FeedTab>(initialTab);
  const [searchText, setSearchText] = useState('');
  const search = useDebounced(searchText);
  const [sort, setSort] = useState<SortKey>('latest');
  const [location, setLocation] = useState<LocationFilter>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(18);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewing, setViewing] = useState<ScoredJob | null>(null);

  useEffect(() => { setPage(1); }, [tab, search, pageSize, location]);

  const feed = useFeed({ page, pageSize, search, tab, source: 'all' });
  const apply = useApplyRunner({ profile, currentUser, onLog, onOpenUpgrade, onUpdateProfile, onSubmitted: () => setSelected(new Set()) });

  const learned = useLearnedMastery();
  const declared = useMemo(() => profileMastery(profile), [profile.techStack]); // eslint-disable-line react-hooks/exhaustive-deps
  const mastery = useMemo(() => combinedMastery(declared, learned), [declared, learned]);
  const role = useMemo(() => inferRole(profile.desiredTitle), [profile.desiredTitle]);
  const hiddenUrls = useMemo(() => feed.hidden.map((h) => h.applyUrl), [feed.hidden]);
  const hiddenPool = useMemo<Job[]>(() => feed.hidden.map((h) => ({ title: h.title, company: h.company, applyUrl: h.applyUrl, createdAt: h.hiddenAt })), [feed.hidden]);
  const pool: Job[] = useMemo(
    () => (tab === 'hidden' ? hiddenPool : withoutHidden(tab === 'saved' ? feed.saved : feed.jobs, hiddenUrls)),
    [tab, hiddenPool, feed.saved, feed.jobs, hiddenUrls],
  );
  const localTab = tab === 'saved' || tab === 'hidden';
  const scored = useMemo<ScoredJob[]>(() => pool.map((j) => ({ ...j, match: matchJob(j, mastery, role) })), [pool, mastery, role]);
  const visible = useMemo(() => filterAndSort(scored, { search, tab, location, sort }), [scored, search, tab, location, sort]);

  // Listing limit comes from the server; unknown (offline) falls back to Free. Saved jobs are never limited.
  const ent = useEntitlements();
  const limit = feedLimit(ent.status, ent.entitlements);
  const limited = limit !== null && !localTab;
  const shown = limited ? visible.slice(0, limit) : localTab ? visible.slice((page - 1) * pageSize, page * pageSize) : visible;
  const totalPages = limited ? 1 : Math.max(1, Math.ceil((localTab ? visible.length : feed.total) / pageSize));
  const hasProfileSkills = Object.keys(mastery).length > 0;

  const toggleSave = useCallback(async (job: Job) => {
    const was = feed.isSaved(job);
    const ok = await feed.toggleSave(job);
    if (!ok) toast({ title: 'Could not update saved jobs', tone: 'danger' });
    else onLog(`[Saved] ${was ? 'Removed' : 'Saved'} ${job.title} at ${job.company}`);
  }, [feed, onLog, toast]);

  const toggleHidden = useCallback(async (job: Job) => {
    if (tab === 'hidden') {
      if (!(await feed.unhide(job.applyUrl))) toast({ title: 'Could not show this job again', tone: 'danger' });
      return;
    }
    setSelected((s) => { if (!s.has(job.applyUrl)) return s; const n = new Set(s); n.delete(job.applyUrl); return n; });
    if (!(await feed.hide(job))) {
      toast({ title: 'Could not hide this job', tone: 'danger' });
      return;
    }
    onLog(`[Feed] Hid ${job.title} at ${job.company}`);
    toast({ title: 'Job hidden', description: 'Find it under the Hidden tab.', action: { label: 'Undo', onClick: () => void feed.unhide(job.applyUrl) } });
  }, [tab, feed, onLog, toast]);

  const toggleSelect = (url: string) => setSelected((s) => { const n = new Set(s); if (n.has(url)) n.delete(url); else n.add(url); return n; });
  const applyTo = (jobs: Job[]) => apply.start(jobs.map((j) => ({ url: j.applyUrl, company: j.company, title: j.title })));
  const selectedJobs = shown.filter((j) => selected.has(j.applyUrl));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 pb-24">
      <header className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-title font-strong text-fg">Job board</h1>
          <p className="text-caption text-fg-subtle">
            {feed.loading ? 'Loading…' : `${localTab ? visible.length : feed.total} openings`}{role ? ` · matched for ${role.replace('-', ' ')}` : ''}
          </p>
        </div>
        <Button variant="secondary" size="sm" leftIcon={<RefreshCw />} loading={feed.loading} onClick={feed.refresh}>Refresh</Button>
      </header>

      {!hasProfileSkills && (
        <Card variant="sunken" padding="sm" className="text-caption text-fg-muted">
          Add skills to your profile in Settings, or finish lessons in Learn, to see how well each job matches you.
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Input
          wrapperClassName="min-w-[240px] flex-1"
          leftIcon={<Search />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search title, company, location or skill"
          aria-label="Search jobs"
          rightSlot={searchText ? <IconButton label="Clear search" icon={<X />} size="sm" variant="ghost" tooltip={false} onClick={() => setSearchText('')} /> : undefined}
        />
        <Select
          aria-label="Location"
          value={location}
          onValueChange={(v) => setLocation(v as LocationFilter)}
          options={[{ value: 'all', label: 'Any location' }, { value: 'india', label: 'India' }, { value: 'remote', label: 'Remote' }]}
        />
        <Select
          aria-label="Sort by"
          value={sort}
          onValueChange={(v) => setSort(v as SortKey)}
          options={[{ value: 'latest', label: 'Newest first' }, { value: 'best_match', label: 'Best match' }, { value: 'company', label: 'Company A–Z' }]}
        />
      </div>

      <Tabs variant="segmented" value={tab} onValueChange={(v) => setTab(v as FeedTab)}>
        <TabsList aria-label="Job filters" className="flex-wrap">
          {TABS.map((t) => <TabsTrigger key={t.id} value={t.id} count={t.id === 'saved' ? feed.saved.length : t.id === 'hidden' ? feed.hidden.length : undefined}>{t.label}</TabsTrigger>)}
        </TabsList>
      </Tabs>

      {feed.error ? (
        <EmptyState tone="danger" bordered title="Could not load jobs" description={feed.error} actions={<Button onClick={feed.refresh}>Try again</Button>} />
      ) : feed.loading && shown.length === 0 ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading jobs">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height={180} radius="lg" />)}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          bordered
          icon={<Briefcase />}
          title={tab === 'saved' ? 'No saved jobs yet' : tab === 'hidden' ? 'No hidden jobs' : 'No jobs match these filters'}
          description={tab === 'saved' ? 'Save jobs from the board to come back to them.' : tab === 'hidden' ? 'Jobs you mark "Not interested" go here, and you can show them again.' : 'Try a different search, location or tab.'}
          actions={!localTab ? <Button variant="secondary" onClick={() => { setSearchText(''); setLocation('all'); setTab('all'); }}>Clear filters</Button> : undefined}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Jobs">
          {shown.map((job) => (
            <li key={job.jobHash || job.applyUrl} className="flex">
              <JobCard
                job={job}
                saved={feed.isSaved(job)}
                selected={selected.has(job.applyUrl)}
                onToggleSelect={() => toggleSelect(job.applyUrl)}
                onToggleSave={() => void toggleSave(job)}
                hidden={tab === 'hidden'}
                onToggleHidden={() => void toggleHidden(job)}
                onOpen={() => setViewing(job)}
                onApply={() => void applyTo([job])}
                applyDisabled={apply.busy}
              />
            </li>
          ))}
        </ul>
      )}

      {limited && limit !== null && visible.length > limit && (
        <Card padding="md" className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-body font-strong text-fg">{visible.length - limit} more openings on this page</div>
            <div className="text-caption text-fg-subtle">
              {ent.status === 'unknown'
                ? `Showing ${limit} jobs because your plan could not be checked. Reconnect to see everything your plan includes.`
                : `Your plan shows ${limit} jobs. Upgrade to see the full board.`}
            </div>
          </div>
          <Button onClick={() => onOpenUpgrade?.('Full job board')}>Upgrade</Button>
        </Card>
      )}

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-1">
          <IconButton label="Previous page" icon={<ChevronLeft />} variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} />
          {pageRange(page, totalPages).map((p, i) => p === '…'
            ? <span key={`gap-${i}`} className="px-1 text-fg-subtle" aria-hidden="true">…</span>
            : <Button key={p} size="sm" variant={p === page ? 'primary' : 'ghost'} aria-current={p === page ? 'page' : undefined} aria-label={`Page ${p}`} onClick={() => setPage(p)}>{p}</Button>)}
          <IconButton label="Next page" icon={<ChevronRight />} variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} />
          <Select
            aria-label="Jobs per page"
            size="sm"
            value={String(pageSize)}
            onValueChange={(v) => setPageSize(Number(v))}
            options={[18, 36, 54].map((n) => ({ value: String(n), label: `${n} per page` }))}
            className="ml-2"
          />
        </nav>
      )}

      {selected.size > 0 && (
        <div role="region" aria-label="Selection" className="fixed bottom-6 left-1/2 z-sticky flex -translate-x-1/2 items-center gap-3 rounded-lg border border-line bg-surface-raised px-4 py-2 shadow-e3">
          <Badge tone="accent">{selected.size} selected</Badge>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          <Button size="sm" disabled={apply.busy || selectedJobs.length === 0} onClick={() => void applyTo(selectedJobs)}>Apply to selected with review</Button>
        </div>
      )}

      <JobDrawer
        job={viewing}
        saved={viewing ? feed.isSaved(viewing) : false}
        onClose={() => setViewing(null)}
        onToggleSave={() => viewing && void toggleSave(viewing)}
        onApply={() => { if (viewing) { const j = viewing; setViewing(null); void applyTo([j]); } }}
        onCopied={() => toast({ title: 'Link copied', tone: 'success' })}
        onFindContacts={isTabEnabled('outreach') && onNavigateToOutreach && viewing ? () => onNavigateToOutreach(viewing.company, viewing.title) : undefined}
      />
      {apply.element}
    </div>
  );
};

import { useEffect, useMemo, useState } from 'react';
import { GraduationCap, RefreshCw } from 'lucide-react';
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton, Tabs, TabsList, TabsTrigger } from '@nomadic/ui';
import { weakTopics } from '@job-automator/learning';
import { getPlan, normalizeTier } from '@nomadic/config';
import type { AppUser } from '../../types';
import type { PracticeEntry } from '@nomadic/app-core/shared/ipc';
import { EntryDetail } from './EntryDetail';
import { EntryList } from './EntryList';
import { MockMode } from './MockMode';
import { PracticeFilters } from './PracticeFilters';
import { EMPTY_FILTERS, filterEntries, isFiltered, latestByEntry, topicOptions, usageLabel, type PracticeFilters as Filters } from './practiceLogic';
import { usePractice } from './usePractice';
import { WeakTopicsCard } from './WeakTopicsCard';

interface PracticeViewProps {
  currentUser?: AppUser | null;
  onOpenUpgrade?: (feature?: string) => void;
  onLog?: (msg: string) => void;
}

const PAGE = 50;
type View = 'browse' | 'mock';

/** Practice and interview prep (F8): one place for coding problems, interview questions and quizzes. */
export function PracticeView({ currentUser, onOpenUpgrade, onLog }: PracticeViewProps) {
  const data = usePractice();
  const [view, setView] = useState<View>('browse');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<PracticeEntry | null>(null);

  const plan = getPlan(normalizeTier(currentUser?.tier || currentUser?.subscription_tier));
  const dailyLimit = plan.limits.practicePerDay;
  // The main process strips company data unless the server-reported plan includes it.
  const companyLocked = !plan.limits.companyQuestionSets || data.catalog?.companyLocked === true;
  const effective = useMemo(() => (companyLocked && filters.company ? { ...filters, company: '' } : filters), [filters, companyLocked]);

  useEffect(() => { setShown(PAGE); }, [filters]);

  const entries = data.catalog?.entries ?? [];
  const filtered = useMemo(() => filterEntries(entries, effective), [entries, effective]);
  const topics = useMemo(() => topicOptions(entries), [entries]);
  const latest = useMemo(() => latestByEntry(data.attempts), [data.attempts]);
  // The side column only appears once there is something to say; an empty card next to the list is noise.
  const hasWeak = useMemo(() => weakTopics(data.attempts).length > 0, [data.attempts]);
  const remainingToday = Number.isFinite(dailyLimit) && data.usedToday !== null ? Math.max(0, dailyLimit - data.usedToday) : null;
  const limitReached = data.limitReached || remainingToday === 0;

  const record: typeof data.record = async (attempt) => {
    const res = await data.record(attempt);
    if (res.success) onLog?.(`[Practice] Saved attempt on ${attempt.entry_id} (${attempt.outcome}).`);
    return res;
  };
  const upgrade = (feature: string) => () => onOpenUpgrade?.(feature);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 pb-24">
      <PageHeader
        title="Practice"
        description={data.loading ? 'Loading…' : `${entries.length.toLocaleString('en-IN')} coding problems, interview questions and quizzes`}
        actions={
          <Badge tone={limitReached ? 'warning' : 'neutral'}>
            {data.signedIn ? usageLabel(dailyLimit, data.usedToday) : 'Sign in to save attempts'}
          </Badge>
        }
      />

      {data.syncError && data.signedIn && (
        <Card variant="sunken" padding="sm" className="flex flex-wrap items-center justify-between gap-2 text-caption text-fg-muted">
          <span>Your practice history could not be refreshed from the server ({data.syncError}). Showing what is saved on this device.</span>
          <Button size="sm" variant="secondary" leftIcon={<RefreshCw />} onClick={data.retry}>Retry</Button>
        </Card>
      )}

      <Tabs variant="segmented" value={view} onValueChange={(v) => setView(v as View)}>
        <TabsList aria-label="Practice mode">
          <TabsTrigger value="browse">Browse</TabsTrigger>
          <TabsTrigger value="mock">Mock interview</TabsTrigger>
        </TabsList>
      </Tabs>

      {data.error ? (
        <EmptyState tone="danger" bordered title="Could not load practice questions" description={data.error} actions={<Button onClick={data.retry}>Try again</Button>} />
      ) : data.loading || !data.catalog ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading practice questions">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height={56} radius="md" />)}
        </div>
      ) : (
        <>
          <PracticeFilters
            value={effective}
            onChange={setFilters}
            catalog={data.catalog}
            topics={topics}
            companyLocked={companyLocked}
            onOpenUpgrade={upgrade('Company question sets')}
          />

          {view === 'mock' ? (
            <MockMode
              pool={filtered}
              limitReached={limitReached}
              remainingToday={remainingToday}
              onRecord={record}
              onOpenUpgrade={upgrade('Unlimited practice')}
              onExit={() => setView('browse')}
            />
          ) : (
            <div className={hasWeak ? 'grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]' : 'flex flex-col'}>
              {hasWeak && (
                <div className="xl:col-start-2 xl:row-start-1">
                  <WeakTopicsCard
                    attempts={data.attempts}
                    signedIn={data.signedIn}
                    onPractice={(topic) => setFilters({ ...EMPTY_FILTERS, topic })}
                  />
                </div>
              )}
              <div className="min-w-0 xl:col-start-1 xl:row-start-1">
                {filtered.length === 0 ? (
                  <EmptyState
                    bordered
                    icon={<GraduationCap />}
                    title={entries.length === 0 ? 'No practice questions yet' : 'Nothing matches these filters'}
                    description={entries.length === 0 ? 'The question sets in this install are empty.' : 'Try another topic, role or difficulty.'}
                    actions={isFiltered(effective) ? <Button variant="secondary" onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</Button> : undefined}
                  />
                ) : (
                  <EntryList
                    entries={filtered}
                    shown={shown}
                    onShowMore={() => setShown((n) => n + PAGE)}
                    onOpen={setOpen}
                    latest={latest}
                    company={effective.company}
                  />
                )}
              </div>
            </div>
          )}
        </>
      )}

      <EntryDetail
        entry={open}
        onClose={() => setOpen(null)}
        limitReached={limitReached}
        onRecord={record}
        onOpenUpgrade={upgrade('Unlimited practice')}
        onSelectTopic={(topic) => setFilters({ ...EMPTY_FILTERS, topic })}
      />
    </div>
  );
}

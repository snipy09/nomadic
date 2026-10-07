import React, { useMemo, useState } from 'react';
import { Briefcase, ExternalLink, Newspaper, RefreshCw, Trophy } from 'lucide-react';
import { Badge, Button, EmptyState, IconButton, PageHeader, Skeleton, Tabs, TabsList, TabsTrigger } from '@nomadic/ui';
import { getApi, type NewsItem, type TabType } from '../../types';
import { postedLabel } from '../feed/feedLogic';
import { CompanyMonogram } from '../feed/JobCard';
import { dateRange, deadline, emptyReason, filterNews, type NewsFilter } from './newsLogic';
import { useNews } from './useNews';

/**
 * Home: the News page. Hiring updates per company (careers-site snapshots and the job board) and upcoming
 * hackathons, each with its source and a link. The old dashboard lives on as "Dashboard" (More on the phone).
 */

interface NewsViewProps {
  onNavigate: (tab: TabType, intent?: string) => void;
}

const FILTERS: Array<{ id: NewsFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'hiring', label: 'Hiring' },
  { id: 'hackathon', label: 'Hackathons' },
];

function open(url: string) {
  const api = getApi();
  if (api.openExternalUrl) void api.openExternalUrl(url);
  else window.open(url, '_blank', 'noopener');
}

function NewsCard({ item, onSeeJobs }: { item: NewsItem; onSeeJobs?: () => void }) {
  const isHack = item.kind === 'hackathon';
  const when = isHack ? dateRange(item.startsAt, item.endsAt) : postedLabel(item.at ?? undefined);
  const due = isHack ? deadline(item) : null;
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-line/70 bg-surface p-4 shadow-e1">
      <div className="flex items-start gap-3">
        {isHack ? (
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-md bg-warning-subtle text-warning-fg [&_svg]:size-5">
            <Trophy />
          </span>
        ) : (
          <CompanyMonogram company={item.company ?? item.title} />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-body-lg font-strong text-fg">{item.title}</h3>
          {item.detail && <p className="mt-0.5 text-caption text-fg-muted">{item.detail}</p>}
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-subtle">
            <span>{item.sourceLabel}</span>
            {when && <span aria-hidden="true">·</span>}
            {when && <span>{when}</span>}
            {due && <Badge tone={due.soon ? 'warning' : 'neutral'} size="sm">{due.label}</Badge>}
            {isHack && item.mode === 'online' && <Badge tone="accent" size="sm">Online</Badge>}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
        {onSeeJobs && <Button size="sm" variant="secondary" leftIcon={<Briefcase />} onClick={onSeeJobs}>See jobs</Button>}
        <Button size="sm" variant={onSeeJobs ? 'ghost' : 'secondary'} rightIcon={<ExternalLink />} onClick={() => open(item.url)}>
          {isHack ? 'Open event' : 'Open source'}
        </Button>
      </div>
    </article>
  );
}

export function NewsView({ onNavigate }: NewsViewProps) {
  const news = useNews();
  const [filter, setFilter] = useState<NewsFilter>('all');
  const items = useMemo(() => filterNews(news.data?.items ?? [], filter), [news.data, filter]);
  const hiring = items.filter((i) => i.kind === 'hiring');
  const hackathons = items.filter((i) => i.kind === 'hackathon');
  const counts = { hiring: (news.data?.items ?? []).filter((i) => i.kind === 'hiring').length, hackathon: (news.data?.items ?? []).filter((i) => i.kind === 'hackathon').length };

  const seeJobs = (item: NewsItem) => (item.company ? () => onNavigate('feed', `search:${item.company}`) : undefined);
  const section = (title: string, list: NewsItem[]) =>
    list.length > 0 && (
      <section aria-label={title} className="flex flex-col gap-3">
        {filter === 'all' && <h2 className="text-heading font-strong text-fg">{title}</h2>}
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((item) => (
            <li key={item.id} className="flex [&>article]:w-full">
              <NewsCard item={item} onSeeJobs={seeJobs(item)} />
            </li>
          ))}
        </ul>
      </section>
    );

  let body: React.ReactNode;
  if (news.error && !news.data) {
    body = <EmptyState tone="danger" bordered title="Could not load the news" description={news.error} actions={<Button onClick={news.refresh}>Try again</Button>} />;
  } else if (news.loading && !news.data) {
    body = (
      <div className="grid gap-3 md:grid-cols-2" aria-busy="true" aria-label="Loading news">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height={132} radius="lg" />)}
      </div>
    );
  } else if (items.length === 0) {
    const reason = emptyReason(news.data);
    body = (
      <EmptyState
        bordered
        icon={<Newspaper />}
        title={reason === 'not_ready' && filter !== 'hiring' ? 'News is getting ready' : filter === 'hackathon' ? 'No upcoming hackathons right now' : 'No hiring news this week'}
        description={
          reason === 'not_ready' && filter !== 'hiring'
            ? 'Hiring updates from company careers sites and upcoming hackathons appear here once they are published. Meanwhile, the job board has every opening.'
            : 'Check back soon, or browse every opening on the job board.'
        }
        actions={<Button variant="secondary" leftIcon={<Briefcase />} onClick={() => onNavigate('feed')}>Browse jobs</Button>}
      />
    );
  } else {
    body = (
      <div className="flex flex-col gap-6">
        {section('Hiring now', hiring)}
        {section('Hackathons', hackathons)}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 pb-24">
      <PageHeader
        title="News"
        description="Who is hiring and which hackathons are coming up, for students in India."
        actions={<IconButton label="Refresh news" icon={<RefreshCw />} variant="secondary" loading={news.loading && Boolean(news.data)} onClick={news.refresh} />}
      />
      <Tabs variant="segmented" value={filter} onValueChange={(v) => setFilter(v as NewsFilter)}>
        <TabsList aria-label="News filters">
          {FILTERS.map((f) => (
            <TabsTrigger key={f.id} value={f.id} count={f.id === 'all' ? undefined : counts[f.id] || undefined}>{f.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {body}
    </div>
  );
}

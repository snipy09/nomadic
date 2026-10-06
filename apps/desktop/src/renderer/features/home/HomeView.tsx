import React, { useMemo, useState } from 'react';
import { ArrowRight, BellRing, Briefcase, Check, Compass, Flame, LayoutGrid, Sparkles } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Skeleton, cn } from '@nomadic/ui';
import { formatDay } from '@job-automator/learning';
import type { AppUser, MasterProfile, TabType, WorkspaceMode } from '../../types';
import { readAppAnswers } from '../../../shared/applicationAnswers';
import { prefs } from '../../store/preferences';
import { answeredCount } from '../answers/answersLogic';
import { dueFollowUps, followUpLabel, stageCounts } from '../applications/applicationsLogic';
import { useApplications } from '../applications/useApplications';
import { HIGH_MATCH, withoutHidden, type ScoredJob } from '../feed/feedLogic';
import { CompanyMonogram } from '../feed/JobCard';
import { combinedMastery, inferRole, matchJob, profileMastery } from '../feed/match';
import { useFeed } from '../feed/useFeed';
import { useLearnedMastery } from '../feed/useLearnedMastery';
import { formatMinutes } from '../learn/learnModel';
import { completeness, toForm } from '../profile/profileForm';
import { useResumes } from '../profile/useResumes';
import { greeting, longDate, setupChecklist, type ChecklistItem } from './homeLogic';
import { useLearnSummary, type LearnSummary } from './useLearnSummary';

interface HomeViewProps {
  profile: MasterProfile;
  currentUser: AppUser | null;
  workspaceMode: WorkspaceMode;
  /** Go to a page, optionally opening a section inside it. */
  onNavigate: (tab: TabType, intent?: string) => void;
}

/** Home: what to do next across Learn and Jobs, in one glance. */
export function HomeView({ profile, currentUser, workspaceMode, onNavigate }: HomeViewProps) {
  const learnOn = workspaceMode !== 'seeker_only';
  const seekOn = workspaceMode !== 'learner_only';
  const learn = useLearnSummary();
  const apps = useApplications();
  const resumes = useResumes();
  const [checklistHidden, setChecklistHidden] = useState(() => prefs.getHomeChecklistHidden());

  const profilePercent = useMemo(
    () => completeness(toForm(profile, currentUser, { workspaceMode: prefs.getWorkspaceMode(), opportunityType: prefs.getOppType() })).percent,
    [profile, currentUser],
  );
  const checklist = setupChecklist({
    mode: workspaceMode,
    profilePercent,
    resumes: resumes.loading ? null : resumes.resumes.length,
    hasRoadmap: learn.hasRoadmap,
    answers: answeredCount(readAppAnswers(profile.customAnswers)),
    applications: apps.apps.length,
  });
  const doneCount = checklist.filter((c) => c.done).length;
  // Wait for the data the checklist reads, so a finished step never flashes as undone.
  const checklistReady = learn.status !== 'loading' && !resumes.loading && !apps.loading;
  const showChecklist = checklistReady && !checklistHidden && doneCount < checklist.length;

  const first = profile.firstName?.trim() || currentUser?.fullName?.split(' ')[0] || '';

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 pb-16">
      <header>
        <h1 className="text-title font-strong text-fg">{greeting()}{first ? `, ${first}` : ''}</h1>
        <p className="mt-0.5 text-body text-fg-muted">
          {longDate()}{learn.hasRoadmap ? ` · ${learn.roleName} roadmap` : ''}
        </p>
      </header>

      {showChecklist && (
        <SetupChecklist
          items={checklist}
          done={doneCount}
          onGo={(item) => onNavigate(item.tab, item.intent)}
          onHide={() => { prefs.setHomeChecklistHidden(true); setChecklistHidden(true); }}
        />
      )}

      <div className={cn('grid gap-4', learnOn && seekOn && 'lg:grid-cols-2')}>
        {learnOn && <TodayCard learn={learn} onNavigate={onNavigate} />}
        {seekOn && <ApplicationsCard data={apps} onNavigate={onNavigate} />}
      </div>

      {seekOn && <TopMatches profile={profile} onNavigate={onNavigate} />}
    </div>
  );
}

function SetupChecklist({ items, done, onGo, onHide }: { items: ChecklistItem[]; done: number; onGo: (i: ChecklistItem) => void; onHide: () => void }) {
  const next = items.find((i) => !i.done);
  return (
    <Card aria-labelledby="setup-title">
      <div className="flex flex-wrap items-center gap-3 px-4 pt-4">
        <div className="mr-auto">
          <h2 id="setup-title" className="text-body-lg font-strong text-fg">Get set up</h2>
          <p className="text-body text-fg-muted">{done} of {items.length} done. Each step makes matches and applications better.</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onHide}>Hide</Button>
      </div>
      <div className="mx-4 mt-3 h-1 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
        <div className="h-full rounded-full bg-accent transition-[width] duration-slow" style={{ width: `${Math.round((done / items.length) * 100)}%` }} />
      </div>
      <ol className="mt-2 flex flex-col px-2 pb-2">
        {items.map((item) => (
          <li key={item.id} className={cn('flex items-center gap-3 rounded-md px-2 py-2.5', item === next && 'bg-surface-hover/60')}>
            <span
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full border [&_svg]:size-3',
                item.done ? 'border-success bg-success text-white' : 'border-line-strong text-transparent',
              )}
              aria-hidden="true"
            >
              <Check strokeWidth={3} />
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn('text-body font-strong', item.done ? 'text-fg-subtle line-through' : 'text-fg')}>
                {item.title}
                <span className="sr-only">{item.done ? ' (done)' : ' (to do)'}</span>
              </p>
              {!item.done && <p className="truncate text-caption text-fg-subtle">{item.description}</p>}
            </div>
            {!item.done && (
              <Button size="sm" variant={item === next ? 'primary' : 'secondary'} onClick={() => onGo(item)}>{item.action}</Button>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function TodayCard({ learn, onNavigate }: { learn: LearnSummary; onNavigate: HomeViewProps['onNavigate'] }) {
  const header = <CardHeader icon={<Compass />} title="Today's learning" description={learn.hasRoadmap ? `${learn.percent}% of your roadmap done` : 'Your daily plan shows up here'} />;
  if (learn.status === 'loading') {
    return <Card>{header}<div className="flex flex-col gap-2 p-4"><Skeleton height={20} width="60%" /><Skeleton height={8} /><Skeleton height={32} width={120} /></div></Card>;
  }
  if (!learn.hasRoadmap) {
    return (
      <Card>
        {header}
        <div className="flex flex-1 flex-col items-start gap-3 p-4">
          <p className="text-body text-fg-muted">Tell Nomadic the role you want and how much time you have; you get a day-by-day plan with lessons, problems and projects.</p>
          <Button variant="primary" onClick={() => onNavigate('learner-roadmaps')}>Plan your roadmap</Button>
        </div>
      </Card>
    );
  }
  const d = learn.today;
  const streak = learn.streak?.current ?? 0;
  return (
    <Card>
      {header}
      <div className="flex flex-1 flex-col gap-3 p-4">
        {d ? (
          <>
            <div>
              <p className="text-caption text-fg-subtle">Week {d.week} · Day {d.day} · {formatMinutes(d.minutes)}</p>
              <p className="mt-0.5 text-heading font-strong text-fg">{d.title}</p>
              {d.subtitle && <p className="truncate text-caption text-fg-muted">Also: {d.subtitle}</p>}
            </div>
            <div className="flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
                <div className="h-full rounded-full bg-success transition-[width] duration-slow" style={{ width: `${d.total ? Math.round((d.done / d.total) * 100) : 0}%` }} />
              </div>
              <span className="text-caption tabular-nums text-fg-muted">{d.done}/{d.total} tasks</span>
            </div>
          </>
        ) : (
          <p className="text-body text-fg-muted">
            Nothing planned today.{learn.next ? ` Next up on ${formatDay(learn.next.date)}: ${learn.next.title}.` : ''}
          </p>
        )}
        <div className="mt-auto flex items-center gap-3 pt-1">
          <Button variant="primary" rightIcon={<ArrowRight />} onClick={() => onNavigate('learner-roadmaps', d ? 'today' : 'path')}>
            {!d ? 'Open your path' : d.state === 'done' ? 'Review today' : d.done ? 'Continue' : 'Start today'}
          </Button>
          <span className={cn('flex items-center gap-1 text-caption [&_svg]:size-3.5', streak > 0 ? 'text-warning-fg' : 'text-fg-subtle')}>
            <Flame aria-hidden="true" />{streak} day streak
          </span>
        </div>
      </div>
    </Card>
  );
}

function ApplicationsCard({ data, onNavigate }: { data: ReturnType<typeof useApplications>; onNavigate: HomeViewProps['onNavigate'] }) {
  const counts = stageCounts(data.apps);
  const due = dueFollowUps(data.apps);
  const header = (
    <CardHeader
      icon={<LayoutGrid />}
      title="Applications"
      description={data.apps.length ? `${data.apps.length} tracked` : 'Everything you apply to is tracked here'}
      actions={data.apps.length ? <Button size="sm" variant="ghost" onClick={() => onNavigate('applications')}>View all</Button> : undefined}
    />
  );
  if (data.loading && data.apps.length === 0) {
    return <Card>{header}<div className="flex flex-col gap-2 p-4"><Skeleton height={48} /><Skeleton height={20} width="70%" /></div></Card>;
  }
  if (data.apps.length === 0) {
    return (
      <Card>
        {header}
        <div className="flex flex-1 flex-col items-start gap-3 p-4">
          <p className="text-body text-fg-muted">Pick jobs on the board; Nomadic fills each form and you review it before it is sent.</p>
          <Button variant="primary" leftIcon={<Briefcase />} onClick={() => onNavigate('feed')}>Browse jobs</Button>
        </div>
      </Card>
    );
  }
  const stats = [
    { label: 'Applied', value: counts.applied },
    { label: 'Interviewing', value: counts.interviewing },
    { label: 'Offers', value: counts.offer },
    ...(counts.attention ? [{ label: 'Need action', value: counts.attention }] : []),
  ];
  return (
    <Card>
      {header}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <dl className="grid grid-cols-3 gap-2">
          {stats.slice(0, 3).map((s) => (
            <div key={s.label} className="flex flex-col-reverse rounded-md bg-surface-sunken px-3 py-2">
              <dt className="text-caption text-fg-subtle">{s.label}</dt>
              <dd className="text-title font-strong tabular-nums text-fg">{s.value}</dd>
            </div>
          ))}
        </dl>
        {due.length > 0 ? (
          <div className="flex flex-col gap-1">
            <p className="flex items-center gap-1.5 text-caption font-strong text-warning-fg [&_svg]:size-3.5"><BellRing aria-hidden="true" />{due.length === 1 ? '1 follow-up due' : `${due.length} follow-ups due`}</p>
            <ul className="flex flex-col">
              {due.slice(0, 3).map((a) => (
                <li key={a.id} className="flex items-center gap-2 py-1 text-body">
                  <span className="min-w-0 flex-1 truncate text-fg">{a.title} <span className="text-fg-subtle">at {a.company}</span></span>
                  <span className="shrink-0 text-caption text-fg-subtle">{followUpLabel(a)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : counts.attention > 0 ? (
          <p className="text-body text-fg-muted">{counts.attention} {counts.attention === 1 ? 'application needs' : 'applications need'} your action.</p>
        ) : (
          <p className="text-body text-fg-muted">No follow-ups due. Set a reminder on any application to see it here.</p>
        )}
      </div>
    </Card>
  );
}

function TopMatches({ profile, onNavigate }: { profile: MasterProfile; onNavigate: HomeViewProps['onNavigate'] }) {
  const feed = useFeed({ page: 1, pageSize: 18, search: '', tab: 'all', source: 'all' });
  const learned = useLearnedMastery();
  const declared = useMemo(() => profileMastery(profile), [profile.techStack]); // eslint-disable-line react-hooks/exhaustive-deps
  const mastery = useMemo(() => combinedMastery(declared, learned), [declared, learned]);
  const role = useMemo(() => inferRole(profile.desiredTitle), [profile.desiredTitle]);
  const hasSkills = Object.keys(mastery).length > 0;
  const top = useMemo<ScoredJob[]>(() => {
    const pool = withoutHidden(feed.jobs, feed.hidden.map((h) => h.applyUrl)).map((j) => ({ ...j, match: matchJob(j, mastery, role) }));
    return hasSkills ? [...pool].sort((a, b) => (b.match?.score ?? -1) - (a.match?.score ?? -1)).slice(0, 5) : pool.slice(0, 5);
  }, [feed.jobs, feed.hidden, mastery, role, hasSkills]);

  return (
    <section aria-labelledby="matches-title" className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="matches-title" className="flex items-center gap-1.5 text-body-lg font-strong text-fg [&_svg]:size-4 [&_svg]:text-accent"><Sparkles aria-hidden="true" />{hasSkills ? 'Best matches for you' : 'Latest openings'}</h2>
          <p className="text-body text-fg-muted">{hasSkills ? 'From the newest openings, by how many of their skills you have.' : 'Add skills to your profile to see how well each one matches you.'}</p>
        </div>
        <Button size="sm" variant="ghost" rightIcon={<ArrowRight />} onClick={() => onNavigate('feed')}>Job board</Button>
      </div>
      <Card>
        {feed.loading && top.length === 0 ? (
          <div className="flex flex-col gap-2 p-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height={44} />)}</div>
        ) : feed.error ? (
          <div className="flex items-center justify-between gap-3 p-4 text-body text-fg-muted">
            <span>Jobs could not be loaded: {feed.error}</span>
            <Button size="sm" variant="secondary" onClick={feed.refresh}>Try again</Button>
          </div>
        ) : top.length === 0 ? (
          <p className="p-4 text-body text-fg-muted">No openings right now. New jobs are added every few days.</p>
        ) : (
          <ul className="divide-y divide-line">
            {top.map((j) => (
              <li key={j.applyUrl}>
                <button
                  type="button"
                  onClick={() => onNavigate('feed')}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors duration-fast hover:bg-surface-hover focus-visible:bg-surface-hover"
                >
                  <CompanyMonogram company={j.company} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-strong text-fg">{j.title}</span>
                    <span className="block truncate text-caption text-fg-subtle">{[j.company, j.location].filter(Boolean).join(' · ')}</span>
                  </span>
                  {j.employmentType === 'internship' && <Badge size="sm" tone="neutral">Internship</Badge>}
                  {j.match && (
                    <Badge size="sm" tone={j.match.score >= HIGH_MATCH ? 'success' : j.match.score >= 40 ? 'accent' : 'neutral'}>
                      {j.match.estimated ? '~' : ''}{j.match.score}% match
                    </Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

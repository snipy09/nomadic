import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Calculator,
  CalendarCheck,
  Check,
  ChevronDown,
  Code2,
  Cpu,
  Flame,
  Hammer,
  Layers,
  MessageSquare,
  Repeat,
  Sparkles,
  Star,
  Timer,
  Trophy,
} from 'lucide-react';
import { Button, ProgressRing, cn } from '@nomadic/ui';
import { formatDay, type Forecast, type Path, type PathDay, type PathWeek, type Stream, type Streak } from '@job-automator/learning';
import { formatMinutes, streamLabel } from './learnModel';

/** Week colours rotate through token-based tones (no hard-coded palette). */
const TONES = [
  { banner: 'bg-accent text-accent-fg', node: 'bg-accent text-accent-fg', ring: 'ring-accent/25', text: 'text-accent', soft: 'bg-accent-subtle text-accent-subtle-fg' },
  { banner: 'bg-success text-canvas', node: 'bg-success text-canvas', ring: 'ring-success/25', text: 'text-success-fg', soft: 'bg-success-subtle text-success-fg' },
  { banner: 'bg-fg text-canvas', node: 'bg-fg text-canvas', ring: 'ring-fg/20', text: 'text-fg', soft: 'bg-surface-active text-fg' },
] as const;
const toneOf = (week: number) => TONES[(week - 1) % TONES.length];

/** Horizontal offsets (px) that make the path wind like a trail. */
const WIND = [0, 46, 70, 46, 0, -46, -70, -46];

const STREAM_ICON: Record<Stream, React.ReactNode> = {
  dsa: <Code2 />,
  core_cs: <Cpu />,
  dev: <Layers />,
  aptitude: <Calculator />,
  interview: <MessageSquare />,
};

function dayIcon(d: PathDay): React.ReactNode {
  if (d.state === 'done') return <Check strokeWidth={3} />;
  if (d.title === 'Online assessment mock') return <Trophy />;
  if (d.title === 'Weekly revision') return <Repeat />;
  if (d.title.startsWith('Build:')) return <Hammer />;
  if (d.title.endsWith(' check')) return <Timer />;
  return d.stream ? STREAM_ICON[d.stream] : <BookOpen />;
}

interface PathScreenProps {
  path: Path;
  today: string;
  streak: Streak;
  forecast: Forecast;
  roleName: string;
  percent: number;
  onOpenDay: (date: string) => void;
  /** Extra controls for the plan card (adjust, new roadmap). */
  planActions: React.ReactNode;
}

/** The roadmap as a winding path: a banner per week, a node per study day, a trophy per finished week. */
export function PathScreen({ path, today, streak, forecast, roleName, percent, onOpenDay, planActions }: PathScreenProps) {
  const [openDate, setOpenDate] = useState<string | null>(null);
  const currentRef = useRef<HTMLDivElement | null>(null);
  const currentWeek = path.current ? path.weeks.find((w) => w.number === path.current!.week) ?? null : null;
  const todayDay = useMemo(() => path.weeks.flatMap((w) => w.days).find((d) => d.date === today) ?? null, [path, today]);

  // Bring the day to work on into view once, like opening the app on your place in the path.
  useEffect(() => {
    currentRef.current?.scrollIntoView?.({ block: 'center' });
  }, []);

  if (!path.weeks.some((w) => w.days.length)) {
    return <p className="text-body text-fg-muted">Nothing is planned yet.</p>;
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="flex flex-col gap-10 pb-10">
        {path.weeks.filter((w) => w.days.length).map((w) => (
          <WeekSection
            key={w.number}
            week={w}
            today={today}
            current={path.current?.date ?? null}
            openDate={openDate}
            onToggle={(date) => setOpenDate((d) => (d === date ? null : date))}
            onOpenDay={onOpenDay}
            currentRef={currentRef}
          />
        ))}
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-accent-subtle text-accent [&_svg]:size-8" aria-hidden="true">
            <Star />
          </span>
          <p className="text-heading font-strong text-fg">Ready for {roleName} interviews</p>
          <p className="text-body text-fg-muted">The end of your roadmap. Keep reviewing and building after it.</p>
        </div>
      </div>

      <aside className="order-first flex flex-col gap-3 xl:order-none xl:sticky xl:top-0 xl:self-start" aria-label="Your progress">
        {todayDay && (
          <div className="hidden flex-col gap-2 rounded-lg border border-line bg-surface p-4 xl:flex">
            <div className="text-caption text-fg-subtle">Today · {todayDay.done} of {todayDay.total} tasks · {formatMinutes(todayDay.minutes)}</div>
            <div className="text-body-lg font-strong text-fg">{todayDay.title}</div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
              <div className="h-full rounded-full bg-success transition-[width] duration-slow" style={{ width: `${Math.round((todayDay.done / todayDay.total) * 100)}%` }} />
            </div>
            <Button size="sm" variant="primary" className="mt-1" onClick={() => onOpenDay(todayDay.date)}>{todayDay.state === 'done' ? 'Review today' : todayDay.done ? 'Continue' : 'Start today'}</Button>
          </div>
        )}

        <dl className="grid grid-cols-3 divide-x divide-line rounded-lg border border-line bg-surface xl:grid-cols-1 xl:divide-x-0 xl:divide-y">
          <div className="flex items-center gap-3 px-4 py-3">
            <ProgressRing value={percent} size={32} thickness={4} label="Roadmap progress" />
            <div className="flex min-w-0 flex-col-reverse">
              <dt className="truncate text-caption text-fg-subtle">{path.done_days} of {path.study_days} study days</dt>
              <dd className="text-body-lg font-strong text-fg">{percent}% done</dd>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <span className={cn('flex size-8 shrink-0 items-center justify-center [&_svg]:size-5', streak.current > 0 ? 'text-warning' : 'text-fg-subtle')} aria-hidden="true">
              <Flame />
            </span>
            <div className="flex min-w-0 flex-col-reverse">
              <dt className="truncate text-caption text-fg-subtle">Best {streak.longest}</dt>
              <dd className="text-body-lg font-strong text-fg">{streak.current} day streak</dd>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <span className={cn('flex size-8 shrink-0 items-center justify-center [&_svg]:size-5', forecast.status === 'behind' ? 'text-warning' : 'text-success')} aria-hidden="true">
              {forecast.status === 'behind' ? <AlertTriangle /> : <CalendarCheck />}
            </span>
            <div className="flex min-w-0 flex-col-reverse">
              <dt className="truncate text-caption text-fg-subtle">
                {forecast.projected_finish ? `Finish around ${formatDay(forecast.projected_finish, false)}` : 'All done'}
              </dt>
              <dd className="text-body-lg font-strong text-fg">{forecast.status === 'behind' ? 'Behind plan' : forecast.status === 'ahead' ? 'Ahead of plan' : 'On track'}</dd>
            </div>
          </div>
        </dl>

        {currentWeek && currentWeek.modules.length > 0 && (
          <div className="hidden flex-col gap-2 rounded-lg border border-line bg-surface p-4 xl:flex">
            <div className="text-caption text-fg-subtle">Week {currentWeek.number} covers</div>
            <ul className="flex flex-col gap-1.5">
              {currentWeek.modules.slice(0, 5).map((m) => (
                <li key={m.id} className="flex items-center gap-2 text-body text-fg">
                  <span className="text-fg-subtle [&_svg]:size-4" aria-hidden="true">{STREAM_ICON[m.stream]}</span>
                  <span className="min-w-0 flex-1 truncate">{m.title}</span>
                  <span className="text-caption text-fg-subtle">{formatMinutes(m.minutes)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2 xl:flex-col xl:items-start">{planActions}</div>
      </aside>
    </div>
  );
}

function WeekSection({
  week,
  today,
  current,
  openDate,
  onToggle,
  onOpenDay,
  currentRef,
}: {
  week: PathWeek;
  today: string;
  current: string | null;
  openDate: string | null;
  onToggle: (date: string) => void;
  onOpenDay: (date: string) => void;
  currentRef: React.MutableRefObject<HTMLDivElement | null>;
}) {
  const tone = toneOf(week.number);
  const [guide, setGuide] = useState(false);
  const daysDone = week.days.filter((d) => d.state === 'done').length;
  const complete = daysDone === week.days.length;
  const isThisWeek = today >= week.start && today <= week.end;
  const guideId = `week-${week.number}-guide`;

  return (
    <section aria-labelledby={`week-${week.number}`} className="flex flex-col items-center gap-6">
      <header className={cn('sticky top-0 z-sticky w-full max-w-xl rounded-2xl px-5 py-4 shadow-e2', tone.banner)}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-caption font-strong uppercase tracking-wider opacity-80">
              Week {week.number}{isThisWeek ? ' · this week' : ''} · {formatDay(week.start, false)} to {formatDay(week.end, false)}
            </div>
            <h3 id={`week-${week.number}`} className="mt-0.5 text-title font-strong">{week.title}</h3>
            <div className="mt-1 text-body opacity-90">
              {week.days.length} study {week.days.length === 1 ? 'day' : 'days'} · {formatMinutes(week.minutes)} · {daysDone}/{week.days.length} done
            </div>
          </div>
          <button
            type="button"
            aria-expanded={guide}
            aria-controls={guideId}
            onClick={() => setGuide((g) => !g)}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border-2 border-current/30 px-2.5 py-1.5 text-label font-strong uppercase tracking-wide opacity-90 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
          >
            Week guide <ChevronDown className={cn('size-3.5 transition-transform duration-fast', guide && 'rotate-180')} aria-hidden="true" />
          </button>
        </div>
        {guide && (
          <ol id={guideId} className="mt-3 flex flex-col gap-1 border-t border-current/20 pt-3">
            {week.days.map((d) => (
              <li key={d.date} className="flex gap-2 text-body">
                <span className="w-14 shrink-0 font-strong opacity-80">Day {d.day}</span>
                <span className="min-w-0 flex-1">
                  {d.title}
                  {d.subtitle && <span className="opacity-75"> · {d.subtitle}</span>}
                </span>
                {d.state === 'done' && <Check className="size-4 shrink-0" aria-label="Done" />}
              </li>
            ))}
          </ol>
        )}
      </header>

      <ol className="flex w-full flex-col items-center gap-5" aria-label={`Week ${week.number} days`}>
        {week.days.map((d, i) => {
          const isCurrent = d.date === current;
          return (
            <li key={d.date} className="flex w-full flex-col items-center">
              <div style={{ transform: `translateX(${WIND[i % WIND.length]}px)` }} ref={isCurrent ? currentRef : undefined} className="flex flex-col items-center">
                <DayNode day={d} tone={tone} isCurrent={isCurrent} open={openDate === d.date} onToggle={() => onToggle(d.date)} />
              </div>
              {openDate === d.date && <DayPopover day={d} tone={tone} isCurrent={isCurrent} onOpen={() => onOpenDay(d.date)} />}
            </li>
          );
        })}
        <li className="flex flex-col items-center gap-1 pt-1" aria-label={complete ? `Week ${week.number} complete` : `Week ${week.number} trophy, not earned yet`}>
          <span
            className={cn(
              'flex size-14 items-center justify-center rounded-2xl [&_svg]:size-7',
              complete ? 'bg-warning-subtle text-warning shadow-[inset_0_-5px_0_0_rgb(0_0_0/0.12)]' : 'bg-surface-active text-fg-disabled'
            )}
            aria-hidden="true"
          >
            <Trophy />
          </span>
          <span className={cn('text-caption font-strong', complete ? 'text-warning-fg' : 'text-fg-subtle')}>
            {complete ? `Week ${week.number} complete` : `Finish week ${week.number}`}
          </span>
        </li>
      </ol>
    </section>
  );
}

function DayNode({
  day: d,
  tone,
  isCurrent,
  open,
  onToggle,
}: {
  day: PathDay;
  tone: (typeof TONES)[number];
  isCurrent: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const coloured = d.state === 'done' || isCurrent || d.state === 'today';
  const missed = d.state === 'missed';
  return (
    <>
      {isCurrent && (
        <span
          className={cn(
            'mb-2 animate-[nm-bob_1.6s_ease-in-out_infinite] rounded-lg border-2 border-line bg-surface px-3 py-1 text-label font-strong uppercase tracking-wide shadow-e1 motion-reduce:animate-none',
            tone.text
          )}
          aria-hidden="true"
        >
          {d.done > 0 ? 'Continue' : d.date === undefined ? '' : 'Start'}
        </span>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Week ${d.week}, day ${d.day}: ${d.title}. ${formatDay(d.date)}. ${d.state === 'done' ? 'Done' : missed ? `Not finished, ${d.done} of ${d.total} done` : d.state === 'today' ? `Today, ${d.done} of ${d.total} done` : `${d.total} tasks`}`}
        onClick={onToggle}
        className={cn(
          'relative flex size-[4.5rem] items-center justify-center rounded-full transition-transform duration-fast ease-standard [&_svg]:size-7',
          'shadow-[inset_0_-6px_0_0_rgb(0_0_0/0.2)] hover:brightness-110 active:translate-y-0.5 active:shadow-[inset_0_-3px_0_0_rgb(0_0_0/0.2)]',
          'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus/50',
          coloured ? tone.node : missed ? 'bg-warning text-canvas' : 'bg-surface-active text-fg-subtle shadow-[inset_0_-6px_0_0_rgb(0_0_0/0.08)]',
          isCurrent && cn('ring-8', tone.ring),
          d.state === 'done' && 'opacity-95'
        )}
      >
        {missed ? <AlertTriangle /> : dayIcon(d)}
        {d.state !== 'done' && d.done > 0 && (
          <span className="absolute -bottom-1 -right-1 rounded-full border-2 border-canvas bg-success px-1.5 text-caption font-strong text-canvas">
            {d.done}/{d.total}
          </span>
        )}
      </button>
      <div className="mt-2 flex max-w-[13rem] flex-col items-center text-center">
        <span className="text-caption font-strong uppercase tracking-wide text-fg-subtle">Day {d.day}</span>
        <span className={cn('line-clamp-2 text-body font-strong', d.state === 'upcoming' && !isCurrent ? 'text-fg-muted' : 'text-fg')}>{d.title}</span>
      </div>
    </>
  );
}

function DayPopover({ day: d, tone, isCurrent, onOpen }: { day: PathDay; tone: (typeof TONES)[number]; isCurrent: boolean; onOpen: () => void }) {
  const label = d.state === 'done' ? 'Review day' : d.state === 'missed' ? 'Catch up' : d.state === 'today' || isCurrent ? (d.done ? 'Continue' : 'Start') : 'Preview';
  return (
    <div className="mt-3 w-full max-w-sm animate-nm-pop-in rounded-2xl border border-line bg-surface-raised p-4 shadow-e2" role="region" aria-label={`Day ${d.day} details`}>
      <div className="text-caption font-strong uppercase tracking-wide text-fg-subtle">
        Week {d.week} · Day {d.day} · {formatDay(d.date)}
      </div>
      <div className="mt-0.5 text-heading font-strong text-fg">{d.title}</div>
      {d.subtitle && <div className="text-body text-fg-muted">Also: {d.subtitle}</div>}
      <ul className="mt-3 flex flex-col gap-1">
        {d.entries.slice(0, 6).map((e) => (
          <li key={e.key} className="flex items-center gap-2 text-body">
            <span className={cn('flex size-4 shrink-0 items-center justify-center rounded-full', e.done ? 'bg-success text-canvas' : 'border-2 border-line-strong')} aria-hidden="true">
              {e.done && <Check className="size-2.5" strokeWidth={4} />}
            </span>
            <span className={cn('min-w-0 flex-1 truncate', e.done ? 'text-fg-subtle line-through' : 'text-fg')}>
              {e.task ? e.task.title : e.entry.task_id.startsWith('mock/oa/') ? 'Online assessment mock' : 'Weekly revision'}
            </span>
            <span className="shrink-0 text-caption text-fg-subtle">{formatMinutes(e.entry.minutes)}</span>
          </li>
        ))}
        {d.entries.length > 6 && <li className="text-caption text-fg-subtle">and {d.entries.length - 6} more</li>}
      </ul>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-caption text-fg-subtle">{d.done}/{d.total} done · {formatMinutes(d.minutes)}</span>
        <Button className="ml-auto" size="sm" variant={d.state === 'upcoming' && !isCurrent ? 'secondary' : 'primary'} rightIcon={label === 'Start' ? <Sparkles /> : undefined} onClick={onOpen}>
          {label}
        </Button>
      </div>
      <span className="sr-only">{streamLabel(d.stream ?? 'dsa')}</span>
      <span className={cn('hidden', tone.text)} />
    </div>
  );
}

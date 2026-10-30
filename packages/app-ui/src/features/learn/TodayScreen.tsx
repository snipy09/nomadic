import React, { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Brain,
  Check,
  Code2,
  Flame,
  Hammer,
  Repeat,
  RotateCcw,
  Sparkles,
  Timer,
  Wrench,
} from 'lucide-react';
import { Button, Card, Checkbox, cn } from '@nomadic/ui';
import { formatDay, type PathDay, type Shortfall, type Streak } from '@job-automator/learning';
import { IS_MOBILE } from '../../platform';
import { formatMinutes } from './learnModel';
import { STEP_LABEL, type Session, type SessionStep, type StepKind, type WeekSummary } from './sessionModel';

export const STEP_ICON: Record<StepKind, React.ReactNode> = {
  review: <RotateCcw />,
  lesson: <BookOpen />,
  handson: <Wrench />,
  practice: <Code2 />,
  check: <Brain />,
  project: <Hammer />,
  mock: <Timer />,
  revision: <Repeat />,
  task: <Check />,
};

/** Steps the app has no screen for; the student ticks them here. */
export const isManualStep = (s: SessionStep) => s.kind === 'mock' || s.kind === 'revision' || s.kind === 'task';

/** What the student does in a step that has no screen of its own. */
export function stepHint(s: SessionStep): string | null {
  if (s.kind === 'mock') {
    return s.views[0]?.task.id.startsWith('mock/oa/')
      ? `A full online-assessment style test: open Practice${IS_MOBILE ? ' in the desktop app' : ''}, start mock mode with a 90-minute timer, then tick it here.`
      : `Solve 3 problems from this module in 45 minutes in Practice mock mode${IS_MOBILE ? ' (desktop app)' : ''}, then tick it here.`;
  }
  if (s.kind === 'revision') return 'Re-solve two problems you found hard this week and read the points of its lessons again, then tick it here.';
  return null;
}

export function stepAction(s: SessionStep, started: boolean): string {
  switch (s.kind) {
    case 'review': return 'Start review';
    case 'lesson': return started ? 'Continue lesson' : 'Start lesson';
    case 'handson':
    case 'practice': return 'Open practice';
    case 'check': return 'Take the check';
    case 'project': return 'Open project';
    default: return 'Mark as done';
  }
}

interface TodayScreenProps {
  date: string;
  session: Session;
  pathDay: PathDay | null;
  week: WeekSummary;
  streak: Streak;
  /** The next session after today (for rest days and when today is done). */
  nextDay: PathDay | null;
  beforeStart: boolean;
  afterEnd: boolean;
  dayKind: 'study' | 'revision' | 'buffer' | 'mock' | 'off' | null;
  shortfall: Shortfall | null;
  /** Lesson entry keys the student already started (resume). */
  started: (s: SessionStep) => boolean;
  onOpenStep: (s: SessionStep) => void;
  onToggleStep: (s: SessionStep, done: boolean) => Promise<void>;
  onSkipToday: () => Promise<void>;
  onDoMore: () => Promise<void>;
  onStartNext: () => Promise<void>;
  onShortfallOption: (option: 'extend' | 'weekend' | 'drop') => Promise<void>;
  onNewRoadmap: () => void;
}

/** Today: the next step first, then the session in order. One banner at most; missed work has already moved forward. */
export function TodayScreen(props: TodayScreenProps) {
  const { session, pathDay, week, streak, nextDay, shortfall } = props;
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const hasWork = session.steps.some((s) => s.kind !== 'review');
  const allDone = session.total > 0 && session.done === session.total && hasWork;
  const next = session.next;
  const pct = session.total ? Math.round((session.done / session.total) * 100) : 0;
  const title = session.focus ? (session.side ? `${session.focus} + ${session.side}` : session.focus) : null;

  const header = (
    <header className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 shadow-e1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-caption font-strong uppercase tracking-wider text-accent">
          {pathDay ? `Week ${pathDay.week} · Session ${pathDay.day} of ${week.sessionsTotal || pathDay.day}` : formatDay(props.date)}
        </span>
        <span
          className={cn('inline-flex items-center gap-1 text-caption font-strong [&_svg]:size-3.5', streak.current > 0 ? 'text-warning-fg' : 'text-fg-subtle')}
          aria-label={`${streak.current} day streak`}
        >
          <Flame aria-hidden="true" /> {streak.current}
        </span>
      </div>
      <h2 className="text-headline font-strong text-fg">{title ?? (props.dayKind === 'buffer' ? 'Reserve day' : 'Rest day')}</h2>
      {hasWork && (
        <div className="flex items-center gap-3">
          <div
            className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-sunken"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Steps done today"
          >
            <div className={cn('h-full rounded-full transition-[width] duration-slow ease-out', pct === 100 ? 'bg-success' : 'bg-accent')} style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 text-body text-fg-muted">
            {session.done} of {session.total} done{session.minutesLeft ? ` · ${formatMinutes(session.minutesLeft)} left` : ''}
          </span>
        </div>
      )}
    </header>
  );

  if (props.beforeStart || props.afterEnd) {
    return (
      <div className="flex flex-col gap-5">
        <Card padding="lg" className="flex flex-col items-start gap-3">
          <h2 className="text-title font-strong text-fg">{props.beforeStart ? 'Your plan starts soon' : 'Your plan has ended'}</h2>
          <p className="text-body text-fg-muted">
            {props.beforeStart
              ? nextDay
                ? `Your first session is on ${formatDay(nextDay.date)}: ${nextDay.title}.`
                : 'Your first session is coming up.'
              : 'Make a new roadmap to keep going, or keep reviewing what you learned.'}
          </p>
          {props.beforeStart && nextDay ? (
            <Button variant="primary" loading={busy === 'next'} onClick={() => void run('next', props.onStartNext)}>Start now</Button>
          ) : (
            <Button variant="primary" onClick={props.onNewRoadmap}>New roadmap</Button>
          )}
        </Card>
        {shortfall && <ShortfallBanner shortfall={shortfall} onOption={props.onShortfallOption} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {header}

      {shortfall ? (
        <ShortfallBanner shortfall={shortfall} onOption={props.onShortfallOption} />
      ) : allDone ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-success-subtle px-4 py-3 text-success-fg" role="status">
          <Sparkles className="size-5 shrink-0" aria-hidden="true" />
          <p className="mr-auto text-body-lg font-strong">
            Session done.{nextDay ? ` Next: ${formatDay(nextDay.date, false)} · ${nextDay.title}.` : ''}
          </p>
          <Button size="sm" variant="secondary" loading={busy === 'more'} onClick={() => void run('more', props.onDoMore)}>Do more today</Button>
        </div>
      ) : null}

      {next && (
        <section aria-labelledby="today-next">
          <Card padding="lg" className="flex flex-col gap-3 border-accent/40">
            <div id="today-next" className="text-label font-strong uppercase tracking-wide text-accent">Next up</div>
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-subtle text-accent-subtle-fg [&_svg]:size-5" aria-hidden="true">
                {STEP_ICON[next.kind]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-heading font-strong text-fg">
                  {STEP_LABEL[next.kind]} · {next.title}
                </div>
                <div className="text-body text-fg-muted">
                  {[formatMinutes(next.minutes), stepDetail(next)].filter(Boolean).join(' · ')}
                </div>
                {stepHint(next) && <p className="mt-1 text-body text-fg-muted">{stepHint(next)}</p>}
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                variant="primary"
                size="lg"
                rightIcon={isManualStep(next) ? <Check /> : <ArrowRight />}
                loading={busy === 'step'}
                onClick={() => (isManualStep(next) ? void run('step', () => props.onToggleStep(next, true)) : props.onOpenStep(next))}
              >
                {stepAction(next, props.started(next))}
              </Button>
            </div>
          </Card>
        </section>
      )}

      {!hasWork && (
        <Card padding="lg" className="flex flex-col items-start gap-3">
          <p className="text-body text-fg-muted">
            {props.dayKind === 'buffer'
              ? 'Nothing is planned today. It is a reserve day: your plan uses it only when work moves forward.'
              : 'Nothing is planned today.'}
            {nextDay ? ` Next session: ${formatDay(nextDay.date)} · ${nextDay.title}.` : ' All planned work is done.'}
          </p>
          {nextDay && (
            <Button variant="primary" loading={busy === 'next'} onClick={() => void run('next', props.onStartNext)}>Start the next session now</Button>
          )}
        </Card>
      )}

      {hasWork && (
        <section aria-labelledby="today-steps" className="flex flex-col gap-2">
          <h3 id="today-steps" className="text-heading font-strong text-fg">Today's session</h3>
          <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {session.steps.map((s) => (
              <li key={s.id} className={cn('flex items-center gap-3 px-4 py-3', s.done && 'bg-success-subtle/30')}>
                {isManualStep(s) ? (
                  <Checkbox
                    checked={s.done}
                    aria-label={`${s.done ? 'Untick' : 'Tick'} ${STEP_LABEL[s.kind]}: ${s.title}`}
                    onCheckedChange={(c) => void run(`t:${s.id}`, () => props.onToggleStep(s, c === true))}
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-full',
                      s.done ? 'bg-success text-canvas' : 'border-2 border-line-strong'
                    )}
                  >
                    {s.done && <Check className="size-3" strokeWidth={4} />}
                  </span>
                )}
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  onClick={() => (isManualStep(s) ? void run(`t:${s.id}`, () => props.onToggleStep(s, !s.done)) : props.onOpenStep(s))}
                  aria-label={`${STEP_LABEL[s.kind]}: ${s.title}${s.done ? ', done' : ''}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-body-lg', s.done ? 'text-fg-subtle line-through' : 'font-strong text-fg')}>
                      <span className="font-regular text-fg-subtle">{STEP_LABEL[s.kind]}: </span>
                      {s.title}
                    </span>
                    {stepDetail(s) && <span className="block truncate text-caption text-fg-subtle">{stepDetail(s)}</span>}
                  </span>
                  <span className="shrink-0 text-caption tabular-nums text-fg-subtle">{formatMinutes(s.minutes)}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {hasWork && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-body">
          {!allDone && (
            <Button variant="ghost" size="sm" loading={busy === 'skip'} onClick={() => void run('skip', props.onSkipToday)}>
              Can't study today
            </Button>
          )}
          {!allDone && (
            <Button variant="ghost" size="sm" loading={busy === 'more'} onClick={() => void run('more', props.onDoMore)}>
              Do more today
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** The short line under a step: what it is made of. */
export function stepDetail(s: SessionStep): string {
  const v = s.views[0];
  if (s.kind === 'review') return 'Questions you met before, so they stick';
  if (!v) return '';
  const bits: string[] = [];
  if (s.kind === 'lesson') {
    if (v.entry.parts > 1) bits.push(`Part ${v.entry.part} of ${v.entry.parts}`);
    if (s.views.some((x) => x.task.kind === 'quiz')) bits.push('check included');
  }
  if (s.kind === 'practice' && v.task.problem_ref) bits.push('LeetCode');
  if (s.kind === 'check') bits.push('A few questions from memory');
  if (v.task.note) bits.push(v.task.note);
  if (v.task.optional) bits.push('optional');
  return bits.join(' · ');
}

/** The one question the plan asks: work no longer fits before the end date. */
export function ShortfallBanner({ shortfall, onOption }: { shortfall: Shortfall; onOption: (option: 'extend' | 'weekend' | 'drop') => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning-subtle px-4 py-3" role="status">
      <p className="text-body text-fg">
        {formatMinutes(shortfall.minutes)} of work no longer fits before your end date. Pick one:
      </p>
      <div className="flex flex-wrap gap-2">
        {shortfall.options.extend_to && (
          <Button size="sm" variant="secondary" loading={busy === 'extend'} onClick={() => void run('extend', () => onOption('extend'))}>
            Extend to {formatDay(shortfall.options.extend_to)}
          </Button>
        )}
        {shortfall.options.weekend_minutes && (
          <Button size="sm" variant="secondary" loading={busy === 'weekend'} onClick={() => void run('weekend', () => onOption('weekend'))}>
            Weekends: {formatMinutes(shortfall.options.weekend_minutes)}
          </Button>
        )}
        {shortfall.options.drop_optional && (
          <Button size="sm" variant="secondary" loading={busy === 'drop'} onClick={() => void run('drop', () => onOption('drop'))}>
            Leave out {shortfall.options.drop_optional} optional tasks
          </Button>
        )}
      </div>
    </div>
  );
}

import React, { useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, CalendarClock, ExternalLink, Flame, RotateCcw, Sparkles } from 'lucide-react';
import { Button, Card, EmptyState, cn, useToast } from '@nomadic/ui';
import { PACE_CHIPS, formatDay, type GradeResult, type PathDay, type PlanTask, type Shortfall } from '@job-automator/learning';
import { getApi, type LearningEventInput } from '../../types';
import { problemByRef } from './catalog';
import { skillName, type QuizItem } from './content';
import { DayTaskList } from './DayTaskList';
import { formatMinutes, type EntryView, type TodayModel } from './learnModel';
import { QuizForm } from './QuizForm';
import { reviewEvents } from './quizLogic';

export type PaceChip = keyof typeof PACE_CHIPS;

const chipOf = (f: number): PaceChip | null =>
  (Object.entries(PACE_CHIPS).find(([, v]) => Math.abs(v - f) < 0.01)?.[0] as PaceChip | undefined) ?? null;

/** Opens a task: a problem in the browser, anything else in the app. Records when it was opened (for the pace). */
export function useTaskOpener(onOpenTask: (task: PlanTask) => void) {
  const openedAt = useRef(new Map<string, number>());
  const open = (v: EntryView) => {
    openedAt.current.set(v.key, Date.now());
    if (v.task.kind === 'solve' && v.task.problem_ref) {
      const p = problemByRef(v.task.problem_ref);
      if (p) void getApi().openExternalUrl(p.link);
      return;
    }
    onOpenTask(v.task);
  };
  /** Seconds from Open to the tick, capped at three times the plan (0 when never opened). */
  const spent = (v: EntryView) => {
    const started = openedAt.current.get(v.key);
    return started ? Math.min((Date.now() - started) / 1000, v.entry.minutes * 180) : 0;
  };
  return { open, spent };
}

/** The header every day view shares: where the day sits in the plan and what it is about. */
export function DayHeader({ day, date, minutes, done, total, onBack }: { day: PathDay | null; date: string; minutes: number; done: number; total: number; onBack?: () => void }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <header className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 shadow-e1">
      {onBack && (
        <div className="-ml-2 -mt-1">
          <Button variant="ghost" size="sm" leftIcon={<ArrowLeft />} onClick={onBack}>Back to path</Button>
        </div>
      )}
      <div className="text-caption font-strong uppercase tracking-wider text-accent">
        {day ? `Week ${day.week} · Day ${day.day} · ` : ''}{formatDay(date)}
      </div>
      <h2 className="text-headline font-strong text-fg">{day?.title ?? 'No study planned'}</h2>
      {day && (
        <p className="text-body-lg text-fg-muted">
          {day.subtitle ? `Also: ${day.subtitle} · ` : ''}Day {day.index} of your plan · {formatMinutes(minutes)} planned
        </p>
      )}
      {total > 0 && (
        <div className="flex items-center gap-3">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Tasks done today">
            <div className={cn('h-full rounded-full transition-[width] duration-slow ease-out', pct === 100 ? 'bg-success' : 'bg-accent')} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-body font-strong text-fg">{done}/{total}</span>
        </div>
      )}
    </header>
  );
}

interface TodayScreenProps {
  today: TodayModel;
  pathDay: PathDay | null;
  trackId: string;
  isFree: boolean;
  practiceRemaining: number;
  paceFactor: number;
  /** Pace measured from ticked tasks (null until there are 10 timed ones). */
  measuredPace?: number | null;
  shortfall: Shortfall | null;
  onToggle: (view: EntryView, done: boolean, durationS: number) => Promise<{ ok: boolean; error?: string }>;
  onRecord: (events: LearningEventInput[]) => Promise<{ ok: boolean; error?: string }>;
  onOpenTask: (task: PlanTask) => void;
  onReplan: () => Promise<void>;
  onSkipToday: () => Promise<void>;
  onDoMore: () => Promise<void>;
  onPace: (factor: number) => Promise<void>;
  onShortfallOption: (option: 'extend' | 'weekend' | 'drop') => Promise<void>;
  onOpenUpgrade?: (feature?: string) => void;
}

/** Today: the day's tasks grouped by topic with what to learn, catch-up banners, reviews and day actions. */
export function TodayScreen(props: TodayScreenProps) {
  const { today, pathDay, trackId, isFree, practiceRemaining, paceFactor, shortfall, onToggle, onRecord, onOpenTask } = props;
  const { toast } = useToast();
  const [session, setSession] = useState<QuizItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { open, spent } = useTaskOpener(onOpenTask);

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (v: EntryView, done: boolean) => {
    const res = await onToggle(v, done, done ? spent(v) : 0);
    if (!res.ok) toast({ title: 'Not saved', description: res.error, tone: 'danger' });
  };

  const submitReviews = async (grades: GradeResult[]) => {
    const res = await onRecord(reviewEvents(session ?? [], grades, trackId, new Date()));
    if (!res.ok) toast({ title: 'Your answers were not saved', description: res.error, tone: 'danger' });
    return res;
  };

  const chip = chipOf(paceFactor);
  const done = today.entries.filter((e) => e.done).length;
  const allDone = today.entries.length > 0 && done === today.entries.length;

  return (
    <div className="flex flex-col gap-5">
      {today.beforeStart || today.afterEnd ? (
        <Card padding="lg" className="flex flex-col gap-1">
          <h2 className="text-title font-strong text-fg">{today.beforeStart ? 'Your plan starts soon' : 'Your plan has ended'}</h2>
          <p className="text-body text-fg-muted">
            {today.beforeStart && today.nextStudyDate ? `Day 1 is ${formatDay(today.nextStudyDate)}. Use "Do more today" to start early.` : 'Make a new roadmap to keep going.'}
          </p>
        </Card>
      ) : (
        <DayHeader day={pathDay} date={today.date} minutes={today.minutesPlanned} done={done} total={today.entries.length} />
      )}

      {today.missed > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning-subtle px-4 py-3">
          <AlertTriangle className="size-5 shrink-0 text-warning" aria-hidden="true" />
          <p className="mr-auto text-body text-fg">
            {today.missed} {today.missed === 1 ? 'task' : 'tasks'} from earlier days not done. Re-plan to move them to your free time.
          </p>
          <Button size="sm" loading={busy === 'replan'} onClick={() => run('replan', props.onReplan)}>Re-plan</Button>
        </div>
      )}

      {shortfall && (
        <div className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-surface px-4 py-3">
          <p className="text-body text-fg">{formatMinutes(shortfall.minutes)} of work no longer fits before your end date. Pick one:</p>
          <div className="flex flex-wrap gap-2">
            {shortfall.options.extend_to && (
              <Button size="sm" variant="secondary" onClick={() => run('extend', () => props.onShortfallOption('extend'))}>Extend to {formatDay(shortfall.options.extend_to)}</Button>
            )}
            {shortfall.options.weekend_minutes && (
              <Button size="sm" variant="secondary" onClick={() => run('weekend', () => props.onShortfallOption('weekend'))}>Weekends: {formatMinutes(shortfall.options.weekend_minutes)}</Button>
            )}
            {shortfall.options.drop_optional && (
              <Button size="sm" variant="secondary" onClick={() => run('drop', () => props.onShortfallOption('drop'))}>Leave out {shortfall.options.drop_optional} optional tasks</Button>
            )}
          </div>
        </div>
      )}

      {allDone && (
        <div className="flex items-center gap-3 rounded-xl bg-success-subtle px-4 py-3 text-success-fg" role="status">
          <Sparkles className="size-5 shrink-0" aria-hidden="true" />
          <p className="mr-auto text-body-lg font-strong">Day complete. {today.streak.current > 1 ? `${today.streak.current}-day streak!` : 'Nice work.'}</p>
          <Button size="sm" variant="secondary" loading={busy === 'more'} onClick={() => run('more', props.onDoMore)}>Get ahead</Button>
        </div>
      )}

      <section aria-labelledby="today-tasks" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id="today-tasks" className="mr-auto text-heading font-strong text-fg">Today's tasks</h3>
          {!allDone && <Button size="sm" variant="secondary" loading={busy === 'more'} onClick={() => run('more', props.onDoMore)}>Do more today</Button>}
          {today.entries.some((e) => !e.done) && (
            <Button size="sm" variant="ghost" loading={busy === 'skip'} onClick={() => run('skip', props.onSkipToday)}>Can't study today</Button>
          )}
        </div>
        {today.entries.length === 0 ? (
          <EmptyState
            size="sm"
            bordered
            icon={<CalendarClock />}
            title={today.day?.kind === 'buffer' ? 'Catch-up day' : 'Nothing planned today'}
            description={
              today.nextStudyDate
                ? `Next study day: ${formatDay(today.nextStudyDate)}. Use "Do more today" to get ahead.`
                : 'All planned work is done or scheduled.'
            }
          />
        ) : (
          <DayTaskList views={today.entries} onToggle={(v, d) => void toggle(v, d)} onOpen={open} />
        )}
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <section aria-labelledby="today-reviews" className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
          <h3 id="today-reviews" className="flex items-center gap-2 text-heading font-strong text-fg">
            <RotateCcw className="size-4 text-accent" aria-hidden="true" /> Reviews
          </h3>
          {session ? (
            <QuizForm
              items={session}
              label="Review"
              submitLabel="Check answers"
              onSubmit={submitReviews}
              renderResult={(grades) => (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="mr-auto text-body text-fg">{grades.filter((g) => g.correct).length} of {grades.length} remembered.</p>
                  <Button onClick={() => setSession(null)}>Done</Button>
                </div>
              )}
            />
          ) : today.reviews.length > 0 && practiceRemaining > 0 ? (
            <div className="flex flex-wrap items-center gap-3">
              <div className="mr-auto">
                <div className="text-body font-strong text-fg">{today.reviews.length} {today.reviews.length === 1 ? 'question' : 'questions'} due</div>
                <div className="text-caption text-fg-subtle">{[...new Set(today.reviews.map((r) => r.skill_id))].slice(0, 3).map(skillName).join(', ')}</div>
              </div>
              <Button onClick={() => setSession(today.reviews.slice(0, Math.max(1, Math.min(today.reviews.length, practiceRemaining))))}>Start review</Button>
            </div>
          ) : today.reviews.length > 0 ? (
            <div className="flex flex-wrap items-center gap-3 text-body text-fg-muted">
              <span className="mr-auto">Daily practice limit reached. Reviews wait until tomorrow.</span>
              {isFree && props.onOpenUpgrade && <Button size="sm" variant="subtle" onClick={() => props.onOpenUpgrade?.('Unlimited practice')}>Upgrade</Button>}
            </div>
          ) : (
            <p className="text-body text-fg-muted">No reviews due. Quiz answers you miss come back here.</p>
          )}
          {today.resolveDue.length > 0 && (
            <div className="flex flex-col gap-1 border-t border-line pt-2">
              <div className="text-body font-strong text-fg">Re-solve to keep it fresh</div>
              <ul className="flex flex-wrap gap-2">
                {today.resolveDue.map((ref) => {
                  const p = problemByRef(ref);
                  return p ? (
                    <li key={ref}>
                      <Button size="sm" variant="secondary" rightIcon={<ExternalLink />} onClick={() => void getApi().openExternalUrl(p.link)}>{p.title}</Button>
                    </li>
                  ) : null;
                })}
              </ul>
            </div>
          )}
        </section>

        <section aria-labelledby="today-pace" className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
          <h3 id="today-pace" className="flex items-center gap-2 text-heading font-strong text-fg">
            <Flame className="size-4 text-warning" aria-hidden="true" /> Streak and pace
          </h3>
          <p className="text-body text-fg-muted">
            {today.streak.current} {today.streak.current === 1 ? 'day' : 'days'} in a row (best {today.streak.longest}) ·{' '}
            {today.forecast.status === 'behind' ? 'behind plan' : today.forecast.status === 'ahead' ? 'ahead of plan' : 'on track'}
            {today.forecast.projected_finish ? `, finishing around ${formatDay(today.forecast.projected_finish)}` : ''}
          </p>
          <div className="text-caption text-fg-subtle">Task time estimates</div>
          <div role="group" aria-label="Task time estimates" className="flex flex-wrap gap-1">
            {(['less', 'planned', 'more'] as const).map((c) => (
              <Button key={c} size="sm" variant={chip === c ? 'primary' : 'secondary'} aria-pressed={chip === c} onClick={() => run('pace', () => props.onPace(PACE_CHIPS[c]))}>
                {c === 'less' ? 'I am faster' : c === 'planned' ? 'As planned' : 'I need more time'}
              </Button>
            ))}
          </div>
          {!chip && <span className="text-caption text-fg-subtle">Current estimates: {paceFactor}×</span>}
          {props.measuredPace != null && Math.abs(props.measuredPace - paceFactor) >= 0.1 && (
            <Button size="sm" variant="ghost" onClick={() => run('pace', () => props.onPace(props.measuredPace!))}>
              Use my measured pace ({props.measuredPace}×)
            </Button>
          )}
        </section>
      </div>
    </div>
  );
}

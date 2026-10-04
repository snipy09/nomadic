import React, { useRef, useState } from 'react';
import { AlertTriangle, CalendarClock, ExternalLink, Flame, RotateCcw } from 'lucide-react';
import { Badge, Button, Card, Checkbox, EmptyState, useToast } from '@nomadic/ui';
import { PACE_CHIPS, formatDay, type GradeResult, type PlanTask, type Shortfall } from '@job-automator/learning';
import { getApi, type LearningEventInput } from '../../types';
import { problemByRef } from './catalog';
import { skillName, type QuizItem } from './content';
import { KIND_LABEL, formatMinutes, streamLabel, type EntryView, type TodayModel } from './learnModel';
import { QuizForm } from './QuizForm';
import { reviewEvents } from './quizLogic';

export type PaceChip = keyof typeof PACE_CHIPS;

interface TodayScreenProps {
  today: TodayModel;
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

const chipOf = (f: number): PaceChip | null =>
  (Object.entries(PACE_CHIPS).find(([, v]) => Math.abs(v - f) < 0.01)?.[0] as PaceChip | undefined) ?? null;

/** Today: the day's tasks with ticks and Open, reviews, catch-up banners and day actions. */
export function TodayScreen(props: TodayScreenProps) {
  const { today, trackId, isFree, practiceRemaining, paceFactor, shortfall, onToggle, onRecord, onOpenTask } = props;
  const { toast } = useToast();
  const [session, setSession] = useState<QuizItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const openedAt = useRef(new Map<string, number>());

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (v: EntryView, done: boolean) => {
    const started = openedAt.current.get(v.key);
    // Time from Open to the tick, capped at three times the plan (the pace factor ignores ticks without it).
    const durationS = done && started ? Math.min((Date.now() - started) / 1000, v.entry.minutes * 180) : 0;
    const res = await onToggle(v, done, durationS);
    if (!res.ok) toast({ title: 'Not saved', description: res.error, tone: 'danger' });
  };

  const open = (v: EntryView) => {
    openedAt.current.set(v.key, Date.now());
    if (v.task.kind === 'solve' && v.task.problem_ref) {
      const p = problemByRef(v.task.problem_ref);
      if (p) void getApi().openExternalUrl(p.link);
      return;
    }
    onOpenTask(v.task);
  };

  const submitReviews = async (grades: GradeResult[]) => {
    const res = await onRecord(reviewEvents(session ?? [], grades, trackId, new Date()));
    if (!res.ok) toast({ title: 'Your answers were not saved', description: res.error, tone: 'danger' });
    return res;
  };

  const byStream = new Map<string, EntryView[]>();
  for (const v of today.entries) byStream.set(v.entry.stream, [...(byStream.get(v.entry.stream) ?? []), v]);
  const chip = chipOf(paceFactor);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="mr-auto text-title font-strong text-fg">
          {today.beforeStart ? 'Your plan starts soon' : today.afterEnd ? 'Your plan has ended' : `Day ${today.dayIndex} of ${today.dayCount}`}
        </h2>
        <span className="text-body text-fg-muted">
          {formatDay(today.date)} · {today.day?.kind === 'off' || !today.day ? 'no study planned' : `${formatMinutes(today.minutesPlanned)} planned`}
          {today.day?.kind === 'buffer' ? ' · buffer day' : today.day?.kind === 'revision' ? ' · revision day' : today.day?.kind === 'mock' ? ' · mock test day' : ''}
        </span>
      </div>

      {today.missed > 0 && (
        <Card padding="sm" className="flex flex-wrap items-center gap-3 border-warning/40 bg-warning-subtle/40">
          <AlertTriangle className="size-5 shrink-0 text-warning" aria-hidden="true" />
          <p className="mr-auto text-body text-fg">
            {today.missed} {today.missed === 1 ? 'task' : 'tasks'} from earlier days not done. Re-plan to move them to your free time.
          </p>
          <Button size="sm" loading={busy === 'replan'} onClick={() => run('replan', props.onReplan)}>Re-plan</Button>
        </Card>
      )}

      {shortfall && (
        <Card padding="sm" className="flex flex-col gap-2 border-warning/40">
          <p className="text-body text-fg">
            {formatMinutes(shortfall.minutes)} of work no longer fits before your end date. Pick one:
          </p>
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
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card padding="md" className="flex items-center gap-3">
          <Flame className="size-6 shrink-0 text-warning" aria-hidden="true" />
          <div>
            <div className="text-title font-strong text-fg">{today.streak.current} {today.streak.current === 1 ? 'day' : 'days'}</div>
            <div className="text-caption text-fg-subtle">Streak · best {today.streak.longest}</div>
          </div>
        </Card>
        <Card padding="md">
          <div className="text-body font-strong text-fg">
            {today.forecast.status === 'behind' ? 'Behind' : today.forecast.status === 'ahead' ? 'Ahead' : 'On track'}
          </div>
          <div className="text-caption text-fg-subtle">
            {today.forecast.projected_finish ? `Finish around ${formatDay(today.forecast.projected_finish)}` : 'Nothing planned yet'}
          </div>
        </Card>
        <Card padding="md" className="flex flex-col gap-2">
          <div className="text-body font-strong text-fg">Pace</div>
          <div role="group" aria-label="Task time estimates" className="flex flex-wrap gap-1">
            {(['less', 'planned', 'more'] as const).map((c) => (
              <Button key={c} size="sm" variant={chip === c ? 'primary' : 'secondary'} aria-pressed={chip === c} onClick={() => run('pace', () => props.onPace(PACE_CHIPS[c]))}>
                {c === 'less' ? 'Less time' : c === 'planned' ? 'As planned' : 'More time'}
              </Button>
            ))}
          </div>
          {!chip && <span className="text-caption text-fg-subtle">Current estimates: {paceFactor}×</span>}
          {props.measuredPace != null && Math.abs(props.measuredPace - paceFactor) >= 0.1 && (
            <Button size="sm" variant="ghost" onClick={() => run('pace', () => props.onPace(props.measuredPace!))}>
              Use my measured pace ({props.measuredPace}×)
            </Button>
          )}
        </Card>
      </div>

      <section aria-labelledby="today-tasks" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id="today-tasks" className="mr-auto text-heading font-strong text-fg">Today's tasks</h3>
          <Button size="sm" variant="secondary" loading={busy === 'more'} onClick={() => run('more', props.onDoMore)}>Do more today</Button>
          {today.entries.some((e) => !e.done) && (
            <Button size="sm" variant="ghost" loading={busy === 'skip'} onClick={() => run('skip', props.onSkipToday)}>Can't study today</Button>
          )}
        </div>
        {today.entries.length === 0 ? (
          <EmptyState
            size="sm"
            bordered
            icon={<CalendarClock />}
            title={today.day?.kind === 'buffer' ? 'Buffer day' : 'Nothing planned today'}
            description={
              today.nextStudyDate
                ? `Next study day: ${formatDay(today.nextStudyDate)}. Use "Do more today" to get ahead.`
                : 'All planned work is done or scheduled.'
            }
          />
        ) : (
          [...byStream].map(([stream, views]) => (
            <div key={stream} className="flex flex-col gap-1.5">
              <div className="text-caption font-strong uppercase tracking-wide text-fg-subtle">{streamLabel(stream as never)}</div>
              <ul className="flex flex-col gap-1.5">
                {views.map((v) => (
                  <li key={v.key} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
                    <Checkbox
                      checked={v.done}
                      onCheckedChange={(c) => void toggle(v, c === true)}
                      aria-label={`${v.done ? 'Untick' : 'Tick'} ${v.task.title}`}
                    />
                    <div className="mr-auto min-w-0">
                      <div className={v.done ? 'text-body text-fg-subtle line-through' : 'text-body text-fg'}>
                        <span className="font-strong">{KIND_LABEL[v.task.kind]}</span> {v.task.title}
                        {v.entry.parts > 1 ? ` (part ${v.entry.part} of ${v.entry.parts})` : ''}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-caption text-fg-subtle">
                        <span>{formatMinutes(v.entry.minutes)}</span>
                        {v.task.kind === 'mock' && <span>timed: use Practice's mock mode, then tick it here</span>}
                        {v.task.kind === 'revise' && <span>go back over this week's topics and missed problems</span>}
                        {v.task.problem_ref && <span className="capitalize">{problemByRef(v.task.problem_ref)?.difficulty}</span>}
                        {v.task.note && <Badge size="sm">{v.task.note}</Badge>}
                        {v.task.optional && <span>optional</span>}
                      </div>
                    </div>
                    {v.task.kind !== 'revise' && v.task.kind !== 'mock' ? (
                      <Button size="sm" variant="secondary" rightIcon={v.task.kind === 'solve' ? <ExternalLink /> : undefined} onClick={() => open(v)}>
                        {v.task.kind === 'solve' ? 'Open' : 'Start'}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section aria-labelledby="today-reviews" className="flex flex-col gap-2">
        <h3 id="today-reviews" className="text-heading font-strong text-fg">Reviews</h3>
        {session ? (
          <QuizForm
            items={session}
            label="Review"
            submitLabel="Check answers"
            onSubmit={submitReviews}
            renderResult={(grades) => (
              <Card padding="md" className="flex flex-wrap items-center gap-3">
                <p className="mr-auto text-body text-fg">{grades.filter((g) => g.correct).length} of {grades.length} remembered.</p>
                <Button onClick={() => setSession(null)}>Done</Button>
              </Card>
            )}
          />
        ) : today.reviews.length > 0 && practiceRemaining > 0 ? (
          <Card padding="md" className="flex flex-wrap items-center gap-3">
            <RotateCcw className="size-5 shrink-0 text-accent" aria-hidden="true" />
            <div className="mr-auto">
              <div className="text-body font-strong text-fg">{today.reviews.length} {today.reviews.length === 1 ? 'question' : 'questions'} due</div>
              <div className="text-caption text-fg-subtle">{[...new Set(today.reviews.map((r) => r.skill_id))].slice(0, 3).map(skillName).join(', ')}</div>
            </div>
            <Button onClick={() => setSession(today.reviews.slice(0, Math.max(1, Math.min(today.reviews.length, practiceRemaining))))}>Start review</Button>
          </Card>
        ) : today.reviews.length > 0 ? (
          <Card variant="sunken" padding="sm" className="flex flex-wrap items-center gap-3 text-body text-fg-muted">
            <span className="mr-auto">Daily practice limit reached. Reviews wait until tomorrow.</span>
            {isFree && props.onOpenUpgrade && <Button size="sm" variant="subtle" onClick={() => props.onOpenUpgrade?.('Unlimited practice')}>Upgrade</Button>}
          </Card>
        ) : (
          <Card variant="sunken" padding="sm" className="text-body text-fg-muted">No reviews due.</Card>
        )}
        {today.resolveDue.length > 0 && (
          <Card variant="sunken" padding="sm" className="flex flex-col gap-1">
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
          </Card>
        )}
      </section>
    </div>
  );
}

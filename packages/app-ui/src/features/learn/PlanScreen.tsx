import React, { useState } from 'react';
import { Check, ChevronDown, Settings2, Trophy } from 'lucide-react';
import { Badge, Button, Card, Checkbox, Field, Input, Select, cn } from '@nomadic/ui';
import {
  PACE_CHIPS,
  addDays,
  dayOfWeek,
  formatDay,
  type Intake,
  type LearningEvent,
  type Path,
  type PathDay,
  type PathWeek,
  type Schedule,
} from '@job-automator/learning';
import { ActivityHeatmap } from './ActivityHeatmap';
import { moduleById } from './catalog';
import { MINUTE_STEPS, formatMinutes, streamLabel, type ProgressModel } from './learnModel';
import { STEP_LABEL, type PlanStatus, type Session, type SessionStep, type WeekSummary } from './sessionModel';
import { isManualStep, stepDetail } from './TodayScreen';

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface PlanScreenProps {
  path: Path;
  schedule: Schedule;
  today: string;
  week: WeekSummary;
  status: PlanStatus;
  ahead: boolean;
  progress: ProgressModel;
  percent: number;
  events: LearningEvent[];
  /** Shown above the roadmap when the plan no longer fits (the same options as on Today). */
  fixBanner?: React.ReactNode;
  onOpenDay: (date: string) => void;
  onOpenSettings: () => void;
}

/** Plan: this week's sessions, the roadmap week by week, progress, and the plan settings. */
export function PlanScreen({ path, schedule, today, week, status, ahead, progress, percent, events, fixBanner, onOpenDay, onOpenSettings }: PlanScreenProps) {
  const weeks = path.weeks.filter((w) => w.days.length);
  const [open, setOpen] = useState<Set<number>>(() => new Set(week.week ? [week.week.number] : []));
  const [details, setDetails] = useState(false);
  const toggle = (n: number) => setOpen((s) => { const next = new Set(s); if (next.has(n)) next.delete(n); else next.add(n); return next; });
  const problems = progress.problems;

  if (!weeks.length) return <p className="text-body text-fg-muted">Nothing is planned yet.</p>;

  return (
    <div className="flex flex-col gap-6">
      {week.week && (
        <section aria-labelledby="plan-week" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 id="plan-week" className="text-heading font-strong text-fg">This week</h3>
            <span className="text-body text-fg-muted">
              {week.sessionsDone} of {week.sessionsTotal} sessions done
              {week.reserveDate ? ` · reserve day ${WEEKDAY[dayOfWeek(week.reserveDate)]}` : ''}
            </span>
            <span className="ml-auto text-caption text-fg-subtle">Week {week.week.number} of {weeks.length}</span>
          </div>
          <WeekStrip week={week.week} schedule={schedule} today={today} onOpenDay={onOpenDay} />
        </section>
      )}

      {fixBanner}

      <section aria-labelledby="plan-roadmap" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 id="plan-roadmap" className="text-heading font-strong text-fg">Roadmap</h3>
          <span className="text-body text-fg-muted">
            {ahead ? 'Ahead of plan' : 'On track'} · ends {formatDay(status.endDate, false)}
          </span>
          <Button className="ml-auto" size="sm" variant="secondary" leftIcon={<Settings2 />} onClick={onOpenSettings}>Plan settings</Button>
        </div>
        {status.leftOutMinutes > 0 && (
          <p className="text-body text-fg-muted">
            {formatMinutes(status.leftOutMinutes)} of the roadmap does not fit before {formatDay(status.endDate, false)}. More time a day or a later end date in{' '}
            <button type="button" className="font-strong text-accent underline-offset-2 hover:underline" onClick={onOpenSettings}>Plan settings</button> brings it in.
          </p>
        )}
        <ol className="flex flex-col gap-2">
          {weeks.map((w) => (
            <WeekRow key={w.number} week={w} today={today} open={open.has(w.number)} onToggle={() => toggle(w.number)} onOpenDay={onOpenDay} />
          ))}
        </ol>
      </section>

      <section aria-labelledby="plan-progress" className="flex flex-col gap-3">
        <h3 id="plan-progress" className="text-heading font-strong text-fg">Progress</h3>
        <dl className="grid grid-cols-3 divide-x divide-line rounded-lg border border-line bg-surface">
          <Stat label="of the plan done" value={`${percent}%`} />
          <Stat label={`of ${problems.planned} problems solved`} value={String(problems.solved)} />
          <Stat label="studied" value={formatMinutes(progress.minutesDone)} />
        </dl>
        <ActivityHeatmap events={events} />
        <div>
          <Button size="sm" variant="ghost" aria-expanded={details} onClick={() => setDetails((d) => !d)} rightIcon={<ChevronDown className={cn('transition-transform duration-fast', details && 'rotate-180')} />}>
            {details ? 'Hide details' : 'Details by area and module'}
          </Button>
        </div>
        {details && <ProgressDetails model={progress} />}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse px-4 py-3">
      <dt className="truncate text-caption text-fg-subtle">{label}</dt>
      <dd className="text-title font-strong text-fg">{value}</dd>
    </div>
  );
}

/** The 7 days of a plan week: session title and state, rest and reserve days. */
function WeekStrip({ week, schedule, today, onOpenDay }: { week: PathWeek; schedule: Schedule; today: string; onOpenDay: (date: string) => void }) {
  const byDate = new Map(week.days.map((d) => [d.date, d]));
  const kinds = new Map(schedule.days.map((d) => [d.date, d.kind]));
  const dates: string[] = [];
  for (let d = week.start; d <= week.end; d = addDays(d, 1)) dates.push(d);
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" aria-label={`Week ${week.number} sessions`}>
      {dates.map((date) => {
        const day = byDate.get(date);
        const isToday = date === today;
        const label = day ? day.title : kinds.get(date) === 'buffer' ? 'Reserve day' : 'Rest';
        return (
          <li key={date}>
            <button
              type="button"
              disabled={!day}
              onClick={() => onOpenDay(date)}
              aria-label={`${formatDay(date)}: ${label}${day?.state === 'done' ? ', done' : isToday ? ', today' : ''}`}
              className={cn(
                'flex h-full w-full flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors duration-fast',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                isToday ? 'border-accent bg-accent-subtle/40' : 'border-line bg-surface',
                day ? 'hover:bg-surface-hover' : 'cursor-default opacity-70'
              )}
            >
              <span className="flex w-full items-center gap-1 text-caption font-strong text-fg-subtle">
                {WEEKDAY[dayOfWeek(date)]} {Number(date.slice(8))}
                {day?.state === 'done' && <Check className="ml-auto size-3.5 text-success-fg" aria-hidden="true" />}
                {isToday && day?.state !== 'done' && <span className="ml-auto size-2 rounded-full bg-accent" aria-hidden="true" />}
              </span>
              <span className={cn('line-clamp-2 text-body', day ? 'font-strong text-fg' : 'text-fg-subtle')}>{label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function WeekRow({ week: w, today, open, onToggle, onOpenDay }: { week: PathWeek; today: string; open: boolean; onToggle: () => void; onOpenDay: (date: string) => void }) {
  const done = w.days.filter((d) => d.state === 'done').length;
  const complete = done === w.days.length;
  const current = today >= w.start && today <= w.end;
  const id = `plan-week-${w.number}`;
  return (
    <li className={cn('overflow-hidden rounded-lg border bg-surface', current ? 'border-accent/50' : 'border-line')}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
      >
        <span
          aria-hidden="true"
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-full text-caption font-strong',
            complete ? 'bg-success text-canvas' : current ? 'bg-accent text-accent-fg' : 'bg-surface-active text-fg-subtle'
          )}
        >
          {complete ? <Check className="size-4" strokeWidth={3} /> : w.number}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body-lg font-strong text-fg">Week {w.number} · {w.title}</span>
          <span className="block text-caption text-fg-subtle">
            {formatDay(w.start, false)} to {formatDay(w.end, false)} · {done}/{w.days.length} sessions · {formatMinutes(w.minutes)}
          </span>
        </span>
        {complete && <Trophy className="size-4 shrink-0 text-warning" aria-label="Week complete" />}
        <ChevronDown className={cn('size-4 shrink-0 text-fg-subtle transition-transform duration-fast', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <ol id={id} className="divide-y divide-line border-t border-line">
          {w.days.map((d) => (
            <li key={d.date}>
              <button
                type="button"
                onClick={() => onOpenDay(d.date)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
              >
                <DayState day={d} today={today} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body text-fg">{d.title}</span>
                  {d.subtitle && <span className="block truncate text-caption text-fg-subtle">Also: {d.subtitle}</span>}
                </span>
                <span className="shrink-0 text-caption text-fg-subtle">{formatDay(d.date, false)} · {formatMinutes(d.minutes)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

function DayState({ day, today }: { day: PathDay; today: string }) {
  if (day.state === 'done') {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-success text-canvas" aria-label="Done">
        <Check className="size-3" strokeWidth={4} />
      </span>
    );
  }
  if (day.date === today) return <span className="size-5 shrink-0 rounded-full border-[5px] border-accent" aria-label="Today" />;
  return <span className="size-5 shrink-0 rounded-full border-2 border-line-strong" aria-label={day.done ? `${day.done} of ${day.total} done` : 'Not started'} />;
}

function Bar({ value, label }: { value: number; label: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded bg-surface-sunken" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full bg-accent" style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

/** Progress by area (stream) and by module. */
export function ProgressDetails({ model }: { model: ProgressModel }) {
  const { problems } = model;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Card padding="md" className="flex flex-col gap-3">
        <h4 className="text-body font-strong text-fg">By area</h4>
        {model.streams.map((s) => (
          <div key={s.stream} className="flex flex-col gap-1">
            <div className="flex justify-between gap-2 text-body text-fg">
              <span>{streamLabel(s.stream)}</span>
              <span className="text-fg-subtle">{s.percent}% · {formatMinutes(s.minutes_total - s.minutes_done)} left</span>
            </div>
            <Bar value={s.percent} label={`${streamLabel(s.stream)} progress`} />
          </div>
        ))}
        <p className="text-caption text-fg-subtle">
          Problems: easy {problems.byDifficulty.easy.solved}/{problems.byDifficulty.easy.planned} · medium {problems.byDifficulty.medium.solved}/{problems.byDifficulty.medium.planned} · hard {problems.byDifficulty.hard.solved}/{problems.byDifficulty.hard.planned}
        </p>
      </Card>
      <Card padding="md" className="flex flex-col gap-3">
        <h4 className="text-body font-strong text-fg">By module</h4>
        {model.modules.map((m) => (
          <div key={m.module_id} className="flex flex-col gap-1">
            <div className="flex flex-wrap justify-between gap-2 text-body text-fg">
              <span>{moduleById(m.module_id)?.title ?? m.module_id.replace(/^project\./, 'Project: ')}</span>
              <span className="text-fg-subtle">{m.percent}%{m.finish_date ? ` · until ${formatDay(m.finish_date, false)}` : ''}</span>
            </div>
            <Bar value={m.percent} label={`${m.module_id} progress`} />
          </div>
        ))}
      </Card>
    </div>
  );
}

// ── Session sheet ───────────────────────────────────────────────────────────

/** One session opened from the plan: its steps, open or tick them, move them, or start the session now. */
export function SessionSheetBody({
  day,
  session,
  today,
  moveTargets,
  onOpenStep,
  onToggleStep,
  onMoveStep,
  onStartNow,
}: {
  day: PathDay | null;
  session: Session;
  today: string;
  moveTargets: Array<{ value: string; label: string }>;
  onOpenStep: (s: SessionStep) => void;
  onToggleStep: (s: SessionStep, done: boolean) => Promise<void>;
  onMoveStep: (s: SessionStep, to: string) => Promise<void>;
  onStartNow?: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const steps = session.steps.filter((s) => s.kind !== 'review');
  const future = !!day && day.date > today;
  return (
    <div className="flex flex-col gap-4">
      {day && (
        <p className="text-body text-fg-muted">
          {formatMinutes(day.minutes)} · {day.done} of {day.total} done
          {future ? '. You can start early: what you finish counts and the plan moves on.' : ''}
        </p>
      )}
      {future && onStartNow && (
        <div>
          <Button variant="primary" loading={busy} onClick={() => { setBusy(true); void onStartNow().finally(() => setBusy(false)); }}>
            Do this session today
          </Button>
        </div>
      )}
      <ol className="flex flex-col gap-2">
        {steps.map((s) => (
          <li key={s.id} className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3">
            <div className="flex items-start gap-3">
              {isManualStep(s) && (
                <Checkbox className="mt-0.5" checked={s.done} aria-label={`${s.done ? 'Untick' : 'Tick'} ${s.title}`} onCheckedChange={(c) => void onToggleStep(s, c === true)} />
              )}
              <div className="min-w-0 flex-1">
                <div className={cn('text-body', s.done ? 'text-fg-subtle line-through' : 'font-strong text-fg')}>
                  {STEP_LABEL[s.kind]}: {s.title}
                </div>
                <div className="text-caption text-fg-subtle">
                  {formatMinutes(s.minutes)}{stepDetail(s) ? ` · ${stepDetail(s)}` : ''}
                </div>
              </div>
              {s.done && <Badge size="sm" tone="success">Done</Badge>}
              {!isManualStep(s) && (
                <Button size="sm" variant="secondary" onClick={() => onOpenStep(s)}>{s.done ? 'Open' : s.kind === 'lesson' ? 'Study' : 'Open'}</Button>
              )}
            </div>
            {!s.done && moveTargets.length > 0 && day && day.date >= today && (
              <div className="w-56">
                <Select size="sm" placeholder="Move to another day…" options={moveTargets} onValueChange={(to) => void onMoveStep(s, to)} aria-label={`Move ${s.title} to another day`} />
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Settings ────────────────────────────────────────────────────────────────

type PaceChip = keyof typeof PACE_CHIPS;
const chipOf = (f: number): PaceChip | null =>
  (Object.entries(PACE_CHIPS).find(([, v]) => Math.abs(v - f) < 0.01)?.[0] as PaceChip | undefined) ?? null;
const minuteOptions = MINUTE_STEPS.map((m) => ({ value: String(m), label: formatMinutes(m) }));

/** Plan settings: dates and time, task time estimates, change with AI, start over. */
export function PlanSettings({
  intake,
  paceFactor,
  measuredPace,
  adjust,
  onSaveCalendar,
  onPace,
  onNewRoadmap,
}: {
  intake: Intake;
  paceFactor: number;
  measuredPace: number | null;
  /** The "change with AI" panel. */
  adjust: React.ReactNode;
  onSaveCalendar: (change: { end_date: string; weekday_minutes: number; weekend_minutes: number }) => Promise<void>;
  onPace: (factor: number) => Promise<void>;
  onNewRoadmap: () => void;
}) {
  const [end, setEnd] = useState(intake.end_date);
  const [weekday, setWeekday] = useState(intake.weekday_minutes);
  const [weekend, setWeekend] = useState(intake.weekend_minutes);
  const [busy, setBusy] = useState<string | null>(null);
  const changed = end !== intake.end_date || weekday !== intake.weekday_minutes || weekend !== intake.weekend_minutes;
  const endValid = /^\d{4}-\d{2}-\d{2}$/.test(end) && end > intake.start_date;
  const chip = chipOf(paceFactor);
  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    try { await fn(); } finally { setBusy(null); }
  };
  const withCurrent = (v: number) => (minuteOptions.some((o) => o.value === String(v)) ? minuteOptions : [{ value: String(v), label: formatMinutes(v) }, ...minuteOptions]);

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="settings-time" className="flex flex-col gap-3">
        <h3 id="settings-time" className="text-heading font-strong text-fg">Dates and time</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="End date" error={endValid ? undefined : 'Pick a date after the start.'}>
            <Input type="date" value={end} min={addDays(intake.start_date, 1)} onChange={(e) => setEnd(e.target.value)} />
          </Field>
          <Field label="On a weekday">
            <Select options={withCurrent(intake.weekday_minutes)} value={String(weekday)} onValueChange={(v) => setWeekday(Number(v))} />
          </Field>
          <Field label="On a weekend day">
            <Select options={withCurrent(intake.weekend_minutes)} value={String(weekend)} onValueChange={(v) => setWeekend(Number(v))} />
          </Field>
        </div>
        <div>
          <Button
            disabled={!changed || !endValid}
            loading={busy === 'calendar'}
            onClick={() => void run('calendar', () => onSaveCalendar({ end_date: end, weekday_minutes: weekday, weekend_minutes: weekend }))}
          >
            Save and re-plan
          </Button>
        </div>
        <p className="text-caption text-fg-subtle">To change your study days, role or goal, start a new roadmap below.</p>
      </section>

      <section aria-labelledby="settings-pace" className="flex flex-col gap-2">
        <h3 id="settings-pace" className="text-heading font-strong text-fg">How long tasks take you</h3>
        <div role="group" aria-label="Task time estimates" className="flex flex-wrap gap-1">
          {(['less', 'planned', 'more'] as const).map((c) => (
            <Button key={c} size="sm" variant={chip === c ? 'primary' : 'secondary'} aria-pressed={chip === c} loading={busy === `pace-${c}`} onClick={() => void run(`pace-${c}`, () => onPace(PACE_CHIPS[c]))}>
              {c === 'less' ? 'Less than planned' : c === 'planned' ? 'As planned' : 'More than planned'}
            </Button>
          ))}
        </div>
        {!chip && <span className="text-caption text-fg-subtle">Current estimates: {paceFactor}×</span>}
        {measuredPace != null && Math.abs(measuredPace - paceFactor) >= 0.1 && (
          <div>
            <Button size="sm" variant="ghost" loading={busy === 'measured'} onClick={() => void run('measured', () => onPace(measuredPace))}>
              Use my measured pace ({measuredPace}×)
            </Button>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">{adjust}</section>

      <section aria-labelledby="settings-new" className="flex flex-col items-start gap-2 border-t border-line pt-4">
        <h3 id="settings-new" className="text-heading font-strong text-fg">Start over</h3>
        <p className="text-body text-fg-muted">A new roadmap keeps everything you have done.</p>
        <Button variant="secondary" onClick={onNewRoadmap}>New roadmap</Button>
      </section>
    </div>
  );
}

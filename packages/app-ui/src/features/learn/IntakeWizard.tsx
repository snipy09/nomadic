import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Briefcase,
  CalendarDays,
  Check,
  Cloud,
  Compass,
  GraduationCap,
  Layers,
  Monitor,
  PenTool,
  Repeat,
  Rocket,
  Server,
  Sparkles,
  X,
} from 'lucide-react';
import { Badge, Button, Combobox, Field, IconButton, Input, Textarea, cn } from '@nomadic/ui';
import { addDays, endDateForWeeks, formatDay, type Feasibility, type Stream } from '@job-automator/learning';
import { getApi } from '../../types';
import { ROLES } from './content';
import { INTAKE_STEPS, intakeRecap, intakeStreamLabel, intakeSteps, levelStreams, roleStreams, stepProblem, weeklyMinutes, type IntakeStepId } from './intakeSteps';
import {
  AIM_OPTIONS,
  LANGUAGE_OPTIONS,
  LEVEL_OPTIONS,
  WEEKDAY_CHIPS,
  WEEK_PRESETS,
  formatMinutes,
  type IntakeDraft,
} from './learnModel';

// ── Choice cards ────────────────────────────────────────────────────────────

interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  meta?: string;
}

/**
 * Big selectable cards with radio semantics: one tab stop, arrow keys move the
 * choice (like a native radio group), Enter/Space pick.
 */
export function ChoiceCards<T extends string>({
  label,
  options,
  value,
  onChange,
  columns = 2,
}: {
  label: string;
  options: ChoiceOption<T>[];
  value: T | null;
  onChange: (v: T) => void;
  columns?: 2 | 3 | 4;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = Math.max(0, options.findIndex((o) => o.value === value));
  const move = (i: number) => {
    const next = (i + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('grid gap-3', columns === 2 ? 'sm:grid-cols-2' : columns === 3 ? 'sm:grid-cols-3' : 'grid-cols-2 lg:grid-cols-4')}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={i === current ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); move(i + 1); }
              if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); move(i - 1); }
            }}
            className={cn(
              'group relative flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-[border-color,background-color,box-shadow,transform] duration-fast ease-standard',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
              on
                ? 'border-accent bg-accent-subtle shadow-e1'
                : 'border-line bg-surface hover:-translate-y-px hover:border-line-strong hover:shadow-e1'
            )}
          >
            {o.icon && (
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg]:size-5',
                  on ? 'bg-accent text-accent-fg' : 'bg-surface-sunken text-fg-muted group-hover:text-fg'
                )}
              >
                {o.icon}
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className={cn('text-body-lg font-strong', on ? 'text-accent-subtle-fg' : 'text-fg')}>{o.label}</span>
              {o.description && <span className="text-body text-fg-muted">{o.description}</span>}
              {o.meta && <span className="text-caption text-fg-subtle">{o.meta}</span>}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-fast',
                on ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong'
              )}
            >
              {on && <Check className="size-3" strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** A row of pill toggles (several may be on). */
function ToggleChips<T extends string | number>({
  label,
  options,
  isOn,
  onToggle,
  large,
}: {
  label: string;
  options: Array<{ value: T; label: string; title?: string }>;
  isOn: (v: T) => boolean;
  onToggle: (v: T) => void;
  large?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = isOn(o.value);
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={on}
            title={o.title}
            onClick={() => onToggle(o.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-lg border-2 font-strong transition-colors duration-fast',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
              large ? 'h-12 min-w-[3.25rem] px-3 text-body-lg' : 'h-9 px-3 text-body',
              on ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface text-fg-muted hover:border-line-strong hover:text-fg'
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A single-choice segmented row (radio semantics, compact). */
function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = Math.max(0, options.findIndex((o) => o.value === value));
  const move = (i: number) => {
    const next = (i + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-lg bg-surface-sunken p-1">
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={i === current ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(i + 1); }
              if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(i - 1); }
            }}
            className={cn(
              'h-8 rounded-md px-3 text-body font-strong transition-colors duration-fast',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
              on ? 'bg-surface text-fg shadow-e1' : 'text-fg-muted hover:text-fg'
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Pages ───────────────────────────────────────────────────────────────────

const ROLE_ICONS: Record<string, React.ReactNode> = {
  frontend: <Monitor />,
  backend: <Server />,
  fullstack: <Layers />,
  'data-analyst': <BarChart3 />,
  'data-ml': <BrainCircuit />,
  'product-manager': <Compass />,
  design: <PenTool />,
  devops: <Cloud />,
};

const AIM_DETAILS: Record<string, { icon: React.ReactNode; description: string }> = {
  campus: { icon: <GraduationCap />, description: 'On-campus drives: online test, aptitude, technical and HR rounds.' },
  internship: { icon: <Briefcase />, description: 'Summer or semester internships: DSA, projects and one strong stack.' },
  offcampus: { icon: <Rocket />, description: 'Applying on your own: skills, projects and interviews, no aptitude round.' },
  switch: { icon: <Repeat />, description: 'Already working and moving into this role: skills and interviews first.' },
};

const LEVEL_HINT: Record<'dsa' | 'core_cs' | 'dev' | 'aptitude', string> = {
  dsa: 'Arrays, recursion, trees, graphs, dynamic programming',
  core_cs: 'OOP, DBMS, operating systems, computer networks',
  dev: 'The tools and frameworks of your role',
  aptitude: 'Quant, logical reasoning and verbal ability',
};

/** What "Development" means for roles that do not write code. */
const ROLE_DEV_HINT: Partial<Record<string, string>> = {
  'product-manager': 'Product sense, metrics, PRDs, case and guesstimate interviews',
  design: 'Design tools, UX research, visual design and your portfolio',
};

const LANGUAGE_DETAILS: Record<string, string> = {
  cpp: 'Fast and the most common choice for competitive-style problems. STL covers every data structure.',
  java: 'Verbose but clear; Collections and strong typing are liked by interviewers at service companies.',
  python: 'The least code per problem. Great for clarity; watch recursion limits and speed.',
};

const STREAM_DETAILS: Record<Stream, string> = {
  dsa: 'Data structures and algorithms with named LeetCode problems each day.',
  core_cs: 'OOP, DBMS, OS and networks: the theory rounds.',
  dev: 'Your role’s stack, taught day by day, plus build tasks.',
  aptitude: 'Quant, logical and verbal for online tests (campus only).',
  interview: 'Resume, projects, HR and test strategy.',
};

const MINUTE_CHOICES = [30, 45, 60, 90, 120, 150, 180, 240, 300];

interface PageProps {
  step: IntakeStepId;
  draft: IntakeDraft;
  onChange: (next: IntakeDraft) => void;
  /** Paid plans get target-company problem picks. */
  companiesAllowed?: boolean;
  /** False until the user has picked a role (onboarding never guesses one). */
  roleChosen?: boolean;
  onRoleChosen?: () => void;
  steps: IntakeStepId[];
  feasibility?: Feasibility | null;
  onJump?: (step: IntakeStepId) => void;
}

/** One page of the intake: the question's controls only (the shell adds the heading and buttons). */
export function IntakePage({ step, draft, onChange, companiesAllowed = false, roleChosen = true, onRoleChosen, steps, feasibility, onJump }: PageProps) {
  const set = <K extends keyof IntakeDraft>(k: K, v: IntakeDraft[K]) => onChange({ ...draft, [k]: v });

  switch (step) {
    case 'role':
      return (
        <ChoiceCards
          label="Target role"
          columns={2}
          value={roleChosen ? draft.role : null}
          onChange={(v) => { onRoleChosen?.(); set('role', v as IntakeDraft['role']); }}
          options={ROLES.map((r) => ({ value: r.id, label: r.name, description: r.description, icon: ROLE_ICONS[r.id] }))}
        />
      );
    case 'aim':
      return (
        <ChoiceCards
          label="Preparing for"
          value={draft.aim}
          onChange={(v) => set('aim', v)}
          options={AIM_OPTIONS.map((a) => ({ value: a.value, label: a.label, ...AIM_DETAILS[a.value] }))}
        />
      );
    case 'duration':
      return (
        <div className="flex flex-col gap-5">
          <ChoiceCards
            label="Duration"
            columns={4}
            value={String(draft.weeks)}
            onChange={(v) => set('weeks', Number(v))}
            options={[...new Set([...WEEK_PRESETS, draft.weeks])]
              .sort((a, b) => a - b)
              .map((w) => ({
                value: String(w),
                label: w % 4 === 0 && w >= 8 && w < 52 ? `${w / 4} months` : w === 52 ? '1 year' : `${w} weeks`,
                meta: `${w} weeks · ready by ${formatDay(endDateForWeeks(draft.startDate, w), false)}`,
              }))}
          />
          <StartDateField draft={draft} onChange={(d) => set('startDate', d)} />
        </div>
      );
    case 'schedule':
      return <SchedulePage draft={draft} onChange={onChange} />;
    case 'level':
      return (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {levelStreams(draft).map((s) => (
              <li key={s} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-[12rem] flex-1">
                  <div className="text-body-lg font-strong text-fg">{intakeStreamLabel(s, draft.role)}</div>
                  <div className="text-caption text-fg-subtle">{(s === 'dev' && ROLE_DEV_HINT[draft.role]) || LEVEL_HINT[s]}</div>
                </div>
                <Segmented
                  label={`${intakeStreamLabel(s, draft.role)} level`}
                  value={draft.levels[s]}
                  onChange={(v) => set('levels', { ...draft.levels, [s]: v })}
                  options={LEVEL_OPTIONS}
                />
              </li>
            ))}
        </ul>
      );
    case 'language':
      return (
        <ChoiceCards
          label="Language for DSA"
          columns={3}
          value={draft.language}
          onChange={(v) => set('language', v)}
          options={LANGUAGE_OPTIONS.map((l) => ({ value: l.value, label: l.label, description: LANGUAGE_DETAILS[l.value] }))}
        />
      );
    case 'focus':
      return (
        <div role="group" aria-label="What to cover" className="grid gap-3 sm:grid-cols-2">
          {roleStreams(draft.role).map((s) => {
            const on = draft.streams.includes(s);
            const off = s === 'aptitude' && draft.aim !== 'campus';
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => set('streams', on ? draft.streams.filter((x) => x !== s) : [...draft.streams, s])}
                className={cn(
                  'flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors duration-fast',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                  on ? 'border-accent bg-accent-subtle' : 'border-line bg-surface hover:border-line-strong'
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border-2', on ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong')}
                >
                  {on && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-body-lg font-strong text-fg">{intakeStreamLabel(s, draft.role)}</span>
                  <span className="text-body text-fg-muted">{(s === 'dev' && ROLE_DEV_HINT[draft.role]) || STREAM_DETAILS[s]}</span>
                  {off && on && <span className="text-caption text-fg-subtle">Only planned for campus placements.</span>}
                </span>
              </button>
            );
          })}
        </div>
      );
    case 'extras':
      return (
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <h3 className="text-heading font-strong text-fg">Days you cannot study</h3>
            <BlackoutsField draft={draft} onChange={(b) => set('blackouts', b)} />
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="text-heading font-strong text-fg">Target companies</h3>
            <CompaniesField value={draft.companies} onChange={(c) => set('companies', c)} allowed={companiesAllowed} />
          </section>
          <Field label="Anything else the planner should know" hint={`${draft.note.length}/500. For example: "more DP" or "I am weak at graphs".`}>
            <Textarea value={draft.note} maxLength={500} rows={3} onChange={(e) => set('note', e.target.value)} />
          </Field>
        </div>
      );
    case 'summary':
      return (
        <div className="flex flex-col gap-4">
          <dl className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {intakeRecap(draft, steps).map((r) => (
              <div key={r.step} className="flex items-start gap-3 px-4 py-3">
                <dt className="w-28 shrink-0 text-body text-fg-subtle">{r.label}</dt>
                <dd className="min-w-0 flex-1 text-body text-fg">{r.value}</dd>
                {onJump && (
                  <Button size="sm" variant="ghost" onClick={() => onJump(r.step)} aria-label={`Change ${r.label.toLowerCase()}`}>
                    Change
                  </Button>
                )}
              </div>
            ))}
          </dl>
          <FeasibilityBar feasibility={feasibility ?? null} />
        </div>
      );
  }
}

function StartDateField({ draft, onChange }: { draft: IntakeDraft; onChange: (d: string) => void }) {
  const today = useMemo(() => draft.startDate, []); // eslint-disable-line react-hooks/exhaustive-deps
  const choices = [
    { value: today, label: 'Today' },
    { value: addDays(today, 1), label: 'Tomorrow' },
    { value: nextMonday(today), label: 'Next Monday' },
  ];
  const custom = !choices.some((c) => c.value === draft.startDate);
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-label font-strong text-fg-muted">Start</span>
        <Segmented
          label="Start date"
          value={custom ? 'custom' : draft.startDate}
          onChange={(v) => { if (v !== 'custom') onChange(v); }}
          options={[...choices, ...(custom ? [{ value: 'custom', label: formatDay(draft.startDate, false) }] : [])]}
        />
      </div>
      <Field label="Or pick a date" className="w-44">
        <Input type="date" value={draft.startDate} min={today} onChange={(e) => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && e.target.value >= today) onChange(e.target.value); }} />
      </Field>
    </div>
  );
}

function nextMonday(day: string): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, dow === 1 ? 7 : (8 - dow) % 7 || 7);
}

function SchedulePage({ draft, onChange }: { draft: IntakeDraft; onChange: (d: IntakeDraft) => void }) {
  const set = <K extends keyof IntakeDraft>(k: K, v: IntakeDraft[K]) => onChange({ ...draft, [k]: v });
  const weekday = draft.studyDays.some((d) => d >= 1 && d <= 5);
  const weekend = draft.studyDays.some((d) => d === 0 || d === 6);
  const perWeek = weeklyMinutes(draft);
  const minuteOptions = (current: number) =>
    [...new Set([...MINUTE_CHOICES, current])].filter((m) => m > 0).sort((a, b) => a - b).map((m) => ({ value: m, label: formatMinutes(m).replace(' min', 'm').replace(' h', 'h') }));
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h3 className="text-heading font-strong text-fg">Study days</h3>
        <ToggleChips
          large
          label="Study days"
          options={WEEKDAY_CHIPS.map((c) => ({ value: c.day, label: c.label }))}
          isOn={(d) => draft.studyDays.includes(d)}
          onToggle={(d) => set('studyDays', draft.studyDays.includes(d) ? draft.studyDays.filter((x) => x !== d) : [...draft.studyDays, d])}
        />
        <div className="flex flex-wrap gap-2 text-caption">
          <button type="button" className="text-accent hover:underline" onClick={() => set('studyDays', [1, 2, 3, 4, 5, 6, 0])}>Every day</button>
          <span className="text-fg-subtle">·</span>
          <button type="button" className="text-accent hover:underline" onClick={() => set('studyDays', [1, 2, 3, 4, 5])}>Weekdays only</button>
          <span className="text-fg-subtle">·</span>
          <button type="button" className="text-accent hover:underline" onClick={() => set('studyDays', [1, 2, 3, 4, 5, 6])}>Monday to Saturday</button>
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        <div className={cn('flex flex-col gap-2 rounded-xl border border-line bg-surface p-4', !weekday && 'opacity-50')}>
          <h3 className="text-heading font-strong text-fg">On a weekday</h3>
          <Segmented label="Minutes on a weekday" value={draft.weekdayMinutes} onChange={(v) => set('weekdayMinutes', v)} options={minuteOptions(draft.weekdayMinutes)} />
        </div>
        <div className={cn('flex flex-col gap-2 rounded-xl border border-line bg-surface p-4', !weekend && 'opacity-50')}>
          <h3 className="text-heading font-strong text-fg">On a weekend day</h3>
          <Segmented label="Minutes on a weekend day" value={draft.weekendMinutes} onChange={(v) => set('weekendMinutes', v)} options={minuteOptions(draft.weekendMinutes)} />
        </div>
      </section>
      <div className="flex items-center gap-3 rounded-xl bg-accent-subtle px-4 py-3" role="status" aria-live="polite">
        <CalendarDays className="size-5 shrink-0 text-accent" aria-hidden="true" />
        <p className="text-body text-accent-subtle-fg">
          <span className="font-strong">{formatMinutes(perWeek)} a week</span>
          {' · about '}
          {Math.round((perWeek * draft.weeks) / 60)} hours over {draft.weeks} weeks
        </p>
      </div>
    </div>
  );
}

function BlackoutsField({ draft, onChange }: { draft: IntakeDraft; onChange: (dates: string[]) => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const add = () => {
    if (!from) return;
    const end = to && to >= from ? to : from;
    const out = new Set(draft.blackouts);
    for (let d = from; d <= end && out.size < 60; d = addDays(d, 1)) out.add(d);
    onChange([...out].sort());
    setFrom('');
    setTo('');
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="From">
          <Input type="date" value={from} min={draft.startDate} onChange={(e) => setFrom(e.target.value)} aria-label="First day off" />
        </Field>
        <Field label="Until">
          <Input type="date" value={to} min={from || draft.startDate} onChange={(e) => setTo(e.target.value)} aria-label="Last day off" />
        </Field>
        <Button variant="secondary" onClick={add} disabled={!from}>Add days off</Button>
      </div>
      {draft.blackouts.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" aria-label="Days off">
          {draft.blackouts.map((d) => (
            <Badge key={d} size="sm" className="gap-1">
              {formatDay(d)}
              <IconButton size="sm" variant="ghost" label={`Remove ${formatDay(d)}`} icon={<X />} onClick={() => onChange(draft.blackouts.filter((x) => x !== d))} />
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-caption text-fg-subtle">Exams, trips or festivals. The plan skips these days.</p>
      )}
    </div>
  );
}

function CompaniesField({ value, onChange, allowed }: { value: string[]; onChange: (c: string[]) => void; allowed: boolean }) {
  const [companies, setCompanies] = useState<string[]>([]);
  useEffect(() => {
    if (!allowed) return;
    let live = true;
    getApi().practiceGetCatalog?.()
      .then((r) => { if (live && r?.success) setCompanies(r.catalog.companies.map((c) => c.name)); })
      .catch(() => {});
    return () => { live = false; };
  }, [allowed]);
  const options = useMemo(() => companies.filter((c) => !value.includes(c)).map((c) => ({ value: c, label: c })), [companies, value]);
  if (!allowed) {
    return <p className="text-body text-fg-muted">Problems from your target companies' lists are part of the Pro and Max plans.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <Field label="Up to 10 companies">
        <Combobox
          options={options}
          value={null}
          placeholder={companies.length ? 'Search companies' : 'Loading companies…'}
          disabled={value.length >= 10 || !companies.length}
          onChange={(v) => { if (v) onChange([...value, v].slice(0, 10)); }}
        />
      </Field>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((c) => (
            <Badge key={c} size="sm" className="gap-1">
              {c}
              <IconButton size="sm" variant="ghost" label={`Remove ${c}`} icon={<X />} onClick={() => onChange(value.filter((x) => x !== c))} />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Full coverage needs ~210 h; you have ~120 h" with a bar. */
export function FeasibilityBar({ feasibility }: { feasibility: Feasibility | null }) {
  if (!feasibility) return null;
  const { needed, usable_minutes: usable, status } = feasibility;
  const pct = needed.standard > 0 ? Math.min(100, Math.round((usable / needed.standard) * 100)) : 100;
  const tone = status === 'full' ? 'bg-success' : status === 'core' ? 'bg-warning' : 'bg-danger';
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4" role="status" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-body-lg font-strong text-fg">
          {status === 'full' ? 'Everything fits' : status === 'core' ? 'The core fits' : 'Not enough time yet'}
        </span>
        <span className="text-caption text-fg-subtle">
          {Math.round(usable / 60)} h of study time · full coverage needs about {Math.round(needed.standard / 60)} h
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
        <div className={cn('h-full rounded-full transition-[width] duration-slow ease-out', tone)} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-body text-fg-muted">{feasibility.message}</p>
    </div>
  );
}

// ── Shell ───────────────────────────────────────────────────────────────────

interface WizardProps {
  draft: IntakeDraft;
  onChange: (next: IntakeDraft) => void;
  feasibility: Feasibility | null;
  companiesAllowed?: boolean;
  /** Problem with the whole draft (blocks building). */
  problem: string | null;
  title: string;
  submitLabel?: string;
  onSubmit: () => void;
  onCancel?: () => void;
  /** Start on the summary (editing an existing plan). */
  startAtSummary?: boolean;
}

/**
 * Learn's intake: the questions every plan needs, one per page, with a progress
 * rail, Back/Continue and a recap. Optional pages (what to cover, extras) open
 * only from the recap; a change made from the recap returns to it.
 */
export function IntakeWizard({ draft, onChange, feasibility, companiesAllowed, problem, title, submitLabel = 'Build my roadmap', onSubmit, onCancel, startAtSummary }: WizardProps) {
  const steps = intakeSteps('short', draft);
  const all = intakeSteps('full', draft);
  const [index, setIndex] = useState(startAtSummary ? steps.length - 1 : 0);
  const [detour, setDetour] = useState<IntakeStepId | null>(null);
  const [fromSummary, setFromSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  const headingId = useId();
  const safeIndex = Math.min(index, steps.length - 1);
  const step = detour ?? steps[safeIndex];
  const def = INTAKE_STEPS[step];
  const isLast = !detour && safeIndex === steps.length - 1;

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    headingRef.current?.focus();
  }, [safeIndex, detour]);

  const go = (i: number) => {
    setError(null);
    setDetour(null);
    setIndex(Math.max(0, Math.min(steps.length - 1, i)));
  };
  const toSummary = () => {
    setFromSummary(false);
    go(steps.length - 1);
  };
  const jump = (s: IntakeStepId) => {
    setError(null);
    if (steps.includes(s)) {
      setFromSummary(true);
      go(steps.indexOf(s));
    } else setDetour(s);
  };
  const next = () => {
    const p = isLast ? problem : stepProblem(step, draft);
    if (p) { setError(p); return; }
    if (isLast) onSubmit();
    else if (detour || fromSummary) toSummary();
    else go(safeIndex + 1);
  };

  return (
    <section aria-labelledby={headingId} className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="text-caption font-strong uppercase tracking-wide text-accent">{title}</span>
          <span className="ml-auto text-caption text-fg-subtle">Step {safeIndex + 1} of {steps.length}</span>
          {onCancel && <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>}
        </div>
        <ol className="flex gap-1.5" aria-label="Intake steps">
          {steps.map((s, i) => (
            <li key={s} className="flex-1">
              <button
                type="button"
                onClick={() => (i < safeIndex ? go(i) : undefined)}
                disabled={i >= safeIndex}
                aria-current={i === safeIndex ? 'step' : undefined}
                aria-label={`${INTAKE_STEPS[s].label}${i < safeIndex ? ' (done, go back)' : ''}`}
                className={cn(
                  'block h-1.5 w-full rounded-full transition-colors duration-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                  i < safeIndex ? 'bg-accent hover:bg-accent-hover' : i === safeIndex ? 'bg-accent/60' : 'bg-surface-active'
                )}
              />
            </li>
          ))}
        </ol>
      </div>

      <div key={step} className="flex animate-nm-pop-in flex-col gap-5">
        <header className="flex flex-col gap-1">
          <h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-headline font-strong text-fg outline-none">
            {def.title}
          </h2>
          <p className="text-body-lg text-fg-muted">{def.description}</p>
        </header>
        <form
          noValidate
          onSubmit={(e) => { e.preventDefault(); next(); }}
          className="flex flex-col gap-6"
        >
          <IntakePage
            step={step}
            draft={draft}
            onChange={(d) => { setError(null); onChange(d); }}
            companiesAllowed={companiesAllowed}
            steps={all}
            feasibility={feasibility}
            onJump={jump}
          />
          {error && <p role="alert" className="text-body text-danger-fg">{error}</p>}
          <div className="flex items-center gap-2 border-t border-line pt-4">
            {detour || fromSummary ? (
              <Button variant="ghost" leftIcon={<ArrowLeft />} onClick={toSummary}>Back to the summary</Button>
            ) : (
              safeIndex > 0 && <Button variant="ghost" leftIcon={<ArrowLeft />} onClick={() => go(safeIndex - 1)}>Back</Button>
            )}
            <div className="flex-1" />
            <Button type="submit" variant="primary" size="lg" rightIcon={isLast ? <Sparkles /> : <ArrowRight />} disabled={isLast && !!problem}>
              {isLast ? submitLabel : detour || fromSummary ? 'Done' : 'Continue'}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}

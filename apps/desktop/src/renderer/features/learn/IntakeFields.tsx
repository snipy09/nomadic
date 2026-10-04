import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Badge, Button, Checkbox, Combobox, Field, IconButton, Input, Select, Textarea, cn } from '@nomadic/ui';
import { STREAMS, endDateForWeeks, formatDay, type Feasibility, type Stream } from '@job-automator/learning';
import { getApi } from '../../types';
import { ROLES } from './content';
import {
  AIM_OPTIONS,
  LANGUAGE_OPTIONS,
  LEVEL_OPTIONS,
  MINUTE_STEPS,
  WEEKDAY_CHIPS,
  WEEK_PRESETS,
  formatMinutes,
  streamLabel,
  type IntakeDraft,
} from './learnModel';

interface IntakeFieldsProps {
  draft: IntakeDraft;
  onChange: (next: IntakeDraft) => void;
  /** Onboarding shows only goal, time and level; Learn shows everything. */
  compact?: boolean;
  /** Paid plans get target-company problem picks. */
  companiesAllowed?: boolean;
}

const minuteOptions = MINUTE_STEPS.map((m) => ({ value: String(m), label: formatMinutes(m) }));

/** The roadmap intake: goal, time, level and (in Learn) blackouts, streams and targets. */
export function IntakeFields({ draft, onChange, compact = false, companiesAllowed = false }: IntakeFieldsProps) {
  const set = <K extends keyof IntakeDraft>(k: K, v: IntakeDraft[K]) => onChange({ ...draft, [k]: v });
  const toggleDay = (day: number) =>
    set('studyDays', draft.studyDays.includes(day) ? draft.studyDays.filter((d) => d !== day) : [...draft.studyDays, day]);
  const toggleStream = (s: Stream) =>
    set('streams', draft.streams.includes(s) ? draft.streams.filter((x) => x !== s) : [...draft.streams, s]);

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-heading font-strong text-fg">Goal</legend>
        <Field label="Target role">
          <Select
            value={draft.role}
            onValueChange={(v) => set('role', v as IntakeDraft['role'])}
            options={ROLES.map((r) => ({ value: r.id, label: r.name }))}
          />
        </Field>
        <Field label="Preparing for">
          <Select value={draft.aim} onValueChange={(v) => set('aim', v as IntakeDraft['aim'])} options={AIM_OPTIONS} />
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-heading font-strong text-fg">Time</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Duration" hint={`Ends ${formatDay(endDateForWeeks(draft.startDate, draft.weeks), false)}`}>
            <Select
              value={String(draft.weeks)}
              onValueChange={(v) => set('weeks', Number(v))}
              options={[...new Set([...WEEK_PRESETS, draft.weeks])].sort((a, b) => a - b).map((w) => ({ value: String(w), label: `${w} weeks` }))}
            />
          </Field>
          <Field label="Weekday time">
            <Select value={String(draft.weekdayMinutes)} onValueChange={(v) => set('weekdayMinutes', Number(v))} options={minuteOptions} />
          </Field>
          <Field label="Weekend time">
            <Select value={String(draft.weekendMinutes)} onValueChange={(v) => set('weekendMinutes', Number(v))} options={minuteOptions} />
          </Field>
        </div>
        <div role="group" aria-label="Study days" className="flex flex-wrap gap-2">
          {WEEKDAY_CHIPS.map((c) => {
            const on = draft.studyDays.includes(c.day);
            return (
              <button
                key={c.day}
                type="button"
                aria-pressed={on}
                onClick={() => toggleDay(c.day)}
                className={cn(
                  'h-ctl-sm min-w-[3rem] rounded border px-2 text-label focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                  on ? 'border-accent bg-accent-subtle text-accent-subtle-fg' : 'border-line bg-surface text-fg-muted'
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>
        {!compact && <BlackoutsField draft={draft} onChange={(b) => set('blackouts', b)} />}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-heading font-strong text-fg">Your level</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(['dsa', 'core_cs', 'dev', 'aptitude'] as const).map((s) => (
            <Field key={s} label={streamLabel(s)}>
              <Select value={draft.levels[s]} onValueChange={(v) => set('levels', { ...draft.levels, [s]: v as IntakeDraft['levels'][typeof s] })} options={LEVEL_OPTIONS} />
            </Field>
          ))}
        </div>
        <Field label="Language for DSA" className="sm:max-w-xs">
          <Select value={draft.language} onValueChange={(v) => set('language', v as IntakeDraft['language'])} options={LANGUAGE_OPTIONS} />
        </Field>
      </fieldset>

      {!compact && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-heading font-strong text-fg">What to cover</legend>
            <div className="flex flex-wrap gap-4">
              {STREAMS.map((s) => (
                <Checkbox key={s} checked={draft.streams.includes(s)} onCheckedChange={() => toggleStream(s)} label={streamLabel(s)} />
              ))}
            </div>
            <p className="text-caption text-fg-subtle">Aptitude is only planned for campus placements.</p>
          </fieldset>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-heading font-strong text-fg">Targets (optional)</legend>
            <CompaniesField value={draft.companies} onChange={(c) => set('companies', c)} allowed={companiesAllowed} />
            <Field label="Anything else the plan should know" hint={`${draft.note.length}/500. For example: "mid-sems 10 to 17 Nov" or "more DP".`}>
              <Textarea value={draft.note} maxLength={500} rows={2} onChange={(e) => set('note', e.target.value)} />
            </Field>
          </fieldset>
        </>
      )}
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
    for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= end && out.size < 60; d.setUTCDate(d.getUTCDate() + 1)) {
      out.add(d.toISOString().slice(0, 10));
    }
    onChange([...out].sort());
    setFrom('');
    setTo('');
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Days you cannot study (exams, trips)">
          <Input type="date" value={from} min={draft.startDate} onChange={(e) => setFrom(e.target.value)} aria-label="First day off" />
        </Field>
        <Field label="Until">
          <Input type="date" value={to} min={from || draft.startDate} onChange={(e) => setTo(e.target.value)} aria-label="Last day off" />
        </Field>
        <Button variant="secondary" onClick={add} disabled={!from}>Add days off</Button>
      </div>
      {draft.blackouts.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Days off">
          {draft.blackouts.map((d) => (
            <Badge key={d} size="sm" className="gap-1">
              {formatDay(d)}
              <IconButton size="sm" variant="ghost" label={`Remove ${formatDay(d)}`} icon={<X />} onClick={() => onChange(draft.blackouts.filter((x) => x !== d))} />
            </Badge>
          ))}
        </div>
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
    return <p className="text-caption text-fg-subtle">Problems from your target companies' lists are part of the Pro and Max plans.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <Field label="Target companies (up to 10)">
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
    <div className="flex flex-col gap-2 rounded border border-line bg-surface p-3" role="status" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-body font-strong text-fg">
          {status === 'full' ? 'Fits' : status === 'core' ? 'Core fits' : 'Not enough time'}
        </span>
        <span className="text-caption text-fg-subtle">
          {Math.round(usable / 60)} h of study time · full coverage needs about {Math.round(needed.standard / 60)} h
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded bg-surface-sunken" aria-hidden="true">
        <div className={cn('h-full', tone)} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-caption text-fg-muted">{feasibility.message}</p>
    </div>
  );
}

import React, { useMemo } from 'react';
import { Field, RadioGroup } from '@nomadic/ui';
import type { MasteryMap, RoleFamilyId } from '@job-automator/learning';
import { ROLES, skillName } from './content';
import { HORIZON_OPTIONS, PACE_OPTIONS, planFor, planSummary, type Horizon, type Pace } from './learnLogic';

export interface GoalDraft {
  role: RoleFamilyId | '';
  pace: Pace;
  horizon: Horizon;
}

interface GoalFieldsProps {
  value: GoalDraft;
  onChange: (v: GoalDraft) => void;
  roleError?: string;
  idPrefix: string;
}

/** Role family, weekly hours and horizon: the three inputs of the deterministic planner. */
export function GoalFields({ value, onChange, roleError, idPrefix }: GoalFieldsProps) {
  return (
    <div className="flex flex-col gap-5">
      <Field label="Role" id={`${idPrefix}-role`} error={roleError}>
        <RadioGroup
          aria-label="Role"
          className="grid gap-x-4 gap-y-2 sm:grid-cols-2"
          value={value.role}
          onValueChange={(v) => onChange({ ...value, role: v as RoleFamilyId })}
          options={ROLES.map((r) => ({ value: r.id, label: r.name }))}
        />
      </Field>
      <Field label="Time per week">
        <RadioGroup
          aria-label="Time per week"
          variant="cards"
          orientation="horizontal"
          className="grid sm:grid-cols-3"
          value={String(value.pace)}
          onValueChange={(v) => onChange({ ...value, pace: Number(v) as Pace })}
          options={PACE_OPTIONS.map((o) => ({ value: String(o.value), label: o.label, description: o.description }))}
        />
      </Field>
      <Field label="Ready in">
        <RadioGroup
          aria-label="Ready in"
          variant="cards"
          orientation="horizontal"
          className="grid sm:grid-cols-3"
          value={String(value.horizon)}
          onValueChange={(v) => onChange({ ...value, horizon: Number(v) as Horizon })}
          options={HORIZON_OPTIONS.map((o) => ({ value: String(o.value), label: o.label, description: o.description }))}
        />
      </Field>
    </div>
  );
}

/** Live preview of the plan a goal produces (deterministic, instant). */
export function PlanPreview({ draft, mastery, limit = 5 }: { draft: GoalDraft; mastery: MasteryMap; limit?: number }) {
  const plan = useMemo(
    () => (draft.role ? planFor({ track_id: draft.role, horizon_months: draft.horizon, daily_hours: draft.pace }, mastery) : null),
    [draft.role, draft.horizon, draft.pace, mastery],
  );
  if (!plan) {
    return <p className="text-body text-fg-muted">Pick a role to see your roadmap.</p>;
  }
  const shown = plan.skills.slice(0, limit);
  return (
    <section aria-label="Roadmap preview" className="flex flex-col gap-2 rounded-lg border border-line bg-surface-sunken p-4">
      <p className="text-body font-strong text-fg">{planSummary(plan)}</p>
      {plan.skills.length === 0 ? (
        <p className="text-body text-fg-muted">You already know every skill this role needs.</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {shown.map((s, i) => (
            <li key={s.skill_id} className="flex items-baseline gap-2 text-body text-fg">
              <span className="w-5 text-caption text-fg-subtle">{i + 1}.</span>
              <span className="flex-1">{skillName(s.skill_id)}</span>
              <span className="text-caption text-fg-subtle">Week {s.week}</span>
            </li>
          ))}
        </ol>
      )}
      {plan.skills.length > shown.length && (
        <p className="text-caption text-fg-subtle">and {plan.skills.length - shown.length} more</p>
      )}
      {plan.deferred.length > 0 && (
        <p className="text-caption text-fg-muted">
          {plan.deferred.length} more {plan.deferred.length === 1 ? 'skill does' : 'skills do'} not fit this time frame. More hours or a longer horizon adds them.
        </p>
      )}
    </section>
  );
}

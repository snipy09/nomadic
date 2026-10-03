import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card } from '@nomadic/ui';
import { deriveMastery } from '@job-automator/learning';
import type { LearningEventRecord, LearningGoal, LearningGoalInput } from '../../types';
import { GoalFields, PlanPreview, type GoalDraft } from './GoalFields';
import { asEvents, DEFAULT_HORIZON, DEFAULT_PACE } from './learnLogic';
import { isRoleId } from './content';

interface GoalSetupProps {
  goal: LearningGoal | null;
  events: LearningEventRecord[];
  /** Role suggested from the profile when there is no goal yet. */
  suggestedRole?: string;
  onSave: (goal: LearningGoalInput) => Promise<{ ok: boolean; error?: string }>;
  onCancel?: () => void;
}

/** First-run goal setup and "change goal or pace". Progress is kept: it lives in events keyed by skill. */
export function GoalSetup({ goal, events, suggestedRole, onSave, onCancel }: GoalSetupProps) {
  const [draft, setDraft] = useState<GoalDraft>(() => ({
    role: goal && isRoleId(goal.track_id) ? goal.track_id : suggestedRole && isRoleId(suggestedRole) ? suggestedRole : '',
    pace: goal?.daily_hours ?? DEFAULT_PACE,
    horizon: goal?.horizon_months ?? DEFAULT_HORIZON,
  }));
  const [roleError, setRoleError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mastery = useMemo(() => deriveMastery(asEvents(events)), [events]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.role) {
      setRoleError('Choose a role.');
      document.querySelector<HTMLElement>('[role="radiogroup"][aria-label="Role"] [role="radio"]')?.focus();
      return;
    }
    setSaving(true);
    setError(null);
    const res = await onSave({ track_id: draft.role, horizon_months: draft.horizon, daily_hours: draft.pace });
    setSaving(false);
    if (!res.ok) setError(res.error || 'Your goal was not saved. Try again.');
  };

  return (
    <Card padding="lg" className="mx-auto w-full max-w-3xl">
      <form noValidate onSubmit={save} className="flex flex-col gap-5" aria-labelledby="learn-goal-heading">
        <div className="flex flex-col gap-1">
          <h2 id="learn-goal-heading" ref={headingRef} tabIndex={-1} className="text-title font-strong text-fg outline-none">
            {goal ? 'Change your goal' : 'Set your learning goal'}
          </h2>
          <p className="text-body text-fg-muted">
            {goal
              ? 'Skills you have already mastered stay mastered. Your path is re-planned around them.'
              : 'Pick a role and how much time you have. Your path is built from a skill graph and curated free resources.'}
          </p>
        </div>
        <GoalFields value={draft} onChange={(v) => { setDraft(v); if (v.role) setRoleError(undefined); }} roleError={roleError} idPrefix="learn-goal" />
        <PlanPreview draft={draft} mastery={mastery} />
        {error && <p role="alert" className="text-body text-danger-fg">{error}</p>}
        <div className="flex items-center gap-2">
          <Button type="submit" loading={saving} loadingText="Saving…">{goal ? 'Save changes' : 'Create my path'}</Button>
          {onCancel && <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>}
        </div>
      </form>
    </Card>
  );
}

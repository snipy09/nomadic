import React, { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Circle, CircleDot, Lock } from 'lucide-react';
import { Badge, Button, Card, ProgressRing } from '@nomadic/ui';
import { roleReadiness } from '@job-automator/learning';
import type { LearningGoal } from '../../types';
import { bundle, roleById, skillName } from './content';
import { HORIZON_OPTIONS, PACE_OPTIONS, type PathModel, type PathStep, type SkillState } from './learnLogic';

interface PathScreenProps {
  goal: LearningGoal;
  path: PathModel;
  onOpenLesson: (lessonId: string) => void;
  onChangeGoal: () => void;
}

const STATE_LABEL: Record<SkillState, string> = {
  mastered: 'Mastered',
  in_progress: 'In progress',
  available: 'Not started',
  locked: 'Locked',
};

const STATE_TONE = { mastered: 'success', in_progress: 'accent', available: 'neutral', locked: 'neutral' } as const;

function StateIcon({ state }: { state: SkillState }) {
  const cls = 'size-4 shrink-0';
  if (state === 'mastered') return <CheckCircle2 className={`${cls} text-success`} aria-hidden="true" />;
  if (state === 'in_progress') return <CircleDot className={`${cls} text-accent`} aria-hidden="true" />;
  if (state === 'locked') return <Lock className={`${cls} text-fg-subtle`} aria-hidden="true" />;
  return <Circle className={`${cls} text-fg-subtle`} aria-hidden="true" />;
}

/** My Path: the planned skills in study order, grouped by week, with locked / in progress / mastered states. */
export function PathScreen({ goal, path, onOpenLesson, onChangeGoal }: PathScreenProps) {
  const [showDone, setShowDone] = useState(false);
  const readiness = useMemo(() => roleReadiness(bundle, path.role, path.mastery), [path.role, path.mastery]);
  const weeks = useMemo(() => {
    const map = new Map<number, PathStep[]>();
    for (const s of path.steps) map.set(s.week, [...(map.get(s.week) ?? []), s]);
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [path.steps]);

  const total = path.done.length + path.steps.length;
  const mastered = path.done.length;
  const pace = PACE_OPTIONS.find((o) => o.value === goal.daily_hours)?.label ?? '';
  const horizon = HORIZON_OPTIONS.find((o) => o.value === goal.horizon_months)?.label ?? '';

  return (
    <div className="flex flex-col gap-4">
      <Card padding="md" className="flex flex-wrap items-center gap-4">
        <ProgressRing value={readiness.score} size={56} thickness={5} showValue label={`Readiness for ${roleById(path.role)?.name ?? path.role}`} />
        <div className="mr-auto min-w-0">
          <div className="text-body font-strong text-fg">{roleById(path.role)?.name ?? path.role}</div>
          <div className="text-caption text-fg-subtle">
            {mastered} of {total} skills mastered · {pace} · ready in {horizon}
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={onChangeGoal}>Change goal or pace</Button>
      </Card>

      {path.next && path.next.lessonId ? (
        <Card padding="md" className="flex flex-wrap items-center gap-3 border-accent/40">
          <div className="mr-auto min-w-0">
            <div className="text-caption text-fg-subtle">Up next · week {path.next.week}</div>
            <div className="text-body font-strong text-fg">{path.next.name}</div>
            <div className="text-caption text-fg-muted">{path.next.description}</div>
          </div>
          <Button onClick={() => onOpenLesson(path.next!.lessonId!)}>Start lesson</Button>
        </Card>
      ) : path.steps.length === 0 ? (
        <Card padding="md" className="text-body text-fg-muted">
          Every skill in this path is mastered. Change your goal to keep going.
        </Card>
      ) : null}

      {path.deferred.length > 0 && (
        <Card variant="sunken" padding="sm" className="text-caption text-fg-muted">
          {path.deferred.length} more {path.deferred.length === 1 ? 'skill' : 'skills'} ({path.deferred.slice(0, 3).map(skillName).join(', ')}
          {path.deferred.length > 3 ? ', …' : ''}) {path.deferred.length === 1 ? 'does' : 'do'} not fit in {horizon} at {pace}. Choose more hours or a longer horizon to add them.
        </Card>
      )}

      <section aria-labelledby="learn-path-heading" className="flex flex-col gap-3">
        <h2 id="learn-path-heading" className="text-heading font-strong text-fg">Your path</h2>
        {weeks.map(([week, steps]) => (
          <div key={week} className="flex flex-col gap-1.5">
            <h3 className="text-caption font-strong uppercase tracking-wide text-fg-subtle">Week {week}</h3>
            <ul className="flex flex-col gap-1.5" aria-label={`Week ${week}`}>
              {steps.map((s) => <PathRow key={s.skillId} step={s} onOpen={onOpenLesson} />)}
            </ul>
          </div>
        ))}
      </section>

      {path.done.length > 0 && (
        <section className="flex flex-col gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            aria-expanded={showDone}
            aria-controls="learn-path-done"
            leftIcon={showDone ? <ChevronDown /> : <ChevronRight />}
            onClick={() => setShowDone((v) => !v)}
          >
            Already mastered ({path.done.length})
          </Button>
          {showDone && (
            <ul id="learn-path-done" className="flex flex-col gap-1.5" aria-label="Already mastered">
              {path.done.map((s) => <PathRow key={s.skillId} step={s} onOpen={onOpenLesson} />)}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function PathRow({ step, onOpen }: { step: PathStep; onOpen: (lessonId: string) => void }) {
  const locked = step.state === 'locked';
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
      <StateIcon state={step.state} />
      <div className="mr-auto min-w-0">
        <div className={`text-body ${locked ? 'text-fg-muted' : 'text-fg'}`}>{step.name}</div>
        <div className="text-caption text-fg-subtle">
          Level {step.level}
          {step.hours > 0 ? ` · about ${step.hours} h` : ''}
          {step.prerequisiteOnly ? ' · foundation' : ''}
          {locked && step.blockedBy.length > 0 ? ` · finish ${step.blockedBy.map(skillName).join(', ')} first` : ''}
        </div>
      </div>
      <Badge tone={STATE_TONE[step.state]} size="sm">{STATE_LABEL[step.state]}</Badge>
      {step.lessonId && (
        <Button
          size="sm"
          variant={step.state === 'mastered' ? 'ghost' : 'secondary'}
          aria-label={`${step.state === 'mastered' ? 'Review' : locked ? 'Preview' : 'Open'} ${step.name}`}
          onClick={() => onOpen(step.lessonId!)}
        >
          {step.state === 'mastered' ? 'Review' : locked ? 'Preview' : 'Open'}
        </Button>
      )}
    </li>
  );
}

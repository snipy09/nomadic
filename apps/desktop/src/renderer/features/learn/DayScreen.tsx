import React from 'react';
import { CalendarClock } from 'lucide-react';
import { EmptyState, useToast } from '@nomadic/ui';
import { formatDay, type PathDay, type PlanTask, type Schedule } from '@job-automator/learning';
import { DayTaskList } from './DayTaskList';
import { entryViews, type EntryView, type Progress } from './learnModel';
import { DayHeader, useTaskOpener } from './TodayScreen';

interface DayScreenProps {
  date: string;
  today: string;
  schedule: Schedule;
  progress: Progress;
  pathDay: PathDay | null;
  onBack: () => void;
  onToggle: (view: EntryView, done: boolean, durationS: number) => Promise<{ ok: boolean; error?: string }>;
  onOpenTask: (task: PlanTask) => void;
  onMove: (key: string, toDate: string) => Promise<void>;
}

/** Any day of the path: its tasks with what to learn; work can be ticked early or late, or moved to another day. */
export function DayScreen({ date, today, schedule, progress, pathDay, onBack, onToggle, onOpenTask, onMove }: DayScreenProps) {
  const { toast } = useToast();
  const { open, spent } = useTaskOpener(onOpenTask);
  const day = schedule.days.find((d) => d.date === date) ?? null;
  const views = entryViews(day, progress);
  const done = views.filter((v) => v.done).length;
  const minutes = views.reduce((n, v) => n + v.entry.minutes, 0);
  const targets = schedule.days
    .filter((d) => d.date >= today && d.capacity > 0 && d.date !== date)
    .slice(0, 60)
    .map((d) => ({ value: d.date, label: formatDay(d.date) }));

  return (
    <div className="flex flex-col gap-5">
      <DayHeader day={pathDay} date={date} minutes={minutes} done={done} total={views.length} onBack={onBack} />
      {date > today && views.length > 0 && (
        <p className="text-body text-fg-muted">This day is coming up. You can start early: ticked tasks count as done and the plan moves on.</p>
      )}
      {views.length === 0 ? (
        <EmptyState size="sm" bordered icon={<CalendarClock />} title="Nothing planned on this day" description="Rest, or open today's plan to keep going." />
      ) : (
        <DayTaskList
          views={views}
          readOnly={date !== today}
          onToggle={async (v, d) => {
            const res = await onToggle(v, d, d ? spent(v) : 0);
            if (!res.ok) toast({ title: 'Not saved', description: res.error, tone: 'danger' });
          }}
          onOpen={open}
          moveTargets={date >= today ? targets : undefined}
          onMove={(v, to) => void onMove(v.key, to)}
        />
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge, Button, Card, Select } from '@nomadic/ui';
import { addDays, formatDay, type Schedule } from '@job-automator/learning';
import { KIND_LABEL, entryViews, formatMinutes, weekDates, weekStart, type Progress } from './learnModel';

interface WeekScreenProps {
  schedule: Schedule;
  progress: Progress;
  today: string;
  onMove: (key: string, toDate: string) => Promise<void>;
}

const KIND_BADGE: Record<string, string> = { buffer: 'Buffer', revision: 'Revision', mock: 'Mock test', off: 'Off' };

/** Week: seven days with their tasks and minutes; "Move to…" per task (keyboard friendly). */
export function WeekScreen({ schedule, progress, today, onMove }: WeekScreenProps) {
  const [anchor, setAnchor] = useState(() => (today < schedule.start_date ? schedule.start_date : today > schedule.end_date ? schedule.end_date : today));
  const dates = weekDates(anchor);
  const byDate = new Map(schedule.days.map((d) => [d.date, d]));
  const targets = schedule.days.filter((d) => d.date >= today && d.capacity > 0).map((d) => ({ value: d.date, label: formatDay(d.date) }));
  const canPrev = weekStart(anchor) > schedule.start_date;
  const canNext = addDays(weekStart(anchor), 7) <= schedule.end_date;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" leftIcon={<ChevronLeft />} disabled={!canPrev} onClick={() => setAnchor(addDays(anchor, -7))}>Previous week</Button>
        <span className="mx-auto text-body font-strong text-fg">{formatDay(dates[0], false)} to {formatDay(dates[6], false)}</span>
        <Button size="sm" variant="secondary" rightIcon={<ChevronRight />} disabled={!canNext} onClick={() => setAnchor(addDays(anchor, 7))}>Next week</Button>
      </div>
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-7">
        {dates.map((date) => {
          const day = byDate.get(date);
          const views = entryViews(day, progress);
          const minutes = views.reduce((n, v) => n + v.entry.minutes, 0);
          return (
            <Card key={date} padding="sm" className={date === today ? 'border-accent' : undefined} aria-label={formatDay(date)}>
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-auto text-body font-strong text-fg">{formatDay(date)}</span>
                {day && KIND_BADGE[day.kind] && <Badge size="sm">{KIND_BADGE[day.kind]}</Badge>}
              </div>
              <div className="mb-2 text-caption text-fg-subtle">{day ? (day.capacity ? `${formatMinutes(minutes)} of ${formatMinutes(day.capacity)}` : 'No study') : 'Outside the plan'}</div>
              <ul className="flex flex-col gap-2">
                {views.map((v) => (
                  <li key={v.key} className="flex flex-col gap-1 rounded border border-line p-2">
                    <span className={v.done ? 'text-caption text-fg-subtle line-through' : 'text-caption text-fg'}>
                      <span className="font-strong">{KIND_LABEL[v.task.kind]}</span> {v.task.title} · {formatMinutes(v.entry.minutes)}
                    </span>
                    {!v.done && date >= today && targets.length > 1 && (
                      <Select
                        size="sm"
                        placeholder="Move to…"
                        options={targets.filter((t) => t.value !== date)}
                        onValueChange={(to) => void onMove(v.key, to)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

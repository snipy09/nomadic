import React, { useMemo } from 'react';
import { Flame } from 'lucide-react';
import { cn } from '@nomadic/ui';
import type { LearningEvent } from '@job-automator/learning';
import { buildHeatGrid, cellLabel, type HeatCell } from './heatmapLogic';
import { tzOffsetMinutes } from './learnLogic';

const LEVEL_CLASS: Record<HeatCell['level'], string> = {
  0: 'bg-surface-sunken',
  1: 'bg-accent/25',
  2: 'bg-accent/50',
  3: 'bg-accent/75',
  4: 'bg-accent',
};

const DAYS = ['Mon', '', 'Wed', '', 'Fri', '', ''];

/** GitHub-style grid of study days over the last 26 weeks. */
export function ActivityHeatmap({ events, now, streak }: { events: LearningEvent[]; now?: Date; streak?: { current: number; longest: number } }) {
  const grid = useMemo(() => {
    const at = now ?? new Date();
    return buildHeatGrid(events, at, tzOffsetMinutes(at));
  }, [events, now]);
  return (
    <section aria-labelledby="learn-activity" className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id="learn-activity" className="mr-auto text-heading font-strong text-fg">Activity</h2>
        {streak && (
          <span className="flex items-center gap-1 text-caption text-fg-muted">
            <Flame className="size-3.5 text-warning" aria-hidden="true" />
            {streak.current}-day streak · best {streak.longest}
          </span>
        )}
        <span className="text-caption text-fg-muted">{grid.activeDays} active days in 6 months</span>
        {grid.totalMinutes > 0 && <span className="text-caption text-fg-muted">{grid.totalMinutes} min studied</span>}
      </div>
      <div className="overflow-x-auto">
        <div className="inline-flex gap-1">
          <div className="mr-1 grid grid-rows-[12px_repeat(7,12px)] gap-1 text-[10px] leading-3 text-fg-subtle" aria-hidden="true">
            <span />
            {DAYS.map((d, i) => <span key={i}>{d}</span>)}
          </div>
          {grid.weeks.map((week, w) => (
            <div key={week[0].day} className="grid grid-rows-[12px_repeat(7,12px)] gap-1">
              <span className="whitespace-nowrap text-[10px] leading-3 text-fg-subtle" aria-hidden="true">{grid.months[w] ?? ''}</span>
              {week.map((c) => (
                <span
                  key={c.day}
                  role="img"
                  aria-label={cellLabel(c)}
                  title={cellLabel(c)}
                  className={cn('size-3 rounded-sm', c.future ? 'bg-transparent' : LEVEL_CLASS[c.level])}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-fg-subtle" aria-hidden="true">
        Less
        {([0, 1, 2, 3, 4] as const).map((l) => <span key={l} className={cn('size-3 rounded-sm', LEVEL_CLASS[l])} />)}
        More
      </div>
    </section>
  );
}

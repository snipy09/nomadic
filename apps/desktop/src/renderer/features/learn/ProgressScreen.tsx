import React from 'react';
import { Card } from '@nomadic/ui';
import { formatDay, type Forecast } from '@job-automator/learning';
import { moduleById } from './catalog';
import { formatMinutes, streamLabel, type ProgressModel } from './learnModel';

interface ProgressScreenProps {
  model: ProgressModel;
  forecast: Forecast;
}

function Bar({ value, label }: { value: number; label: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded bg-surface-sunken" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full bg-accent" style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

/** Progress: readiness by stream and module, problems by difficulty, hours against the plan, forecast. */
export function ProgressScreen({ model, forecast }: ProgressScreenProps) {
  const { problems } = model;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card padding="md">
          <div className="text-caption text-fg-subtle">Time</div>
          <div className="text-title font-strong text-fg">{formatMinutes(model.minutesDone)}</div>
          <div className="text-caption text-fg-subtle">of {formatMinutes(model.minutesPlannedToDate)} planned so far</div>
        </Card>
        <Card padding="md">
          <div className="text-caption text-fg-subtle">Problems solved</div>
          <div className="text-title font-strong text-fg">{problems.solved} / {problems.planned}</div>
          <div className="text-caption text-fg-subtle">
            Easy {problems.byDifficulty.easy.solved}/{problems.byDifficulty.easy.planned} · Medium {problems.byDifficulty.medium.solved}/{problems.byDifficulty.medium.planned} · Hard {problems.byDifficulty.hard.solved}/{problems.byDifficulty.hard.planned}
          </div>
        </Card>
        <Card padding="md">
          <div className="text-caption text-fg-subtle">Forecast</div>
          <div className="text-title font-strong text-fg">{forecast.status === 'behind' ? 'Behind' : forecast.status === 'ahead' ? 'Ahead' : 'On track'}</div>
          <div className="text-caption text-fg-subtle">
            {forecast.projected_finish ? `Finish around ${formatDay(forecast.projected_finish)}` : 'Nothing planned'}
            {forecast.behind_minutes > 0 ? ` · ${formatMinutes(forecast.behind_minutes)} to catch up` : ''}
          </div>
        </Card>
      </div>

      <section aria-labelledby="progress-streams" className="flex flex-col gap-2">
        <h3 id="progress-streams" className="text-heading font-strong text-fg">By stream</h3>
        <Card padding="md" className="flex flex-col gap-3">
          {model.streams.map((s) => (
            <div key={s.stream} className="flex flex-col gap-1">
              <div className="flex justify-between text-body text-fg">
                <span>{streamLabel(s.stream)}</span>
                <span className="text-fg-subtle">{s.percent}% · {formatMinutes(s.minutes_total - s.minutes_done)} left</span>
              </div>
              <Bar value={s.percent} label={`${streamLabel(s.stream)} progress`} />
            </div>
          ))}
        </Card>
      </section>

      <section aria-labelledby="progress-modules" className="flex flex-col gap-2">
        <h3 id="progress-modules" className="text-heading font-strong text-fg">By module</h3>
        <Card padding="md" className="flex flex-col gap-3">
          {model.modules.map((m) => (
            <div key={m.module_id} className="flex flex-col gap-1">
              <div className="flex flex-wrap justify-between gap-2 text-body text-fg">
                <span>{moduleById(m.module_id)?.title ?? m.module_id.replace(/^project\./, 'Project: ')}</span>
                <span className="text-fg-subtle">{m.percent}%{m.finish_date ? ` · planned to finish ${formatDay(m.finish_date)}` : ''}</span>
              </div>
              <Bar value={m.percent} label={`${m.module_id} progress`} />
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}

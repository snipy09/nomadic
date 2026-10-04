import React, { useMemo, useState } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { Badge, Button, Card, cn } from '@nomadic/ui';
import { STREAMS, formatDay, type PlanTask, type Roadmap, type Schedule, type Stream } from '@job-automator/learning';
import { learnIndex } from './catalog';
import { KIND_LABEL, formatMinutes, roadmapTree, streamLabel, type Progress } from './learnModel';

interface RoadmapScreenProps {
  roadmap: Roadmap;
  schedule: Schedule;
  progress: Progress;
  onOpenTopic: (topicId: string) => void;
  onOpenTask: (task: PlanTask) => void;
  adjust: React.ReactNode;
  onNewRoadmap: () => void;
}

/** Roadmap tree: module → topic → task with progress, hours left and expected finish per module. */
export function RoadmapScreen({ roadmap, schedule, progress, onOpenTopic, onOpenTask, adjust, onNewRoadmap }: RoadmapScreenProps) {
  const [stream, setStream] = useState<Stream | 'all'>('all');
  const tree = useMemo(() => roadmapTree(roadmap, schedule, progress, learnIndex()), [roadmap, schedule, progress]);
  const streams = STREAMS.filter((s) => tree.some((m) => m.stream === s));
  const shown = tree.filter((m) => stream === 'all' || m.stream === stream);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filter by stream" className="mr-auto flex flex-wrap gap-1">
          {(['all', ...streams] as const).map((s) => (
            <Button key={s} size="sm" variant={stream === s ? 'primary' : 'secondary'} aria-pressed={stream === s} onClick={() => setStream(s)}>
              {s === 'all' ? 'All' : streamLabel(s)}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={onNewRoadmap}>New roadmap</Button>
      </div>

      <ol className="flex flex-col gap-2">
        {shown.map((m) => {
          const pct = m.progress?.percent ?? 0;
          const left = m.progress ? m.progress.minutes_total - m.progress.minutes_done : 0;
          return (
            <li key={m.id}>
              <Card padding="none">
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-body font-strong text-fg">{m.title}</span>
                        <Badge size="sm">{streamLabel(m.stream)}</Badge>
                        <Badge size="sm" tone="neutral">{m.emphasis}</Badge>
                        {m.custom && <Badge size="sm" tone="warning">AI-generated, not reviewed</Badge>}
                      </div>
                      <div className="text-caption text-fg-subtle">
                        {pct}% done · {formatMinutes(left)} left{m.progress?.finish_date ? ` · finishes ${formatDay(m.progress.finish_date)}` : ''}
                        {m.why ? ` · ${m.why}` : ''}
                      </div>
                    </div>
                    <div className="h-2 w-32 overflow-hidden rounded bg-surface-sunken" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${m.title} progress`}>
                      <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                  </summary>
                  <div className="flex flex-col gap-3 border-t border-line px-3 py-3">
                    {m.topics.map((t) => (
                      <div key={t.id} className="flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="mr-auto text-body font-strong text-fg">{t.title}</span>
                          <span className="text-caption text-fg-subtle">{t.done}/{t.total}</span>
                          {!m.custom && <Button size="sm" variant="ghost" onClick={() => onOpenTopic(t.id)}>Open topic</Button>}
                        </div>
                        <ul className="flex flex-col gap-0.5">
                          {t.tasks.map((n) => <TaskRow key={n.task.id} node={n} />)}
                        </ul>
                      </div>
                    ))}
                    {m.extra.length > 0 && (
                      <ul className="flex flex-col gap-0.5">
                        {m.extra.map((n) => (
                          <TaskRow key={n.task.id} node={n} onOpen={n.task.project_id ? () => onOpenTask(n.task) : undefined} />
                        ))}
                      </ul>
                    )}
                    {m.topics.length === 0 && m.extra.length === 0 && <p className="text-body text-fg-muted">Nothing planned in this module at this depth.</p>}
                  </div>
                </details>
              </Card>
            </li>
          );
        })}
      </ol>
      {adjust}
    </div>
  );
}

function TaskRow({ node, onOpen }: { node: { task: PlanTask; done: boolean; date: string | null }; onOpen?: () => void }) {
  const Icon = node.done ? CheckCircle2 : Circle;
  return (
    <li className="flex flex-wrap items-center gap-2 text-caption">
      <Icon className={cn('size-3.5 shrink-0', node.done ? 'text-success' : 'text-fg-subtle')} aria-label={node.done ? 'Done' : 'Not done'} />
      <span className={cn('mr-auto', node.done ? 'text-fg-subtle line-through' : 'text-fg')}>
        <span className="font-strong">{KIND_LABEL[node.task.kind]}</span> {node.task.title}
        {node.task.optional ? ' (optional)' : ''}
      </span>
      <span className="text-fg-subtle">{formatMinutes(node.task.minutes)}{node.date ? ` · ${formatDay(node.date)}` : ' · not scheduled'}</span>
      {onOpen && <Button size="sm" variant="ghost" onClick={onOpen}>Open</Button>}
    </li>
  );
}

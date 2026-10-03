import React, { useState } from 'react';
import { Badge, cn } from '@nomadic/ui';
import type { Application } from '../../types';
import { STAGES, type StageId } from './applicationsLogic';
import { ApplicationCard } from './ApplicationCard';

interface ApplicationsBoardProps {
  groups: Record<StageId, Application[]>;
  /** Columns to show (all, or the one picked in the stage filter). */
  stages: StageId[];
  onOpen: (app: Application) => void;
  onMove: (app: Application, status: string) => void;
}

/** Kanban by stage. Each card has a "Move to" select; drag and drop is an extra. */
export function ApplicationsBoard({ groups, stages, onOpen, onMove }: ApplicationsBoardProps) {
  const [dropTarget, setDropTarget] = useState<StageId | null>(null);
  const byId = (id: string) => Object.values(groups).flat().find((a) => String(a.id) === id);

  return (
    <div className="flex gap-3 overflow-x-auto pb-2" role="list" aria-label="Application stages">
      {STAGES.filter((s) => stages.includes(s.id)).map((stage) => {
        const items = groups[stage.id];
        const canDrop = stage.dropStatus !== null;
        return (
          <section
            key={stage.id}
            role="listitem"
            aria-labelledby={`stage-${stage.id}`}
            className={cn(
              'flex w-64 min-w-64 shrink-0 flex-col gap-2 rounded-lg border border-line bg-surface-sunken p-2',
              dropTarget === stage.id && 'border-accent',
            )}
            onDragOver={canDrop ? (e) => { e.preventDefault(); setDropTarget(stage.id); } : undefined}
            onDragLeave={canDrop ? () => setDropTarget((t) => (t === stage.id ? null : t)) : undefined}
            onDrop={canDrop ? (e) => {
              e.preventDefault();
              setDropTarget(null);
              const app = byId(e.dataTransfer.getData('text/x-application-id'));
              if (app && stage.dropStatus) onMove(app, stage.dropStatus);
            } : undefined}
          >
            <header className="flex items-center gap-2 px-1 pt-1">
              <h3 id={`stage-${stage.id}`} className="text-label font-strong text-fg">{stage.label}</h3>
              <Badge size="sm" tone="neutral" aria-label={`${items.length} applications`}>{items.length}</Badge>
            </header>
            {items.length === 0 ? (
              <p className="px-1 pb-2 text-caption text-fg-subtle">{stage.empty}</p>
            ) : (
              <ul className="flex flex-col gap-2" aria-label={`${stage.label} applications`}>
                {items.map((app) => (
                  <li key={app.id ?? app.apply_url}>
                    <ApplicationCard app={app} onOpen={() => onOpen(app)} onMove={(s) => onMove(app, s)} draggable />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

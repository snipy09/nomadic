import React from 'react';
import { BellRing, Building2, CalendarDays, StickyNote } from 'lucide-react';
import { Badge, Card, Select, cn } from '@nomadic/ui';
import type { Application } from '../../types';
import { MOVE_OPTIONS, followUpLabel, followUpState, formatDate, isUserStatus, modeLabel, stageOf, statusMeta, STAGES } from './applicationsLogic';

export function StatusBadge({ status }: { status: string }) {
  const meta = statusMeta(status);
  return <Badge size="sm" tone={meta.tone} dot>{meta.label}</Badge>;
}

interface MoveSelectProps {
  app: Application;
  onMove: (status: string) => void;
  size?: 'sm' | 'md';
  className?: string;
}

/** Keyboard-accessible status change (the non-drag way to move a card). */
export function MoveSelect({ app, onMove, size = 'sm', className }: MoveSelectProps) {
  return (
    <Select
      size={size}
      aria-label={`Move ${app.title} at ${app.company}`}
      placeholder="Move to…"
      value={isUserStatus(app.status) ? app.status : ''}
      onValueChange={(v) => { if (v && v !== app.status) onMove(v); }}
      options={MOVE_OPTIONS}
      className={className}
    />
  );
}

/** Shown when a follow-up date is set and the application is not closed. */
export function FollowUpBadge({ app }: { app: Application }) {
  const state = followUpState(app);
  const label = followUpLabel(app);
  if (!state || !label) return null;
  return (
    <div>
      <Badge size="sm" tone={state === 'overdue' ? 'danger' : state === 'today' ? 'warning' : 'neutral'}>
        <BellRing className="mr-1 inline size-3" aria-hidden="true" />{label}
      </Badge>
    </div>
  );
}

interface ApplicationCardProps {
  app: Application;
  onOpen: () => void;
  onMove: (status: string) => void;
  /** Native drag source for the board (optional; MoveSelect is the accessible path). */
  draggable?: boolean;
}

export const ApplicationCard = React.memo(function ApplicationCard({ app, onOpen, onMove, draggable }: ApplicationCardProps) {
  const meta = statusMeta(app.status);
  const stageLabel = STAGES.find((s) => s.id === stageOf(app.status))?.label;
  return (
    <Card
      padding="sm"
      className={cn('flex flex-col gap-2', draggable && 'cursor-grab active:cursor-grabbing')}
      draggable={draggable}
      onDragStart={draggable ? (e) => { e.dataTransfer.setData('text/x-application-id', String(app.id)); e.dataTransfer.effectAllowed = 'move'; } : undefined}
    >
      <button type="button" onClick={onOpen} className="block w-full rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <h4 className="line-clamp-2 text-body font-strong text-fg">{app.title}</h4>
        <p className="mt-0.5 flex items-center gap-1 truncate text-caption text-fg-muted">
          <Building2 className="size-3.5 shrink-0" aria-hidden="true" />{app.company}
        </p>
      </button>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-fg-subtle">
        <span className="flex items-center gap-1"><CalendarDays className="size-3.5" aria-hidden="true" />{formatDate(app.applied_at)}</span>
        {app.notes?.trim() && <span className="flex items-center gap-1"><StickyNote className="size-3.5" aria-hidden="true" />Notes</span>}
        <span>{modeLabel(app.mode)}</span>
      </div>
      {meta.label !== stageLabel && <div><StatusBadge status={app.status} /></div>}
      <FollowUpBadge app={app} />
      <MoveSelect app={app} onMove={onMove} className="w-full" />
    </Card>
  );
});

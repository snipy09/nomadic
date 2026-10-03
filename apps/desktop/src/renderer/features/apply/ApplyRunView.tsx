import React, { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { Button, Drawer, DrawerContent, ProgressRing, cn, focusRing } from '@nomadic/ui';
import { ApplicationPanel, StatusBadge } from './ApplicationPanel';
import { canSubmit, countByStatus, finishedCount, reviewedIds, type RunState } from './runModel';

export interface ApplyRunViewProps {
  open: boolean;
  state: RunState;
  onEdit: (url: string, key: string, value: string) => void;
  onApprove: (url: string, approved: boolean) => void;
  onSkip: (url: string, skipped: boolean) => void;
  onRetry: (url: string) => void;
  onSubmit: () => void;
  /** Stop whatever is running (pre-fill or submission) and close. Nothing further is sent. */
  onCancel: () => void;
  /** Close after the run finished. */
  onClose: () => void;
}

function headline(state: RunState): { title: string; description: string } {
  const n = state.apps.length;
  const plural = n === 1 ? 'application' : 'applications';
  switch (state.stage) {
    case 'filling':
      return { title: `Preparing ${n} ${plural}`, description: 'Nomadic is filling each form in the browser window. Nothing is submitted until you review it.' };
    case 'review':
      return { title: 'Review before submitting', description: 'Check every answer, fix anything marked "Needs you", then tick "I reviewed this application" for each one you want to send.' };
    case 'submitting':
      return { title: 'Submitting reviewed applications', description: 'Only the applications you reviewed are being sent.' };
    default:
      return { title: 'Apply run finished', description: 'Here is what happened to each application.' };
  }
}

/** Live apply run: per-application progress, review with inline edits, and submit of the reviewed subset only. */
export function ApplyRunView({ open, state, onEdit, onApprove, onSkip, onRetry, onSubmit, onCancel, onClose }: ApplyRunViewProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const current = state.apps.find((a) => a.url === selected) ?? state.apps[0];
  const { title, description } = headline(state);
  const total = state.apps.length;
  const finished = finishedCount(state);
  const counts = countByStatus(state);
  const reviewed = reviewedIds(state).length;
  const busy = state.stage === 'filling' || state.stage === 'submitting';
  const done = state.stage === 'done';

  useEffect(() => {
    if (selected && !state.apps.some((a) => a.url === selected)) setSelected(null);
  }, [state.apps, selected]);

  // Arrow keys move between applications in the list.
  const onListKey = (e: React.KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const i = state.apps.findIndex((a) => a.url === current?.url);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? total - 1 : Math.max(0, Math.min(total - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
    setSelected(state.apps[next].url);
    listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-app]')[next]?.focus();
  };

  const summary = state.stage === 'filling'
    ? `${finished} of ${total} forms prepared`
    : [
        counts.ready && `${counts.ready} ready`,
        counts.needs_you && `${counts.needs_you} need you`,
        counts.failed && `${counts.failed} failed`,
        counts.skipped && `${counts.skipped} skipped`,
        counts.submitting && `${counts.submitting} submitting`,
        counts.submitted && `${counts.submitted} submitted`,
        counts.not_submitted && `${counts.not_submitted} not submitted`,
      ].filter(Boolean).join(' · ');

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) (done ? onClose : onCancel)(); }}>
      <DrawerContent
        title={title}
        description={description}
        size="xl"
        bodyClassName="p-0"
        headerExtra={
          <div className="flex items-center gap-3">
            <ProgressRing
              value={state.stage === 'filling' ? finished : null}
              max={Math.max(1, total)}
              size={28}
              thickness={3}
              label={state.stage === 'filling' ? 'Forms prepared' : 'Run status'}
              className={cn(!busy && 'hidden')}
            />
            <p className="text-caption text-fg-muted" aria-live="polite">{summary}</p>
          </div>
        }
        footer={
          done ? (
            <Button onClick={onClose}>Close</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={onCancel}>
                {state.stage === 'submitting' ? 'Stop remaining' : 'Cancel'}
              </Button>
              <Button
                leftIcon={<Send />}
                onClick={onSubmit}
                disabled={!canSubmit(state)}
                loading={state.stage === 'submitting'}
              >
                {reviewed ? `Submit ${reviewed} reviewed` : 'Submit reviewed'}
              </Button>
            </>
          )
        }
      >
        <div className="grid h-full min-h-0 grid-cols-[minmax(180px,220px)_1fr]">
          <nav aria-label="Applications in this run" className="min-h-0 overflow-y-auto border-r border-line p-2">
            <div ref={listRef} className="flex flex-col gap-1" onKeyDown={onListKey}>
              {state.apps.map((a) => {
                const active = a.url === current?.url;
                return (
                  <button
                    key={a.url}
                    type="button"
                    data-app
                    aria-current={active ? 'true' : undefined}
                    tabIndex={active ? 0 : -1}
                    onClick={() => setSelected(a.url)}
                    className={cn(
                      'flex flex-col items-start gap-1 rounded-md px-2.5 py-2 text-left',
                      focusRing,
                      active ? 'bg-surface-active' : 'hover:bg-surface-hover',
                    )}
                  >
                    <span className="w-full truncate text-body font-strong text-fg">{a.snapshot?.company || a.target.company || a.target.title || 'Application'}</span>
                    <span className="w-full truncate text-caption text-fg-muted">{a.snapshot?.jobTitle || a.target.title || a.url}</span>
                    <StatusBadge app={a} />
                    {a.approved && !a.skipped && !a.result && <span className="text-caption text-success-fg">Reviewed</span>}
                  </button>
                );
              })}
            </div>
          </nav>
          <div className="min-h-0 overflow-y-auto px-5 py-4">
            {current && (
              <ApplicationPanel
                key={current.url}
                app={current}
                stage={state.stage}
                onEdit={(k, v) => onEdit(current.url, k, v)}
                onApprove={(v) => onApprove(current.url, v)}
                onSkip={(v) => onSkip(current.url, v)}
                onRetry={() => onRetry(current.url)}
              />
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

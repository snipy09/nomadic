import React, { useEffect, useRef, useState } from 'react';
import { Check, Send } from 'lucide-react';
import { Button, Drawer, DrawerContent, ProgressRing, cn, focusRing } from '@nomadic/ui';
import { ApplicationPanel, StatusBadge } from './ApplicationPanel';
import { CompanyLogo } from '../feed/CompanyLogo';
import { canSubmit, countByStatus, finishedCount, focusApp, nextToReview, reviewedIds, runStep, type RunState } from './runModel';

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
  /** Today's remaining applies from the server, e.g. "2 of 3 applications left today". */
  quotaNote?: string;
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
const STEPS = ['Fill forms', 'Review', 'Submit', 'Done'];

function RunStepper({ stage }: { stage: RunState['stage'] }) {
  const at = runStep(stage);
  return (
    <ol aria-label="Apply steps" className="flex items-center gap-2 border-b border-line bg-surface-sunken px-5 py-2.5">
      {STEPS.map((s, i) => {
        const state = i < at || (i === at && at === 3) ? 'done' : i === at ? 'current' : 'todo';
        return (
          <li key={s} aria-current={state === 'current' ? 'step' : undefined} className="flex items-center gap-2">
            <span
              className={cn(
                'flex size-5 items-center justify-center rounded-full text-[11px] font-strong transition-colors duration-normal',
                state === 'done' && 'bg-success-subtle text-success-fg',
                state === 'current' && 'bg-accent text-accent-fg',
                state === 'todo' && 'border border-line-strong text-fg-subtle',
              )}
              aria-hidden="true"
            >
              {state === 'done' ? <Check className="size-3" /> : i + 1}
            </span>
            <span className={cn('text-caption', state === 'current' ? 'font-strong text-fg' : state === 'done' ? 'text-fg-muted' : 'text-fg-subtle')}>{s}</span>
            {i < STEPS.length - 1 && <span className={cn('h-px w-6 sm:w-10', i < at ? 'bg-success' : 'bg-line-strong')} aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

export function ApplyRunView({ open, state, onEdit, onApprove, onSkip, onRetry, onSubmit, onCancel, onClose, quotaNote }: ApplyRunViewProps) {
  // null = follow the run (the form being filled, then the next one to review).
  const [selected, setSelected] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const current = state.apps.find((a) => a.url === selected) ?? focusApp(state);
  const approve = (url: string, approved: boolean) => {
    onApprove(url, approved);
    if (approved) {
      const next = nextToReview(state, url);
      if (next) setSelected(next.url);
    }
  };
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

  // A new stage starts by following the run again.
  useEffect(() => {
    if (state.stage === 'review' || state.stage === 'filling') setSelected(null);
  }, [state.stage]);

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
            <>
              {quotaNote && <span className="mr-auto text-caption text-fg-muted" data-testid="quota-note">{quotaNote}</span>}
              <Button onClick={onClose}>Close</Button>
            </>
          ) : (
            <>
              {quotaNote && <span className="mr-auto text-caption text-fg-muted" data-testid="quota-note">{quotaNote}</span>}
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
        <div className="flex h-full min-h-0 flex-col">
        <RunStepper stage={state.stage} />
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(180px,220px)_1fr]">
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
                    <span className="flex w-full min-w-0 items-center gap-1.5">
                      {(a.snapshot?.company || a.target.company) && <CompanyLogo company={(a.snapshot?.company || a.target.company) as string} url={a.url} size="xs" />}
                      <span className="truncate text-body font-strong text-fg">{a.snapshot?.company || a.target.company || a.target.title || 'Application'}</span>
                    </span>
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
                onApprove={(v) => approve(current.url, v)}
                onSkip={(v) => onSkip(current.url, v)}
                onRetry={() => onRetry(current.url)}
              />
            )}
          </div>
        </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

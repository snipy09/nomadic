import React from 'react';
import { AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react';
import { Badge, Button, Checkbox, Spinner, cn } from '@nomadic/ui';
import { FieldRow } from './FieldRow';
import {
  STATUS_META,
  SOURCE_LABEL,
  appStatus,
  attentionMessage,
  fieldValue,
  needsYouFields,
  type RunApp,
  type RunStage,
} from './runModel';

interface ApplicationPanelProps {
  app: RunApp;
  stage: RunStage;
  onEdit: (key: string, value: string) => void;
  onApprove: (approved: boolean) => void;
  onSkip: (skipped: boolean) => void;
  onRetry: () => void;
}

export function StatusBadge({ app }: { app: RunApp }) {
  const meta = STATUS_META[appStatus(app)];
  return <Badge tone={meta.tone} dot>{meta.label}</Badge>;
}

function LiveProgress({ app }: { app: RunApp }) {
  return (
    <section aria-label="Filling progress" className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-body text-fg-muted" role="status" aria-live="polite">
        <Spinner size="sm" label={null} />
        <span>{app.phase === 'queued' ? 'Waiting for the previous form to finish' : app.activity || 'Opening the application form'}</span>
      </div>
      {app.waitingOnUser && (
        <p className="rounded-md border border-warning/50 bg-warning-subtle/40 px-3 py-2 text-body text-fg">
          The portal needs you in the browser window: {app.waitingOnUser}
        </p>
      )}
      {app.live.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label="Fields filled so far">
          {app.live.map((f) => (
            <li key={f.key} className="flex items-baseline gap-2 text-caption">
              <span className={cn('shrink-0', f.state === 'filled' ? 'text-success-fg' : 'text-warning-fg')}>
                {f.state === 'filled' ? 'Filled' : f.state === 'needs_user' ? 'Needs you' : 'Could not fill'}
              </span>
              <span className="min-w-0 truncate text-fg">{f.label}</span>
              {f.state === 'filled' && f.value && <span className="min-w-0 truncate text-fg-muted">{f.value}</span>}
              {f.source && <span className="shrink-0 text-fg-subtle">{SOURCE_LABEL[f.source]}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ApplicationPanel({ app, stage, onEdit, onApprove, onSkip, onRetry }: ApplicationPanelProps) {
  const status = appStatus(app);
  const title = app.snapshot?.jobTitle || app.target.title || 'Application';
  const company = app.snapshot?.company || app.target.company || '';
  const reviewing = stage === 'review';
  const attention = attentionMessage(app);
  const fields = app.snapshot?.fields ?? [];
  const needsYou = needsYouFields(app);
  const rest = fields.filter((f) => !needsYou.includes(f));
  const canRetry = reviewing && (status === 'failed' || status === 'needs_you') && !(app.snapshot?.submittable && !app.snapshot.walls.length);

  return (
    <article aria-labelledby={`app-${app.snapshot?.id ?? 'pending'}-title`} className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 id={`app-${app.snapshot?.id ?? 'pending'}-title`} className="text-body-lg font-strong text-fg">{title}</h3>
          <p className="truncate text-caption text-fg-muted">{[company, hostOf(app.url)].filter(Boolean).join(' · ')}</p>
        </div>
        <StatusBadge app={app} />
      </header>

      {(app.phase === 'queued' || app.phase === 'filling') && <LiveProgress app={app} />}

      {app.result && (
        <p
          className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-body', app.result.submitted ? 'border-success/40 bg-success-subtle/40' : 'border-danger/40 bg-danger-subtle/40')}
          role="status"
        >
          {app.result.submitted ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />}
          <span>
            {app.result.submitted
              ? app.result.confirmed ? 'Submitted. The portal confirmed it.' : `Submitted, but no confirmation page was detected. Check the browser window.${app.result.error ? ` (${app.result.error})` : ''}`
              : `Not submitted: ${app.result.error || 'unknown reason'}. The form is still open in the browser window.`}
          </span>
        </p>
      )}

      {app.phase !== 'queued' && app.phase !== 'filling' && attention && !app.result && status !== 'skipped' && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-warning/50 bg-warning-subtle/40 px-3 py-2" role="alert">
          <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-body text-fg">{attention}</p>
          {canRetry && (
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" leftIcon={<RotateCcw />} onClick={onRetry}>Retry</Button>
              <Button size="sm" variant="ghost" onClick={() => onSkip(true)}>Skip</Button>
            </div>
          )}
        </div>
      )}

      {app.snapshot?.pageErrors.length ? (
        <section aria-label="Messages from the portal" className="flex flex-col gap-1">
          <h4 className="text-caption font-strong text-fg-muted">The portal showed</h4>
          <ul className="list-disc pl-5 text-caption text-fg-muted">
            {app.snapshot.pageErrors.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </section>
      ) : null}

      {needsYou.length > 0 && (
        <section aria-label="Fields that need you" className="flex flex-col gap-2">
          <h4 className="text-caption font-strong text-fg">Needs your answer ({needsYou.length})</h4>
          <ul className="flex flex-col gap-2">
            {needsYou.map((f, i) => (
              <FieldRow
                key={`${f.fieldKey}-${i}`}
                field={f}
                value={fieldValue(app, f)}
                edited={f.fieldKey in app.edits}
                needsYou
                disabled={!reviewing || app.skipped}
                onChange={(v) => onEdit(f.fieldKey, v)}
              />
            ))}
          </ul>
        </section>
      )}

      {rest.length > 0 && (
        <section aria-label="Filled fields" className="flex flex-col gap-2">
          <h4 className="text-caption font-strong text-fg">Filled by Nomadic ({rest.length})</h4>
          <ul className="flex flex-col gap-2">
            {rest.map((f, i) => (
              <FieldRow
                key={`${f.fieldKey}-${i}`}
                field={f}
                value={fieldValue(app, f)}
                edited={f.fieldKey in app.edits}
                needsYou={false}
                disabled={!reviewing || app.skipped}
                onChange={(v) => onEdit(f.fieldKey, v)}
              />
            ))}
          </ul>
        </section>
      )}

      {reviewing && app.snapshot && (
        <footer className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
          {app.skipped ? (
            <>
              <p className="flex-1 text-body text-fg-muted">Skipped. It will not be submitted.</p>
              <Button size="sm" variant="secondary" onClick={() => onSkip(false)}>Include again</Button>
            </>
          ) : (
            <>
              <Checkbox
                className="flex-1"
                checked={app.approved}
                disabled={status !== 'ready'}
                onCheckedChange={(c) => onApprove(c === true)}
                label="I reviewed this application"
                description={status === 'ready' ? 'Only reviewed applications are submitted.' : 'Resolve the items above first.'}
              />
              {status !== 'failed' && <Button size="sm" variant="ghost" onClick={() => onSkip(true)}>Skip this one</Button>}
            </>
          )}
        </footer>
      )}
    </article>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

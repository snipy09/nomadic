import React from 'react';
import { Badge, Button } from '@nomadic/ui';
import { summarizeUpdater } from './updatesLogic';
import type { UpdaterState } from './useUpdater';

/** Current update state with the one action that makes sense now. */
export const UpdateStatus: React.FC<{ updater: UpdaterState; showNotes?: boolean }> = ({ updater, showNotes = true }) => {
  const s = summarizeUpdater(updater.info);
  const act = () => {
    if (s.action === 'check') void updater.check();
    else if (s.action === 'download') void updater.download();
    else if (s.action === 'install') void updater.install();
  };
  const notes = updater.info?.releaseNotes;
  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <Badge tone={s.tone}>{s.title}</Badge>
          </div>
          {s.detail && <p className="text-body text-fg-muted">{s.detail}</p>}
        </div>
        {s.action && (
          <Button variant={s.action === 'check' ? 'secondary' : 'primary'} onClick={act}>{s.actionLabel}</Button>
        )}
      </div>
      {updater.info?.state === 'downloading' && (
        <div
          role="progressbar"
          aria-label="Update download"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={updater.info.percent ?? 0}
          className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
        >
          <div className="h-full bg-accent transition-[width]" style={{ width: `${updater.info.percent ?? 0}%` }} />
        </div>
      )}
      {showNotes && notes && (updater.info?.state === 'available' || updater.info?.state === 'downloaded') && (
        <details className="rounded-md border border-line bg-surface-sunken p-3">
          <summary className="cursor-default text-label text-fg">Release notes</summary>
          <p className="mt-2 whitespace-pre-wrap text-body text-fg-muted">{notes}</p>
        </details>
      )}
      {updater.error && <p role="alert" className="text-body text-danger-fg">{updater.error}</p>}
    </div>
  );
};

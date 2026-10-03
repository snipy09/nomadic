import React from 'react';
import { Button, Dialog, DialogContent } from '@nomadic/ui';
import { getApi } from '../../types';
import { useWhatsNew } from './useUpdater';

/** Shown once after Nomadic updates. Uses the real release notes, or links to them. */
export const WhatsNewDialog: React.FC = () => {
  const { info, dismiss } = useWhatsNew();
  if (!info) return null;
  return (
    <Dialog open onOpenChange={(open) => { if (!open) dismiss(); }}>
      <DialogContent
        title={`What's new in ${info.version}`}
        description={info.previousVersion ? `Updated from ${info.previousVersion}.` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => void getApi().openExternalUrl?.(info.releaseUrl)}>Release page</Button>
            <Button variant="primary" onClick={dismiss} autoFocus>Got it</Button>
          </>
        }
      >
        {info.notes ? (
          <p className="whitespace-pre-wrap text-body text-fg">{info.notes}</p>
        ) : (
          <p className="text-body text-fg-muted">The notes for this release are on the release page.</p>
        )}
      </DialogContent>
    </Dialog>
  );
};

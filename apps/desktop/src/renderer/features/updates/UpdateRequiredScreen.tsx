import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { Button, Card, NomadicLogo } from '@nomadic/ui';
import { getApi, type UpdatePolicyResult } from '../../types';
import { RELEASES_URL } from '../../../shared/support';
import { useUpdater } from './useUpdater';
import { UpdateStatus } from './UpdateStatus';

/** Blocks the app when this version is below the forced-update floor (security fixes). */
export const UpdateRequiredScreen: React.FC<{ policy: UpdatePolicyResult }> = ({ policy }) => {
  const updater = useUpdater();
  const canAutoUpdate = updater.available && updater.info?.state !== 'unsupported';
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4 text-fg">
      <Card variant="raised" padding="lg" className="w-full max-w-md gap-5">
        <NomadicLogo className="h-6" />
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <h1 className="text-title font-strong text-fg">Update required</h1>
            <p className="text-body text-fg-muted">
              {policy.message || 'This version of Nomadic has a problem fixed in a newer release. Update to keep using it.'}
            </p>
            <p className="text-caption text-fg-subtle">
              You have {policy.currentVersion}; the minimum is {policy.minimumVersion}.
            </p>
          </div>
        </div>
        {canAutoUpdate ? (
          <UpdateStatus updater={updater} />
        ) : (
          <Button variant="primary" onClick={() => void getApi().openExternalUrl?.(RELEASES_URL)}>Download the latest version</Button>
        )}
      </Card>
    </main>
  );
};

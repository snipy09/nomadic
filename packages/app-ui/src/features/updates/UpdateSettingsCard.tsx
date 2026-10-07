import React from 'react';
import { Card, CardContent, CardHeader, RadioGroup } from '@nomadic/ui';
import type { UpdateChannel } from '../../types';
import { CHANNEL_OPTIONS } from './updatesLogic';
import { useUpdater } from './useUpdater';
import { UpdateStatus } from './UpdateStatus';

/** Settings → Updates: status, manual check and the stable/beta channel. */
export const UpdateSettingsCard: React.FC = () => {
  const updater = useUpdater();
  if (!updater.available) {
    return (
      <Card>
        <CardHeader title="Updates" description="Updates are available in the installed desktop app." />
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader title="Updates" description="Nomadic checks for updates when it starts and every few hours. Nothing downloads until you choose to." />
      <CardContent className="flex flex-col gap-5">
        <UpdateStatus updater={updater} />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-label font-strong text-fg">Update channel</legend>
          <RadioGroup
            aria-label="Update channel"
            value={updater.info?.channel ?? 'stable'}
            onValueChange={(v) => void updater.setChannel(v as UpdateChannel)}
            options={CHANNEL_OPTIONS.map((o) => ({ ...o }))}
          />
        </fieldset>
      </CardContent>
    </Card>
  );
};

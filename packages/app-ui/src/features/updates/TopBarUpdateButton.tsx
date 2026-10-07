import React, { useState } from 'react';
import { ArrowDownToLine } from 'lucide-react';
import { Button, Dialog, DialogContent } from '@nomadic/ui';
import { topBarUpdateLabel } from './updatesLogic';
import { useUpdater } from './useUpdater';
import { UpdateStatus } from './UpdateStatus';

/** Top-bar entry point; hidden unless an update needs the user's attention. */
export const TopBarUpdateButton: React.FC = () => {
  const updater = useUpdater();
  const [open, setOpen] = useState(false);
  const label = topBarUpdateLabel(updater.info);
  if (!label) return null;
  return (
    <>
      <Button variant="subtle" size="sm" leftIcon={<ArrowDownToLine />} onClick={() => setOpen(true)}>{label}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Update Nomadic">
          <UpdateStatus updater={updater} />
        </DialogContent>
      </Dialog>
    </>
  );
};

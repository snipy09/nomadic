import React, { useEffect, useState } from 'react';
import { MailWarning } from 'lucide-react';
import { Badge, Button, Dialog, DialogContent } from '@nomadic/ui';
import { getApi } from '../../types';
import { VerifyEmailPanel } from './VerifyEmailPanel';

type Status = 'unknown' | 'verified' | 'unverified';

/**
 * Settings > Account: a "Verified" badge, or a reminder with a "Verify email" dialog. Unverified accounts keep
 * full access (migration 019), so nothing shows when the status cannot be read (offline, older server).
 */
export const EmailVerificationNotice: React.FC<{ email?: string }> = ({ email }) => {
  const [status, setStatus] = useState<Status>('unknown');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const api = getApi();
    if (!api?.authVerificationStatus) return;
    let alive = true;
    api.authVerificationStatus()
      .then((res) => {
        if (alive && res?.success) setStatus(res.verified ? 'verified' : 'unverified');
      })
      .catch(() => { /* stays hidden */ });
    return () => { alive = false; };
  }, []);

  if (status === 'unknown') return null;
  if (status === 'verified') return <Badge tone="success" size="sm">Verified</Badge>;

  return (
    <div className="flex flex-wrap items-start gap-3 rounded-md border border-warning/50 bg-warning-subtle/40 px-3 py-2" role="status">
      <MailWarning className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-body text-fg">
        Your email is not verified yet. Verify it so you can reset your password if you forget it.
      </p>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Verify email</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Verify your email" size="sm">
          {open && (
            <VerifyEmailPanel
              email={email}
              autoSend
              onVerified={() => { setStatus('verified'); setOpen(false); }}
              onSkip={() => setOpen(false)}
              skipLabel="Not now"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { Button, Dialog, DialogContent, EmptyState, Field, Skeleton, Textarea } from '@nomadic/ui';
import { ADMIN_REASON_MAX } from '../../../shared/admin';
import { validateReason } from './adminLogic';

/** Error state for an admin panel, with a retry. */
export function AdminErrorState({ title, error, code, onRetry }: { title: string; error: string; code: string | null; onRetry: () => void }) {
  const hint =
    code === 'unauthorized' || code === 'no_session'
      ? ' Sign out and sign in again, then retry.'
      : code === 'forbidden'
        ? ' Your account is not an admin on the server.'
        : '';
  return (
    <EmptyState
      tone="danger"
      bordered
      title={title}
      description={`${error}${hint}`}
      actions={<Button onClick={onRetry}>Try again</Button>}
    />
  );
}

export function LoadingRows({ label, rows = 6 }: { label: string; rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} height={40} radius="md" />)}
    </div>
  );
}

interface ConfirmChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What will change, shown above the reason field. */
  summary: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** Extra controls between the summary and the reason (e.g. the new status). */
  children?: React.ReactNode;
  /** False disables the confirm button (e.g. nothing chosen yet). */
  canConfirm?: boolean;
  /** Resolves to an error message to show, or null on success (the dialog then closes). */
  onConfirm: (reason: string) => Promise<string | null>;
}

/**
 * Every admin change goes through this: it states the change, asks for the
 * reason that is saved in the audit log, and only then calls the server.
 */
export function ConfirmChangeDialog({ open, onOpenChange, title, summary, confirmLabel, danger, children, canConfirm = true, onConfirm }: ConfirmChangeDialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setReason(''); setError(null); setSubmitError(null); setSaving(false); }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canConfirm) return;
    const err = validateReason(reason);
    setError(err);
    if (err) return;
    setSaving(true);
    setSubmitError(null);
    const res = await onConfirm(reason.trim());
    setSaving(false);
    if (res) setSubmitError(res);
    else onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent
        title={title}
        description="This change is saved to the audit log with your account and the reason below."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="admin-confirm-form" variant={danger ? 'danger' : 'primary'} loading={saving} disabled={!canConfirm}>{confirmLabel}</Button>
          </>
        }
      >
        <form id="admin-confirm-form" onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
          <div className="rounded-md border border-line bg-surface-sunken p-3 text-body text-fg">{summary}</div>
          {children}
          <Field label="Reason" required error={error} hint="For example a support ticket number or what was agreed with the user.">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={ADMIN_REASON_MAX} autoFocus={!children} />
          </Field>
          {submitError && <p role="alert" className="text-label text-danger-fg">{submitError}</p>}
        </form>
      </DialogContent>
    </Dialog>
  );
}

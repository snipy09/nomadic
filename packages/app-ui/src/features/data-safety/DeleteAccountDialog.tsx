import React, { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button, Dialog, DialogContent, Field, Input } from '@nomadic/ui';
import { validateDelete, type DeleteErrors, type DeleteForm } from './dataSafetyLogic';

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountEmail: string | null | undefined;
  busy: boolean;
  error: string | null;
  onConfirm: (confirmEmail: string, password: string) => Promise<boolean>;
}

/** Permanent deletion: the user types their email and re-enters their password. */
export const DeleteAccountDialog: React.FC<DeleteAccountDialogProps> = ({ open, onOpenChange, accountEmail, busy, error, onConfirm }) => {
  const [form, setForm] = useState<DeleteForm>({ confirmEmail: '', password: '' });
  const [errors, setErrors] = useState<DeleteErrors>({});

  useEffect(() => {
    if (!open) {
      setForm({ confirmEmail: '', password: '' });
      setErrors({});
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateDelete(form, accountEmail);
    setErrors(errs);
    if (errs.confirmEmail) return document.getElementById('delete-confirm-email')?.focus();
    if (errs.password) return document.getElementById('delete-password')?.focus();
    await onConfirm(form.confirmEmail, form.password);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent
        title="Delete your account"
        description="This permanently deletes your Nomadic account, its synced data and everything stored on this computer. It cannot be undone."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button variant="danger" type="submit" form="delete-account-form" loading={busy} loadingText="Deleting…">
              Delete account permanently
            </Button>
          </>
        }
      >
        <form id="delete-account-form" noValidate aria-label="Confirm account deletion" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
          <p className="text-body text-fg-muted">
            Export your data first if you want a copy. Payment records are kept for accounting without your name or email.
          </p>
          <Field label={`Type ${accountEmail ?? 'your account email'} to confirm`} required error={errors.confirmEmail} id="delete-confirm-email">
            <Input value={form.confirmEmail} onChange={(e) => setForm((f) => ({ ...f, confirmEmail: e.target.value }))} autoComplete="off" disabled={busy} autoFocus />
          </Field>
          <Field label="Password" required error={errors.password} id="delete-password">
            <Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} autoComplete="current-password" disabled={busy} />
          </Field>
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-body text-danger-fg">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
};

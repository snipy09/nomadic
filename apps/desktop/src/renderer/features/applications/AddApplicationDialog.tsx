import React, { useEffect, useState } from 'react';
import { Button, Dialog, DialogContent, Field, Input, Select, Textarea } from '@nomadic/ui';
import { MOVE_OPTIONS, validateDraft, type NewApplicationDraft } from './applicationsLogic';

interface AddApplicationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (draft: NewApplicationDraft) => Promise<{ ok: boolean; error?: string }>;
}

const EMPTY: NewApplicationDraft = { company: '', title: '', url: '', status: 'applied', notes: '' };

/** Log an application made outside Nomadic. */
export function AddApplicationDialog({ open, onOpenChange, onSubmit }: AddApplicationDialogProps) {
  const [draft, setDraft] = useState<NewApplicationDraft>(EMPTY);
  const [errors, setErrors] = useState<ReturnType<typeof validateDraft>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setDraft(EMPTY); setErrors({}); setSubmitError(null); }
  }, [open]);

  const set = <K extends keyof NewApplicationDraft>(k: K, v: NewApplicationDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateDraft(draft);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    const res = await onSubmit(draft);
    setSaving(false);
    if (res.ok) onOpenChange(false);
    else setSubmitError(res.error || 'The application was not saved.');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Add application"
        description="Log a job you applied to outside Nomadic so you can track it here."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" form="add-application-form" loading={saving}>Add application</Button>
          </>
        }
      >
        <form id="add-application-form" onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
          <Field label="Company" required error={errors.company}>
            <Input value={draft.company} onChange={(e) => set('company', e.target.value)} autoFocus maxLength={200} />
          </Field>
          <Field label="Role" required error={errors.title}>
            <Input value={draft.title} onChange={(e) => set('title', e.target.value)} maxLength={200} />
          </Field>
          <Field label="Job posting link" hint="Optional" error={errors.url}>
            <Input type="url" inputMode="url" value={draft.url} onChange={(e) => set('url', e.target.value)} placeholder="https://" />
          </Field>
          <Field label="Status">
            <Select value={draft.status} onValueChange={(v) => set('status', v as NewApplicationDraft['status'])} options={MOVE_OPTIONS} />
          </Field>
          <Field label="Notes" hint="Optional" error={errors.notes}>
            <Textarea value={draft.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
          </Field>
          {submitError && <p role="alert" className="text-body text-danger-fg">{submitError}</p>}
        </form>
      </DialogContent>
    </Dialog>
  );
}

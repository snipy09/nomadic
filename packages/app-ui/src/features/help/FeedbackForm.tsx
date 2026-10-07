import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, Checkbox, Field, Input, RadioGroup, Textarea } from '@nomadic/ui';
import type { FeedbackKind } from '../../types';
import { KIND_OPTIONS, MAX_FEEDBACK_LENGTH, validateFeedback, type FeedbackErrors, type FeedbackForm as Form } from './feedbackLogic';
import { useFeedback } from './useSupport';

const EMPTY: Form = { kind: 'bug', message: '', contactEmail: '', includeDiagnostics: true };

/** Feedback and bug reports, with diagnostics attached unless the user unticks it. */
export const FeedbackForm: React.FC = () => {
  const fb = useFeedback();
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<FeedbackErrors>({});
  const placeholder = KIND_OPTIONS.find((k) => k.value === form.kind)?.placeholder;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateFeedback(form);
    setErrors(errs);
    if (errs.message) return document.getElementById('feedback-message')?.focus();
    if (errs.contactEmail) return document.getElementById('feedback-email')?.focus();
    const ok = await fb.send({
      kind: form.kind,
      message: form.message.trim(),
      includeDiagnostics: form.includeDiagnostics,
      contactEmail: form.contactEmail.trim() || undefined,
    });
    if (ok) setForm(EMPTY);
  };

  return (
    <Card>
      <CardHeader title="Send feedback or report a bug" description="Goes to the Nomadic team. Diagnostics help us reproduce problems; they never include your profile, answers or emails." />
      <CardContent>
        {fb.result ? (
          <div role="status" className="flex flex-col gap-3">
            <div className="flex items-start gap-2 text-body text-fg">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              <span>{fb.result.note}</span>
            </div>
            <div><Button variant="secondary" onClick={fb.reset}>Send another</Button></div>
          </div>
        ) : (
          <form noValidate aria-label="Feedback" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-label font-strong text-fg">Type</legend>
              <RadioGroup
                aria-label="Feedback type"
                orientation="horizontal"
                value={form.kind}
                onValueChange={(v) => setForm((f) => ({ ...f, kind: v as FeedbackKind }))}
                options={KIND_OPTIONS.map(({ value, label }) => ({ value, label }))}
              />
            </fieldset>
            <Field label="Message" required error={errors.message} id="feedback-message" hint={`${form.message.length}/${MAX_FEEDBACK_LENGTH}`}>
              <Textarea
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                rows={6}
                maxLength={MAX_FEEDBACK_LENGTH}
                placeholder={placeholder}
                disabled={fb.sending}
              />
            </Field>
            <Field label="Email for a reply (optional)" error={errors.contactEmail} id="feedback-email">
              <Input type="email" value={form.contactEmail} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))} autoComplete="email" disabled={fb.sending} />
            </Field>
            <Checkbox
              checked={form.includeDiagnostics}
              onCheckedChange={(v) => setForm((f) => ({ ...f, includeDiagnostics: v === true }))}
              label="Attach diagnostics (app version, database status, redacted recent logs)"
              disabled={fb.sending}
            />
            {fb.error && <p role="alert" className="text-body text-danger-fg">{fb.error}</p>}
            <div><Button type="submit" variant="primary" loading={fb.sending} loadingText="Sending…">Send</Button></div>
          </form>
        )}
      </CardContent>
    </Card>
  );
};

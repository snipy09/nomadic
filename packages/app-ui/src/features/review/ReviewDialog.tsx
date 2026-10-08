import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button, Dialog, DialogContent, Field, RadioGroup, Textarea } from '@nomadic/ui';
import { EMPTY_REVIEW, MAX_REVIEW_TEXT, SUS_STATEMENTS, firstStepComplete, unansweredStatements, type ReviewForm } from './reviewLogic';
import { useReviewPrompt } from './useReviewPrompt';

const RECOMMEND_OPTIONS = Array.from({ length: 11 }, (_, i) => ({ value: String(i), label: String(i) }));
const AGREE_OPTIONS = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }));

/** Asks a 7-day-old account for its review once, a little after the app opens. Two short steps. */
export const ReviewDialog: React.FC<{ email: string | null; enabled: boolean }> = ({ email, enabled }) => {
  const review = useReviewPrompt(email, enabled);
  const [form, setForm] = useState<ReviewForm>(EMPTY_REVIEW);
  const [step, setStep] = useState<1 | 2>(1);
  const [showMissing, setShowMissing] = useState(false);

  if (!review.open) return null;

  const missing = unansweredStatements(form);
  const send = async () => {
    if (missing.length) {
      setShowMissing(true);
      document.querySelector<HTMLElement>(`#review-sus-${missing[0]} [role="radio"]`)?.focus();
      return;
    }
    await review.submit(form);
  };

  const footer = review.sent ? (
    <Button variant="primary" onClick={review.close} autoFocus>Close</Button>
  ) : step === 1 ? (
    <>
      <Button variant="ghost" onClick={review.snooze}>Not now</Button>
      <Button variant="primary" disabled={!firstStepComplete(form)} onClick={() => setStep(2)}>Next</Button>
    </>
  ) : (
    <>
      <Button variant="ghost" onClick={() => setStep(1)} disabled={review.sending}>Back</Button>
      <Button variant="primary" loading={review.sending} loadingText="Sending…" onClick={() => void send()}>Send review</Button>
    </>
  );

  return (
    <Dialog open onOpenChange={(open) => { if (!open) review.snooze(); }}>
      <DialogContent
        title={review.sent ? 'Thank you' : 'How is Nomadic going?'}
        description={review.sent ? undefined : `You have used Nomadic for a week. Two quick steps, about 2 minutes. Step ${step} of 2.`}
        size="lg"
        footer={footer}
      >
        {review.sent ? (
          <div role="status" className="flex items-start gap-2 text-body text-fg">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            <span>Your review was sent. It helps decide what we fix and build next.</span>
          </div>
        ) : step === 1 ? (
          <div className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-label font-strong text-fg">How likely are you to recommend Nomadic to a friend? (0 = not at all, 10 = very likely)</legend>
              <RadioGroup
                aria-label="How likely are you to recommend Nomadic, 0 to 10"
                orientation="horizontal"
                value={form.recommend === null ? '' : String(form.recommend)}
                onValueChange={(v) => setForm((f) => ({ ...f, recommend: Number(v) }))}
                options={RECOMMEND_OPTIONS}
              />
            </fieldset>
            <Field label="What is the best thing about Nomadic? (optional)" id="review-best">
              <Textarea value={form.best} rows={3} maxLength={MAX_REVIEW_TEXT} onChange={(e) => setForm((f) => ({ ...f, best: e.target.value }))} />
            </Field>
            <Field label="What is the most frustrating thing? (optional)" id="review-frustrating">
              <Textarea value={form.frustrating} rows={3} maxLength={MAX_REVIEW_TEXT} onChange={(e) => setForm((f) => ({ ...f, frustrating: e.target.value }))} />
            </Field>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-body text-fg-muted">For each statement: 1 = strongly disagree, 5 = strongly agree.</p>
            {SUS_STATEMENTS.map((statement, i) => {
              const unanswered = showMissing && form.sus[i] === null;
              return (
                <fieldset key={statement} className="flex flex-col gap-2">
                  <legend className="mb-1 text-body text-fg">{i + 1}. {statement}</legend>
                  <RadioGroup
                    id={`review-sus-${i}`}
                    aria-label={`${statement} 1 strongly disagree to 5 strongly agree`}
                    aria-invalid={unanswered || undefined}
                    orientation="horizontal"
                    value={form.sus[i] === null ? '' : String(form.sus[i])}
                    onValueChange={(v) => setForm((f) => ({ ...f, sus: f.sus.map((a, j) => (j === i ? Number(v) : a)) }))}
                    options={AGREE_OPTIONS}
                  />
                  {unanswered && <p className="text-caption text-danger-fg">Pick an answer.</p>}
                </fieldset>
              );
            })}
            {review.error && <p role="alert" className="text-body text-danger-fg">{review.error}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

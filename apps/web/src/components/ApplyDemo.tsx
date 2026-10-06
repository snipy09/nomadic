import { CSSProperties, useId, useState } from 'react';
import { APPLY_FIELDS, APPLY_FORM_TITLE, SAVED_ANSWERS, type FieldSource } from '../content';

const SOURCE_STYLE: Record<FieldSource, string> = {
  Profile: 'text-ink-soft',
  Resume: 'text-ink-soft',
  'Your answer': 'text-ink-soft',
  'AI draft': 'bg-marigold px-1 text-ink',
};

function ReviewForm() {
  const [reviewed, setReviewed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const tickId = useId();

  return (
    <div>
      <p className="text-sm text-ink-soft">Filled in your browser, waiting for your review</p>
      <p className="font-bold">{APPLY_FORM_TITLE}</p>

      <dl className="mt-4 border-t border-rule">
        {APPLY_FIELDS.map((field, i) => (
          <div
            key={field.label}
            className="grid grid-cols-[6.5rem_1fr] items-start gap-x-3 border-b border-rule py-2.5 sm:grid-cols-[8rem_1fr_auto]"
          >
            <dt className="text-sm text-ink-soft">{field.label}</dt>
            <dd className="min-w-0">
              <span
                className="anim-type block break-words font-semibold"
                style={{ '--d': `${i * 380}ms` } as CSSProperties}
              >
                {field.value}
              </span>
            </dd>
            <dd className={`col-start-2 text-xs font-bold sm:col-start-3 sm:text-right ${SOURCE_STYLE[field.source]}`}>
              {field.source === 'AI draft' ? 'AI draft, check it' : `From ${field.source.toLowerCase()}`}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
        <label htmlFor={tickId} className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 font-semibold">
          <input
            id={tickId}
            type="checkbox"
            checked={reviewed}
            disabled={submitted}
            onChange={(event) => setReviewed(event.target.checked)}
            className="h-5 w-5 accent-[#2338E0]"
          />
          I reviewed this
        </label>
        <button
          type="button"
          disabled={!reviewed || submitted}
          onClick={() => setSubmitted(true)}
          className="min-h-11 border-2 border-ink bg-ink px-5 font-bold text-white hover:bg-ultra disabled:cursor-not-allowed disabled:border-rule disabled:bg-rule disabled:text-ink-soft"
        >
          {submitted ? 'Submitted' : 'Submit application'}
        </button>
        {submitted && (
          <button
            type="button"
            onClick={() => { setSubmitted(false); setReviewed(false); }}
            className="inline-flex min-h-11 items-center text-sm font-bold underline decoration-2 underline-offset-4"
          >
            Reset
          </button>
        )}
      </div>
      <p className="mt-2 text-sm text-ink-soft" aria-live="polite">
        {submitted
          ? 'Submitted and logged on your board under Applied.'
          : reviewed
            ? 'Ready. Nothing has been sent yet.'
            : 'Submit stays locked until you tick that you reviewed every field.'}
      </p>
    </div>
  );
}

export default function ApplyDemo() {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12">
      <div className="border-2 border-ink bg-white p-4 sm:p-6">
        <ReviewForm />
      </div>

      <div>
        <h3 className="wide text-2xl">Answer once, reuse on every form</h3>
        <p className="mt-3 text-ink-soft">
          Education, notice period, relocation: write the common answers once on the Answers page. Anything you type
          while reviewing a form is remembered too, so the next form asks less.
        </p>
        <dl className="mt-5 border-t-2 border-ink text-[15px]">
          {SAVED_ANSWERS.map((row) => (
            <div key={row.q} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-b border-rule py-3">
              <dt className="text-ink-soft">{row.q}</dt>
              <dd className="text-right font-semibold">{row.a}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-sm text-ink-soft">Sample answers. AI drafts are marked and never saved without you.</p>
      </div>
    </div>
  );
}

import { CSSProperties, useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { APPLY_FIELDS, APPLY_FORM_TITLE, AUTO_QUEUE, OUTREACH } from '../content';

type Mode = 'review' | 'auto';

const MODES: { id: Mode; label: string; note: string }[] = [
  { id: 'review', label: 'Review each', note: 'Semi-automatic, on Pro and Max' },
  { id: 'auto', label: 'Run on its own', note: 'Autonomous, on Max' },
];

function ReviewForm() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <div>
      <p className="text-sm text-ink-soft">Application form</p>
      <p className="font-bold">{APPLY_FORM_TITLE}</p>

      <dl className="mt-4 border-t border-rule">
        {APPLY_FIELDS.map((field, i) => (
          <div
            key={field.label}
            className="grid grid-cols-[6.5rem_1fr] items-center gap-x-3 border-b border-rule py-2.5 sm:grid-cols-[8rem_1fr]"
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
          </div>
        ))}
      </dl>

      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
        <button
          type="button"
          disabled={submitted}
          onClick={() => setSubmitted(true)}
          className="min-h-11 border-2 border-ink bg-ink px-5 font-bold text-white hover:bg-ultra disabled:cursor-default disabled:border-rule disabled:bg-rule disabled:text-ink-soft"
        >
          {submitted ? 'Submitted' : 'Submit application'}
        </button>
        <p className="text-sm text-ink-soft" aria-live="polite">
          {submitted
            ? 'Logged on your board under Applied.'
            : `All ${APPLY_FIELDS.length} fields were filled from your profile. Nothing is sent until you submit.`}
        </p>
        {submitted && (
          <button
            type="button"
            onClick={() => setSubmitted(false)}
            className="inline-flex min-h-11 items-center text-sm font-bold underline decoration-2 underline-offset-4"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

function AutoQueue() {
  const [done, setDone] = useState(0);

  useEffect(() => {
    if (done >= AUTO_QUEUE.length) return;
    const timer = window.setTimeout(() => setDone((count) => count + 1), 1100);
    return () => window.clearTimeout(timer);
  }, [done]);

  return (
    <div>
      <p className="text-sm text-ink-soft">Queue built from your saved criteria</p>
      <p className="font-bold">
        <span className="nums">{done}</span> of <span className="nums">{AUTO_QUEUE.length}</span> submitted
      </p>

      <ul className="mt-4 border-t border-rule">
        {AUTO_QUEUE.map((item, i) => {
          const finished = i < done;
          const working = i === done;
          return (
            <li
              key={item.company}
              className="grid grid-cols-[1fr_auto] items-center gap-x-4 border-b border-rule py-2.5"
            >
              <div className="min-w-0">
                <p className="break-words font-semibold leading-tight sm:truncate">{item.role}</p>
                <p className="text-sm text-ink-soft">{item.company}</p>
              </div>
              <p
                className={`flex items-center gap-1.5 text-sm font-bold ${
                  finished ? 'text-ultra' : working ? 'text-ink' : 'text-ink-soft'
                }`}
              >
                {finished && <Check aria-hidden className="h-4 w-4" strokeWidth={3} />}
                {finished ? 'Submitted' : working ? 'Filling the form' : 'Waiting'}
              </p>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-sm text-ink-soft">
        Every submission lands on your board. What can run unattended depends on the job portal and your settings.
      </p>
    </div>
  );
}

export default function ApplyDemo() {
  const [mode, setMode] = useState<Mode>('review');

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12">
      <div className="border-2 border-ink bg-white">
        <div role="tablist" aria-label="Application mode" className="grid grid-cols-2 border-b-2 border-ink">
          {MODES.map((item) => {
            const active = item.id === mode;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`mode-${item.id}`}
                aria-selected={active}
                aria-controls="mode-panel"
                onClick={() => setMode(item.id)}
                className={`min-w-0 px-3 py-3 text-left min-[400px]:px-4 sm:px-5 ${
                  active ? 'bg-ink text-white' : 'bg-fog hover:bg-white'
                }`}
              >
                <span className="block font-bold">{item.label}</span>
                <span className={`block text-sm ${active ? 'text-white/80' : 'text-ink-soft'}`}>{item.note}</span>
              </button>
            );
          })}
        </div>
        <div id="mode-panel" role="tabpanel" aria-labelledby={`mode-${mode}`} className="p-4 sm:p-6">
          {mode === 'review' ? <ReviewForm key="review" /> : <AutoQueue key="auto" />}
        </div>
      </div>

      <div>
        <h3 className="wide text-2xl">Reach the person behind the posting</h3>
        <p className="mt-3 text-ink-soft">
          Pro adds 25 verified recruiter contacts a week. Max sends outreach in the background for you.
        </p>
        <table className="mt-5 w-full border-t-2 border-ink text-left text-[15px]">
          <caption className="sr-only">Sample recruiter contacts</caption>
          <thead className="sr-only">
            <tr>
              <th>Role</th>
              <th>Company</th>
              <th>Domain</th>
            </tr>
          </thead>
          <tbody>
            {OUTREACH.map((contact) => (
              <tr key={contact.domain} className="border-b border-rule align-top">
                <td className="py-3 pr-3">
                  <span className="block font-semibold leading-tight">{contact.role}</span>
                  <span className="block text-sm text-ink-soft">{contact.company}</span>
                </td>
                <td className="break-all py-3 text-right text-sm text-ink-soft">{contact.domain}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-sm text-ink-soft">Sample contacts. Each one is matched to the company's own domain.</p>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { Check, ExternalLink, NotebookPen, Undo2 } from 'lucide-react';
import { Badge, Button, Card, Textarea, cn, useToast } from '@nomadic/ui';
import type { GradeResult, ProblemInfo, ProblemNote } from '@job-automator/learning';
import type { QuizItem } from './content';
import { InlineText } from './InlineText';
import { formatMinutes } from './learnModel';
import { QuizForm } from './QuizForm';
import type { LessonPoint } from './sessionModel';

type Result = Promise<{ ok: boolean; error?: string }>;

/** Numbered points: the name in bold, then what exactly to know. */
export function PointList({ points, size = 'md' }: { points: LessonPoint[]; size?: 'md' | 'lg' }) {
  return (
    <ol className="flex flex-col gap-4">
      {points.map((p) => (
        <li key={p.n} className="flex gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-label font-strong text-accent-subtle-fg"
          >
            {p.n}
          </span>
          <div className={cn('min-w-0 flex-1 text-fg', size === 'lg' ? 'text-body-lg' : 'text-body')}>
            {p.name && <div className="font-strong">{p.name}</div>}
            <div className={p.name ? 'text-fg-muted' : undefined}>
              <InlineText text={p.text} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

const DIFFICULTY_TONE = { easy: 'success', medium: 'warning', hard: 'danger' } as const;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * One problem: open it on LeetCode, then say how it went. "Solved" and
 * "Solved with a hint" are the only way a problem is marked done.
 */
export function ProblemCard({
  problem,
  done,
  minutes,
  tag,
  note,
  onOpen,
  onSolved,
  onUndo,
  onSaveNote,
}: {
  problem: ProblemInfo;
  done: boolean;
  minutes?: number;
  /** Why it is here, e.g. "On Amazon's list" or "Must do". */
  tag?: string | null;
  note?: ProblemNote;
  onOpen: () => void;
  onSolved: (hint: boolean) => Result;
  onUndo?: () => Result;
  onSaveNote: (note: ProblemNote) => Result;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [notYet, setNotYet] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note?.note ?? '');

  const run = async (name: string, fn: () => Result, fail: string) => {
    setBusy(name);
    const res = await fn();
    setBusy(null);
    if (!res.ok) toast({ title: fail, description: res.error, tone: 'danger' });
    return res.ok;
  };
  const save = (resolveLater: boolean) =>
    run('note', () => onSaveNote({ ref: problem.ref, note: text.slice(0, 2000), resolve_later: resolveLater, updated_at: new Date().toISOString() }), 'Note not saved').then(
      (ok) => ok && setEditing(false)
    );

  return (
    <Card padding="md" className={cn('flex flex-col gap-3', done && 'border-success/40')}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-body-lg font-strong text-fg">{problem.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-caption text-fg-subtle">
            <Badge size="sm" tone={DIFFICULTY_TONE[problem.difficulty]}>{cap(problem.difficulty)}</Badge>
            {minutes ? <span>{formatMinutes(minutes)}</span> : null}
            {tag && <span>{tag}</span>}
            {problem.paid_only && <span>LeetCode Premium</span>}
            {note?.resolve_later && <span>Re-solve later</span>}
          </div>
        </div>
        <Button size="sm" variant={done ? 'ghost' : 'secondary'} rightIcon={<ExternalLink />} onClick={onOpen}>
          Open on LeetCode
        </Button>
      </div>

      {done ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-body font-strong text-success-fg">
            <Check className="size-4" aria-hidden="true" /> Solved
          </span>
          {onUndo && (
            <Button size="sm" variant="ghost" leftIcon={<Undo2 />} loading={busy === 'undo'} onClick={() => void run('undo', onUndo, 'Not saved')}>
              Undo
            </Button>
          )}
        </div>
      ) : notYet ? (
        <p className="text-body text-fg-muted">
          Fine. Read the hints on LeetCode or the points again, then try once more. It stays on your list.{' '}
          <button type="button" className="font-strong text-accent underline-offset-2 hover:underline" onClick={() => setNotYet(false)}>
            Try again
          </button>
        </p>
      ) : (
        <div role="group" aria-label={`How did ${problem.title} go?`} className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" loading={busy === 'solved'} onClick={() => void run('solved', () => onSolved(false), 'Not saved')}>
            Solved
          </Button>
          <Button size="sm" variant="secondary" loading={busy === 'hint'} onClick={() => void run('hint', () => onSolved(true), 'Not saved')}>
            Solved with a hint
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setNotYet(true)}>
            Not yet
          </Button>
        </div>
      )}

      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} aria-label={`Note for ${problem.title}`} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" loading={busy === 'note'} onClick={() => void save(note?.resolve_later ?? false)}>Save note</Button>
            <Button size="sm" variant="secondary" onClick={() => void save(!(note?.resolve_later ?? false))}>
              {note?.resolve_later ? 'Clear "re-solve later"' : 'Save and re-solve later'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div>
          <Button size="sm" variant="ghost" leftIcon={<NotebookPen />} onClick={() => { setText(note?.note ?? ''); setEditing(true); }}>
            {note?.note ? 'Edit note' : 'Add a note'}
          </Button>
          {note?.note && <p className="mt-1 whitespace-pre-wrap text-caption text-fg-muted">{note.note}</p>}
        </div>
      )}
    </Card>
  );
}

/** The topic check: the quiz, the free-plan daily limit, or a note that there is none. */
export function CheckSection({
  items,
  title,
  practiceRemaining,
  isFree,
  done,
  onSubmit,
  onOpenUpgrade,
}: {
  items: QuizItem[];
  title: string;
  practiceRemaining: number;
  isFree: boolean;
  done?: boolean;
  onSubmit: (grades: GradeResult[]) => Result;
  onOpenUpgrade?: (feature?: string) => void;
}) {
  // Decided once, so the results stay on screen after the answers use up the daily allowance.
  const [allowed] = useState(practiceRemaining >= items.length);
  if (!items.length) return <p className="text-body text-fg-muted">No check for this topic yet.</p>;
  if (!allowed) {
    return (
      <Card padding="md" className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-body font-strong text-fg">Daily practice limit reached</div>
          <div className="text-caption text-fg-subtle">
            {isFree ? 'The free plan includes 10 practice questions a day. Come back tomorrow or upgrade.' : 'Come back tomorrow.'}
          </div>
        </div>
        {isFree && onOpenUpgrade && <Button onClick={() => onOpenUpgrade('Unlimited practice')}>Upgrade</Button>}
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {done && <p className="text-body text-success-fg">You passed this check before. Take it again any time; it counts as a review.</p>}
      <QuizForm
        key={`check-${title}`}
        items={items}
        label={`${title} check`}
        submitLabel="Check my answers"
        onSubmit={onSubmit}
        renderResult={(grades, reset) => {
          const right = grades.filter((g) => g.correct).length;
          const passed = right / grades.length >= 0.8;
          return (
            <Card padding="md" className={passed ? 'border-success/40' : 'border-warning/40'}>
              <p className="text-body text-fg">
                {passed
                  ? `${right} of ${grades.length} right. Check passed.`
                  : `${right} of ${grades.length} right. 80% passes; the ones you missed come back as reviews.`}
              </p>
              {!passed && (
                <Button size="sm" className="mt-2" onClick={reset} disabled={practiceRemaining < items.length}>
                  Try again
                </Button>
              )}
            </Card>
          );
        }}
      />
    </div>
  );
}

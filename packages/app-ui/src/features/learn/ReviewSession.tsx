import React, { useMemo, useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { Button, Card, IconButton, useToast } from '@nomadic/ui';
import type { GradeResult, ProblemNote } from '@job-automator/learning';
import { getApi, type LearningEventInput } from '../../types';
import { problemByRef } from './catalog';
import { skillName, type QuizItem } from './content';
import { ProblemCard } from './lessonParts';
import { problemAttemptedEvent } from './learnModel';
import { QuizForm } from './QuizForm';
import { reviewEvents } from './quizLogic';

type Result = Promise<{ ok: boolean; error?: string }>;

interface ReviewSessionProps {
  items: QuizItem[];
  /** Problems due for a re-solve (refs). */
  resolveDue: string[];
  notes: ProblemNote[];
  trackId: string;
  practiceRemaining: number;
  isFree: boolean;
  next?: { label: string; onGo: () => void } | null;
  onClose: () => void;
  onRecord: (events: LearningEventInput[]) => Result;
  onSaveNote: (note: ProblemNote) => Result;
  onOpenUpgrade?: (feature?: string) => void;
}

/** The warm-up: questions due for review (spaced repetition), then problems due for a re-solve. */
export function ReviewSession(props: ReviewSessionProps) {
  const { toast } = useToast();
  const [finished, setFinished] = useState(false);
  // Fixed when the warm-up opens, so answering does not reshuffle the list.
  const [items] = useState(() => props.items.slice(0, Math.max(0, Math.min(props.items.length, props.practiceRemaining))));
  const limited = props.items.length > 0 && items.length === 0;
  const resolve = useMemo(() => props.resolveDue.map((ref) => problemByRef(ref)).filter((p) => !!p), [props.resolveDue]);
  const [resolved, setResolved] = useState<Set<string>>(new Set());

  const submit = async (grades: GradeResult[]) => {
    const res = await props.onRecord(reviewEvents(items, grades, props.trackId, new Date()));
    if (!res.ok) toast({ title: 'Your answers were not saved', description: res.error, tone: 'danger' });
    else setFinished(true);
    return res;
  };

  const done = (items.length === 0 || finished) && resolve.every((p) => resolved.has(p!.ref));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4" role="region" aria-label="Warm-up review" onKeyDown={(e) => e.key === 'Escape' && props.onClose()}>
      <header className="flex items-center gap-3">
        <IconButton label="Close review" icon={<X />} variant="ghost" onClick={props.onClose} shortcut={['Esc']} />
        <div className="min-w-0 flex-1">
          <h2 className="text-body-lg font-strong text-fg">Warm-up review</h2>
          <p className="truncate text-caption text-fg-subtle">
            {items.length ? `From ${[...new Set(items.map((i) => i.skill_id))].slice(0, 3).map(skillName).join(', ')}` : 'Problems to solve again'}
          </p>
        </div>
      </header>

      {items.length > 0 && (
        <Card padding="lg" className="flex flex-col gap-3">
          <p className="text-body text-fg-muted">Answer from memory. What you miss comes back sooner; what you get right comes back later.</p>
          <QuizForm
            items={items}
            label="Review"
            submitLabel="Check my answers"
            onSubmit={submit}
            renderResult={(grades) => (
              <p className="text-body text-fg">{grades.filter((g) => g.correct).length} of {grades.length} remembered.</p>
            )}
          />
        </Card>
      )}
      {limited && (
        <Card padding="md" className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-body text-fg-muted">Daily practice limit reached. Reviews wait until tomorrow.</span>
          {props.isFree && props.onOpenUpgrade && <Button size="sm" variant="subtle" onClick={() => props.onOpenUpgrade?.('Unlimited practice')}>Upgrade</Button>}
        </Card>
      )}

      {resolve.length > 0 && (
        <section aria-labelledby="review-resolve" className="flex flex-col gap-2">
          <h3 id="review-resolve" className="text-heading font-strong text-fg">Solve again to keep it fresh</h3>
          <ul className="flex flex-col gap-3">
            {resolve.map((p) => (
              <li key={p!.ref}>
                <ProblemCard
                  problem={p!}
                  done={resolved.has(p!.ref)}
                  note={props.notes.find((n) => n.ref === p!.ref)}
                  onOpen={() => void getApi().openExternalUrl(p!.link)}
                  onSolved={async (hint) => {
                    const res = await props.onRecord([problemAttemptedEvent(p!.ref, hint, props.trackId, new Date())]);
                    if (res.ok) setResolved((s) => new Set(s).add(p!.ref));
                    return res;
                  }}
                  onSaveNote={props.onSaveNote}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="flex flex-wrap items-center justify-end gap-2">
        <Button variant={done && props.next ? 'secondary' : done ? 'primary' : 'ghost'} onClick={props.onClose}>
          {done ? 'Back to Today' : 'Leave it for now'}
        </Button>
        {done && props.next && (
          <Button variant="primary" rightIcon={<ArrowRight />} onClick={props.next.onGo}>
            Next: {props.next.label}
          </Button>
        )}
      </footer>
    </div>
  );
}

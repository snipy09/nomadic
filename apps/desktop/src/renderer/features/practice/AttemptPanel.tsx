import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, CircleSlash, Sparkles } from 'lucide-react';
import { Badge, Button, Card, Field, Textarea } from '@nomadic/ui';
import { getPlan } from '@nomadic/config';
import { gradeQuizItem, type PracticeAttempt, type PracticeMode, type PracticeOutcome, type QuizAnswer } from '@job-automator/learning';
import type { PracticeEntry, PracticeRecordResult } from '../../../shared/ipc';
import { ANSWER_MAX_CHARS, ANSWER_RUBRIC, getFeedbackClient } from './aiFeedback';
import { buildAttempt } from './practiceLogic';
import { QuizInput, emptyAnswer } from './QuizInput';

export interface GradedResult {
  outcome: PracticeOutcome;
  score: number;
}

interface AttemptPanelProps {
  entry: PracticeEntry;
  mode: PracticeMode;
  mockId?: string | null;
  /** Server refused an attempt for today's limit: grading is closed. */
  limitReached: boolean;
  onRecord: (attempt: PracticeAttempt) => Promise<PracticeRecordResult>;
  onGraded?: (result: GradedResult) => void;
  onOpenUpgrade?: () => void;
}

type SaveState =
  | { state: 'idle' }
  | { state: 'saving' }
  | { state: 'saved' }
  | { state: 'error'; message: string; retryable: boolean };

const FREE_DAILY = getPlan('free').limits.practicePerDay;

const SELF_GRADES: Array<{ outcome: PracticeOutcome; label: string }> = [
  { outcome: 'solved', label: 'Solved it' },
  { outcome: 'partial', label: 'Partly' },
  { outcome: 'unsolved', label: 'Could not solve' },
];

/** Answer, grade and record one entry: quiz items are graded locally, the rest are self-graded. */
export function AttemptPanel({ entry, mode, mockId, limitReached, onRecord, onGraded, onOpenUpgrade }: AttemptPanelProps) {
  const startedAt = useRef(Date.now());
  const [answer, setAnswer] = useState<QuizAnswer>(() => (entry.quiz ? emptyAnswer(entry.quiz) : null));
  const [written, setWritten] = useState('');
  const [showReference, setShowReference] = useState(false);
  const [graded, setGraded] = useState<GradedResult | null>(null);
  const [save, setSave] = useState<SaveState>({ state: 'idle' });
  const pending = useRef<PracticeAttempt | null>(null);
  const feedback = getFeedbackClient().availability();

  useEffect(() => { startedAt.current = Date.now(); }, [entry.id]);

  const send = async (attempt: PracticeAttempt) => {
    pending.current = attempt;
    setSave({ state: 'saving' });
    const res = await onRecord(attempt);
    if (res.success) setSave({ state: 'saved' });
    else setSave({ state: 'error', message: res.error, retryable: res.code === 'network' });
  };

  const grade = (result: PracticeOutcome | number) => {
    const attempt = buildAttempt(entry, {
      grading: typeof result === 'number' ? 'quiz' : 'self',
      result,
      mode,
      mockId,
      durationS: (Date.now() - startedAt.current) / 1000,
    });
    const g = { outcome: attempt.outcome, score: attempt.score };
    setGraded(g);
    onGraded?.(g);
    void send(attempt);
  };

  const checkQuiz = () => {
    if (!entry.quiz) return;
    grade(gradeQuizItem(entry.quiz, answer).score);
  };

  const closed = limitReached && !graded;
  const quizAnswered =
    entry.quiz?.kind === 'mcq' ? ((answer as number[] | null)?.length ?? 0) > 0
      : entry.quiz?.kind === 'fill_in' ? ((answer as string[] | null) ?? []).some((v) => v.trim() !== '')
        : true;

  return (
    <section aria-label="Your attempt" className="flex flex-col gap-4">
      {entry.quiz && (
        <QuizInput item={entry.quiz} answer={answer} onChange={setAnswer} disabled={!!graded || closed} />
      )}

      {entry.kind === 'question' && (
        <Field
          label="Your answer"
          hint="Write it as you would say it in the interview. Your answer stays on this device."
          labelAside={<span className="text-caption tabular-nums text-fg-subtle">{written.length}/{ANSWER_MAX_CHARS}</span>}
        >
          <Textarea rows={6} autoResize maxRows={14} maxLength={ANSWER_MAX_CHARS} value={written} onChange={(e) => setWritten(e.target.value)} />
        </Field>
      )}

      {entry.kind === 'question' && (
        <Card variant="sunken" padding="sm" className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-body font-strong text-fg">
            <Sparkles className="size-4 text-fg-muted" aria-hidden="true" />
            AI feedback
            <Badge size="sm">{feedback.available ? 'Pro' : 'Not available yet'}</Badge>
          </div>
          <p className="text-caption text-fg-muted">
            {feedback.available ? 'Scores your answer on each rubric point and quotes the part it is based on.' : feedback.reason}
          </p>
          <ul className="flex flex-wrap gap-1.5" aria-label="Rubric">
            {ANSWER_RUBRIC.map((r) => <li key={r.id}><Badge variant="outline" size="sm" title={r.description}>{r.label}</Badge></li>)}
          </ul>
          <div>
            <Button size="sm" variant="secondary" disabled aria-disabled="true">Get AI feedback</Button>
          </div>
        </Card>
      )}

      {entry.referenceAnswer && entry.kind !== 'quiz' && (
        <div className="flex flex-col gap-2">
          <Button size="sm" variant="ghost" className="self-start" aria-expanded={showReference} onClick={() => setShowReference((v) => !v)}>
            {showReference ? 'Hide reference answer' : 'Show reference answer'}
          </Button>
          {showReference && (
            <pre className="whitespace-pre-wrap rounded-md border border-line bg-surface-sunken p-3 font-sans text-body text-fg">{entry.referenceAnswer}</pre>
          )}
        </div>
      )}

      {closed ? (
        <Card padding="md" className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-body font-strong text-fg">Today’s free practice is used up</div>
            <div className="text-caption text-fg-subtle">The free plan includes {FREE_DAILY} graded attempts a day. They reset at 05:30 IST.</div>
          </div>
          {onOpenUpgrade && <Button onClick={onOpenUpgrade}>Upgrade</Button>}
        </Card>
      ) : graded ? (
        <div role="status" className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-body font-strong text-fg">
            {graded.outcome === 'solved'
              ? <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
              : <CircleSlash className="size-4 text-fg-muted" aria-hidden="true" />}
            {entry.quiz
              ? graded.outcome === 'solved' ? 'Correct' : graded.outcome === 'partial' ? `Partly correct (${Math.round(graded.score * 100)}%)` : 'Not correct'
              : `Marked: ${SELF_GRADES.find((s) => s.outcome === graded.outcome)?.label}`}
          </div>
          {entry.quiz && graded.outcome !== 'solved' && entry.referenceAnswer && <p className="text-body text-fg-muted">{entry.referenceAnswer}</p>}
          <SaveStatus save={save} onRetry={() => pending.current && void send(pending.current)} />
        </div>
      ) : entry.quiz ? (
        <div>
          <Button onClick={checkQuiz} disabled={!quizAnswered}>Check answer</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <span id={`grade-${entry.id}`} className="text-label font-strong text-fg">How did it go?</span>
          <div role="group" aria-labelledby={`grade-${entry.id}`} className="flex flex-wrap gap-2">
            {SELF_GRADES.map((s) => (
              <Button key={s.outcome} variant={s.outcome === 'solved' ? 'primary' : 'secondary'} onClick={() => grade(s.outcome)}>{s.label}</Button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function SaveStatus({ save, onRetry }: { save: SaveState; onRetry: () => void }) {
  if (save.state === 'idle') return null;
  if (save.state === 'saving') return <p className="text-caption text-fg-subtle">Saving attempt…</p>;
  if (save.state === 'saved') return <p className="text-caption text-fg-subtle">Attempt saved.</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-caption text-danger-fg">Not saved: {save.message}</p>
      {save.retryable && <Button size="sm" variant="secondary" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

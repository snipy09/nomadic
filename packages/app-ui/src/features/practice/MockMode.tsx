import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Timer } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Field, Select } from '@nomadic/ui';
import { randomUuid, type PracticeAttempt } from '@job-automator/learning';
import type { PracticeEntry, PracticeRecordResult } from '@nomadic/app-core/shared/ipc';
import { AttemptPanel, type GradedResult } from './AttemptPanel';
import { openProblemLink } from './EntryDetail';
import { DifficultyBadge, KIND_LABEL } from './EntryList';
import { formatClock, pickMockSet, scoreMock, suggestedMinutes } from './practiceLogic';

interface MockModeProps {
  /** Entries matching the current filters; the mock draws from these. */
  pool: PracticeEntry[];
  limitReached: boolean;
  /** Attempts left today on a limited plan (null = unlimited or unknown). */
  remainingToday: number | null;
  onRecord: (attempt: PracticeAttempt) => Promise<PracticeRecordResult>;
  onOpenUpgrade?: () => void;
  onExit: () => void;
}

type Running = { mockId: string; set: PracticeEntry[]; endAt: number; minutes: number };

const COUNTS = [3, 5, 10];
const TIMES = ['auto', '15', '30', '45', '60', '90'];

export function MockMode({ pool, limitReached, remainingToday, onRecord, onOpenUpgrade, onExit }: MockModeProps) {
  const [count, setCount] = useState('5');
  const [time, setTime] = useState('auto');
  const [run, setRun] = useState<Running | null>(null);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Map<string, GradedResult>>(new Map());
  const [done, setDone] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const start = () => {
    const set = pickMockSet(pool, Number(count));
    const minutes = time === 'auto' ? suggestedMinutes(set) : Number(time);
    setRun({ mockId: randomUuid(), set, minutes, endAt: Date.now() + minutes * 60_000 });
    setIndex(0);
    setResults(new Map());
    setDone(false);
    setNow(Date.now());
  };

  const remaining = run ? Math.max(0, Math.round((run.endAt - now) / 1000)) : 0;

  useEffect(() => {
    if (!run || done) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [run, done]);

  useEffect(() => {
    if (run && !done && remaining === 0) setDone(true);
  }, [run, done, remaining]);

  const summary = useMemo(
    () => (run ? scoreMock(run.set.map((entry) => ({ entry, outcome: results.get(entry.id)?.outcome ?? null, score: results.get(entry.id)?.score ?? 0 }))) : null),
    [run, results],
  );

  if (!run) {
    return (
      <Card padding="lg" className="flex max-w-2xl flex-col gap-4">
        <div>
          <h2 className="text-heading font-strong text-fg">Timed mock interview</h2>
          <p className="text-body text-fg-muted">
            A random set from your current filters ({pool.length} {pool.length === 1 ? 'question' : 'questions'} available) against the clock.
            Quiz items are checked automatically; for problems and written questions you mark how it went.
          </p>
        </div>
        {pool.length === 0 ? (
          <EmptyState size="sm" title="Nothing to draw from" description="Your filters match no questions. Change them on the Browse tab." actions={<Button variant="secondary" onClick={onExit}>Back to browse</Button>} />
        ) : (
          <>
            <div className="flex flex-wrap gap-4">
              <Field label="Questions">
                <Select value={count} onValueChange={setCount} options={COUNTS.map((n) => ({ value: String(n), label: `${n} questions`, disabled: n > pool.length && n !== COUNTS[0] }))} />
              </Field>
              <Field label="Time">
                <Select value={time} onValueChange={setTime} options={TIMES.map((t) => ({ value: t, label: t === 'auto' ? 'Suggested for the set' : `${t} minutes` }))} />
              </Field>
            </div>
            {remainingToday !== null && (
              <p className="text-caption text-fg-subtle">Each graded question uses one of today’s practice attempts ({remainingToday} left).</p>
            )}
            <div className="flex gap-2">
              <Button onClick={start} disabled={limitReached}>Start mock</Button>
              <Button variant="ghost" onClick={onExit}>Cancel</Button>
            </div>
          </>
        )}
      </Card>
    );
  }

  if (done && summary) {
    return (
      <Card padding="lg" className="flex flex-col gap-4" aria-labelledby="mock-summary-title">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 id="mock-summary-title" className="text-heading font-strong text-fg">Mock finished</h2>
          <span className="text-title font-strong tabular-nums text-fg">{summary.percent}%</span>
        </div>
        <p className="text-body text-fg-muted">
          {summary.solved} solved, {summary.partial} partly, {summary.unsolved} not solved, {summary.skipped} not answered, out of {summary.total}.
        </p>
        {summary.topics.length > 0 && (
          <section aria-label="By topic" className="flex flex-col gap-1.5">
            <h3 className="text-label font-strong text-fg">By topic</h3>
            <ul className="flex flex-col gap-1">
              {summary.topics.slice(0, 8).map((t) => (
                <li key={t.topic} className="flex items-center justify-between gap-3 text-body text-fg">
                  <span className="truncate">{t.topic}</span>
                  <span className="tabular-nums text-fg-subtle">{t.percent}%</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <ol className="flex flex-col gap-1" aria-label="Questions">
          {run.set.map((e, i) => {
            const r = results.get(e.id);
            return (
              <li key={e.id} className="flex items-center gap-2 text-body text-fg">
                <span className="w-5 text-caption tabular-nums text-fg-subtle">{i + 1}.</span>
                <span className="min-w-0 flex-1 truncate">{e.title}</span>
                <Badge size="sm" tone={r?.outcome === 'solved' ? 'success' : r?.outcome === 'partial' ? 'warning' : 'neutral'}>
                  {r ? (r.outcome === 'solved' ? 'Solved' : r.outcome === 'partial' ? 'Partly' : 'Not solved') : 'Not answered'}
                </Badge>
              </li>
            );
          })}
        </ol>
        <div className="flex gap-2">
          <Button onClick={() => setRun(null)}>New mock</Button>
          <Button variant="ghost" onClick={onExit}>Back to browse</Button>
        </div>
      </Card>
    );
  }

  const entry = run.set[index];
  const graded = results.get(entry.id);
  const last = index === run.set.length - 1;
  return (
    <Card padding="lg" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-label font-strong text-fg">Question {index + 1} of {run.set.length}</span>
        <span className="flex items-center gap-1.5 text-body tabular-nums text-fg" role="timer" aria-label={`Time left ${formatClock(remaining)}`}>
          <Timer className="size-4 text-fg-muted" aria-hidden="true" />
          {formatClock(remaining)}
        </span>
        <Button className="ml-auto" size="sm" variant="ghost" onClick={() => setDone(true)}>End mock</Button>
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-heading font-strong text-fg">{entry.title}</h2>
        <div className="flex flex-wrap items-center gap-1.5 text-caption text-fg-subtle">
          <span>{KIND_LABEL[entry.kind]}</span>
          <DifficultyBadge difficulty={entry.difficulty} />
          {entry.topics.slice(0, 4).map((t) => <span key={t}>· {t}</span>)}
        </div>
      </div>
      {entry.link && (
        <Button className="self-start" variant="secondary" leftIcon={<ExternalLink />} onClick={() => openProblemLink(entry.link!)}>Open problem</Button>
      )}
      {entry.prompt && entry.prompt !== entry.title && <p className="whitespace-pre-wrap text-body text-fg">{entry.prompt}</p>}
      <AttemptPanel
        key={`${run.mockId}-${entry.id}`}
        entry={entry}
        mode="mock"
        mockId={run.mockId}
        limitReached={limitReached}
        onRecord={onRecord}
        onOpenUpgrade={onOpenUpgrade}
        onGraded={(g) => setResults((m) => new Map(m).set(entry.id, g))}
      />
      <div className="flex justify-end gap-2 border-t border-line pt-3">
        {last ? (
          <Button onClick={() => setDone(true)}>Finish</Button>
        ) : (
          <Button variant={graded ? 'primary' : 'secondary'} onClick={() => setIndex((i) => i + 1)}>{graded ? 'Next question' : 'Skip'}</Button>
        )}
      </div>
    </Card>
  );
}

import React, { useId, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, XCircle } from 'lucide-react';
import { Button, Checkbox, Field, IconButton, Input, RadioGroup } from '@nomadic/ui';
import type { GradeResult, QuizAnswer } from '@job-automator/learning';
import type { QuizItem } from './content';
import { InlineText } from './InlineText';
import { gradeAll, shuffledSteps } from './quizLogic';

interface QuizFormProps {
  items: QuizItem[];
  /** Accessible name of the form, e.g. "Lesson check". */
  label: string;
  submitLabel: string;
  disabled?: boolean;
  /** Records the graded attempt; the form shows results only when it resolves ok. */
  onSubmit: (grades: GradeResult[]) => Promise<{ ok: boolean; error?: string }>;
  /** Shown above the per-question feedback after a successful submit. */
  renderResult?: (grades: GradeResult[], reset: () => void) => React.ReactNode;
}

function initialAnswer(item: QuizItem): QuizAnswer {
  if (item.kind === 'ordering') return shuffledSteps(item.id, item.items);
  if (item.kind === 'fill_in') return item.blanks.map(() => '');
  return [];
}

function isAnswered(item: QuizItem, a: QuizAnswer): boolean {
  if (!a) return false;
  if (item.kind === 'mcq') return a.length > 0;
  if (item.kind === 'fill_in') return (a as string[]).every((s) => s.trim().length > 0);
  return true;
}

function correctAnswerText(item: QuizItem): string {
  if (item.kind === 'mcq') return item.correct.map((i) => item.options[i]).join(', ');
  if (item.kind === 'fill_in') return item.blanks.map((b) => b[0]).join(', ');
  return item.items.map((s, i) => `${i + 1}. ${s}`).join('  ');
}

/** One or more quiz questions graded together. Keyboard-only usable (radios, checkboxes, inputs, move buttons). */
export function QuizForm({ items, label, submitLabel, disabled, onSubmit, renderResult }: QuizFormProps) {
  const initial = useMemo(() => Object.fromEntries(items.map((it) => [it.id, initialAnswer(it)])), [items]);
  const [answers, setAnswers] = useState<Record<string, QuizAnswer>>(initial);
  const [grades, setGrades] = useState<GradeResult[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formId = useId();

  const set = (id: string, a: QuizAnswer) => setAnswers((prev) => ({ ...prev, [id]: a }));
  const reset = () => { setAnswers(initial); setGrades(null); setError(null); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (grades || saving) return;
    const missing = items.findIndex((it) => !isAnswered(it, answers[it.id]));
    if (missing >= 0) {
      setError(`Answer question ${missing + 1} first.`);
      document.getElementById(`${formId}-q${missing}`)?.focus();
      return;
    }
    const g = gradeAll(items, answers);
    setSaving(true);
    setError(null);
    const res = await onSubmit(g);
    setSaving(false);
    if (res.ok) setGrades(g);
    else setError(res.error || 'Your answers were not saved. Try again.');
  };

  return (
    <form aria-label={label} noValidate onSubmit={submit} className="flex flex-col gap-4">
      {grades && renderResult && <div aria-live="polite">{renderResult(grades, reset)}</div>}
      <ol className="flex flex-col gap-4">
        {items.map((item, i) => {
          const g = grades?.[i];
          const legendId = `${formId}-q${i}-legend`;
          return (
            <li key={item.id}>
              <fieldset
                className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4"
                aria-describedby={g ? `${formId}-q${i}-fb` : undefined}
                disabled={Boolean(grades) || saving || disabled}
              >
                <legend id={legendId} className="sr-only">Question {i + 1} of {items.length}</legend>
                <p id={`${formId}-q${i}`} tabIndex={-1} className="text-body text-fg outline-none">
                  <span className="mr-2 text-caption text-fg-subtle">{i + 1}/{items.length}</span>
                  <InlineText text={item.prompt} />
                </p>
                <ItemInput item={item} answer={answers[item.id]} onChange={(a) => set(item.id, a)} labelledBy={`${formId}-q${i}`} />
                {g && (
                  <div id={`${formId}-q${i}-fb`} className={`flex items-start gap-2 text-body ${g.correct ? 'text-success-fg' : 'text-danger-fg'}`}>
                    {g.correct ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
                    <span>
                      {g.correct ? 'Correct.' : <>Not quite. Answer: <InlineText text={correctAnswerText(item)} />.</>}
                      {item.explanation && <span className="text-fg-muted"> <InlineText text={item.explanation} /></span>}
                    </span>
                  </div>
                )}
              </fieldset>
            </li>
          );
        })}
      </ol>
      {error && <p role="alert" className="text-body text-danger-fg">{error}</p>}
      {!grades && (
        <div>
          <Button type="submit" loading={saving} loadingText="Saving…" disabled={disabled}>{submitLabel}</Button>
        </div>
      )}
    </form>
  );
}

function ItemInput({ item, answer, onChange, labelledBy }: { item: QuizItem; answer: QuizAnswer; onChange: (a: QuizAnswer) => void; labelledBy: string }) {
  if (item.kind === 'mcq') {
    const selected = (answer as number[] | null) ?? [];
    if (item.correct.length > 1) {
      return (
        <div role="group" aria-labelledby={labelledBy} className="flex flex-col gap-2">
          <span className="text-caption text-fg-subtle">Select all that apply.</span>
          {item.options.map((o, idx) => (
            <Checkbox
              key={o}
              label={<InlineText text={o} />}
              checked={selected.includes(idx)}
              onCheckedChange={(c) => onChange(c ? [...selected, idx].sort() : selected.filter((x) => x !== idx))}
            />
          ))}
        </div>
      );
    }
    return (
      <RadioGroup
        aria-labelledby={labelledBy}
        value={selected.length ? String(selected[0]) : ''}
        onValueChange={(v) => onChange([Number(v)])}
        options={item.options.map((o, idx) => ({ value: String(idx), label: <InlineText text={o} /> }))}
      />
    );
  }
  if (item.kind === 'fill_in') {
    const values = (answer as string[] | null) ?? item.blanks.map(() => '');
    return (
      <div className="flex flex-wrap gap-3">
        {item.blanks.map((_, b) => (
          <Field key={b} label={item.blanks.length > 1 ? `Blank ${b + 1}` : 'Your answer'} className="min-w-[200px]">
            <Input
              value={values[b] ?? ''}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => onChange(values.map((v, k) => (k === b ? e.target.value : v)))}
            />
          </Field>
        ))}
      </div>
    );
  }
  if (item.kind === 'ordering') {
    const order = (answer as string[] | null) ?? item.items;
    const move = (from: number, to: number) => {
      if (to < 0 || to >= order.length) return;
      const next = [...order];
      [next[from], next[to]] = [next[to], next[from]];
      onChange(next);
    };
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-caption text-fg-subtle">Put the steps in order with the move buttons.</span>
        <ol aria-labelledby={labelledBy} className="flex flex-col gap-1.5">
          {order.map((step, idx) => (
            <li key={step} className="flex items-center gap-2 rounded-md border border-line bg-surface-sunken px-2 py-1.5 text-body text-fg">
              <span className="w-5 text-caption text-fg-subtle">{idx + 1}.</span>
              <span className="flex-1"><InlineText text={step} /></span>
              <IconButton label={`Move "${step}" up`} icon={<ArrowUp />} size="sm" tooltip={false} disabled={idx === 0} onClick={() => move(idx, idx - 1)} />
              <IconButton label={`Move "${step}" down`} icon={<ArrowDown />} size="sm" tooltip={false} disabled={idx === order.length - 1} onClick={() => move(idx, idx + 1)} />
            </li>
          ))}
        </ol>
      </div>
    );
  }
  return null;
}

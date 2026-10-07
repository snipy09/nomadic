import { useMemo } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Checkbox, IconButton, Input, RadioGroup } from '@nomadic/ui';
import type { QuizAnswer } from '@job-automator/learning';
import type { PracticeQuizItem } from '@nomadic/app-core/shared/ipc';
import { pickMockSet, seededRandom } from './practiceLogic';

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

/** Steps in a stable shuffled order (never the correct order when avoidable). */
export function initialOrder(item: Extract<PracticeQuizItem, { kind: 'ordering' }>): string[] {
  const order = pickMockSet(item.items, item.items.length, seededRandom(hash(item.id)));
  if (order.every((s, i) => s === item.items[i]) && order.length > 1) order.push(order.shift()!);
  return order;
}

export const emptyAnswer = (item: PracticeQuizItem): QuizAnswer =>
  item.kind === 'mcq' ? [] : item.kind === 'fill_in' ? item.blanks.map(() => '') : initialOrder(item);

interface QuizInputProps {
  item: PracticeQuizItem;
  answer: QuizAnswer;
  onChange: (answer: QuizAnswer) => void;
  disabled?: boolean;
}

/** Answer controls for a quiz item; every control is keyboard operable. */
export function QuizInput({ item, answer, onChange, disabled }: QuizInputProps) {
  const labelId = useMemo(() => `quiz-${item.id}`, [item.id]);

  if (item.kind === 'mcq') {
    const selected = (answer as number[] | null) ?? [];
    if (item.correct.length > 1) {
      return (
        <fieldset className="flex flex-col gap-2" aria-describedby={labelId}>
          <legend id={labelId} className="mb-1 text-caption text-fg-muted">Select all that apply.</legend>
          {item.options.map((opt, i) => (
            <Checkbox
              key={i}
              label={opt}
              disabled={disabled}
              checked={selected.includes(i)}
              onCheckedChange={(v) => onChange(v === true ? [...selected, i].sort((a, b) => a - b) : selected.filter((x) => x !== i))}
            />
          ))}
        </fieldset>
      );
    }
    return (
      <RadioGroup
        aria-label="Answer"
        disabled={disabled}
        value={selected.length ? String(selected[0]) : ''}
        onValueChange={(v) => onChange([Number(v)])}
        options={item.options.map((opt, i) => ({ value: String(i), label: opt }))}
      />
    );
  }

  if (item.kind === 'fill_in') {
    const values = (answer as string[] | null) ?? item.blanks.map(() => '');
    return (
      <div className="flex flex-col gap-2">
        {item.blanks.map((_, i) => (
          <Input
            key={i}
            aria-label={item.blanks.length > 1 ? `Blank ${i + 1}` : 'Your answer'}
            value={values[i] ?? ''}
            disabled={disabled}
            onChange={(e) => onChange(values.map((v, j) => (j === i ? e.target.value : v)))}
          />
        ))}
      </div>
    );
  }

  const order = (answer as string[] | null) ?? initialOrder(item);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    [next[from], next[to]] = [next[to], next[from]];
    onChange(next);
  };
  return (
    <ol className="flex flex-col gap-1.5" aria-label="Steps in order">
      {order.map((step, i) => (
        <li key={step} className="flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-body text-fg">
          <span className="w-5 text-caption tabular-nums text-fg-subtle">{i + 1}.</span>
          <span className="flex-1">{step}</span>
          <IconButton label={`Move "${step}" up`} icon={<ArrowUp />} size="sm" variant="ghost" tooltip={false} disabled={disabled || i === 0} onClick={() => move(i, i - 1)} />
          <IconButton label={`Move "${step}" down`} icon={<ArrowDown />} size="sm" variant="ghost" tooltip={false} disabled={disabled || i === order.length - 1} onClick={() => move(i, i + 1)} />
        </li>
      ))}
    </ol>
  );
}

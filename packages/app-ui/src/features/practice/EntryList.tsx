import { ChevronRight } from 'lucide-react';
import { Badge, Button, cn, focusRing } from '@nomadic/ui';
import type { PracticeAttempt } from '@job-automator/learning';
import type { PracticeEntry } from '@nomadic/app-core/shared/ipc';

export const KIND_LABEL: Record<PracticeEntry['kind'], string> = {
  problem: 'Coding problem',
  question: 'Interview question',
  quiz: 'Quiz',
};

const DIFFICULTY_TONE = { easy: 'success', medium: 'warning', hard: 'danger' } as const;

export function DifficultyBadge({ difficulty }: { difficulty: PracticeEntry['difficulty'] }) {
  if (!difficulty) return null;
  return <Badge size="sm" tone={DIFFICULTY_TONE[difficulty]}>{difficulty[0].toUpperCase() + difficulty.slice(1)}</Badge>;
}

const OUTCOME_LABEL = { solved: 'Solved', partial: 'Partly', unsolved: 'Not solved' } as const;
const OUTCOME_TONE = { solved: 'success', partial: 'warning', unsolved: 'neutral' } as const;

interface EntryListProps {
  entries: PracticeEntry[];
  shown: number;
  onShowMore: () => void;
  onOpen: (entry: PracticeEntry) => void;
  latest: Map<string, PracticeAttempt>;
  /** Company whose frequency to show, when filtering by company. */
  company: string;
}

export function EntryList({ entries, shown, onShowMore, onOpen, latest, company }: EntryListProps) {
  const visible = entries.slice(0, shown);
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface" aria-label="Practice questions">
        {visible.map((e) => {
          const last = latest.get(e.id);
          const freq = company ? e.companies.find((c) => c.name === company)?.frequency : null;
          return (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onOpen(e)}
                className={cn('flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-hover', focusRing, 'focus-visible:outline-offset-[-2px]')}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="line-clamp-2 text-body font-strong text-fg">{e.title}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-caption text-fg-subtle">
                    <span>{KIND_LABEL[e.kind]}</span>
                    {e.topics.slice(0, 3).map((t) => <span key={t}>· {t}</span>)}
                    {e.topics.length > 3 && <span>· +{e.topics.length - 3}</span>}
                    {freq != null && <span>· frequency {Math.round(freq)}</span>}
                  </span>
                </div>
                <DifficultyBadge difficulty={e.difficulty} />
                {last && <Badge size="sm" tone={OUTCOME_TONE[last.outcome]} variant="outline">{OUTCOME_LABEL[last.outcome]}</Badge>}
                <ChevronRight className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      {entries.length > shown && (
        <div className="flex items-center justify-center gap-3">
          <span className="text-caption text-fg-subtle">Showing {shown} of {entries.length}</span>
          <Button variant="secondary" size="sm" onClick={onShowMore}>Show more</Button>
        </div>
      )}
    </div>
  );
}

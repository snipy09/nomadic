import { useMemo } from 'react';
import { TrendingDown } from 'lucide-react';
import { Button, Card } from '@nomadic/ui';
import { weakTopics, type PracticeAttempt } from '@job-automator/learning';

interface WeakTopicsCardProps {
  attempts: PracticeAttempt[];
  signedIn: boolean;
  onPractice: (topic: string) => void;
}

/** Topics where recent graded attempts score lowest (derived by `weakTopics` from @job-automator/learning). */
export function WeakTopicsCard({ attempts, signedIn, onPractice }: WeakTopicsCardProps) {
  const weak = useMemo(() => weakTopics(attempts), [attempts]);
  return (
    <Card padding="md" className="flex flex-col gap-3" aria-labelledby="weak-topics-title">
      <div className="flex items-center gap-2">
        <TrendingDown className="size-4 text-fg-muted" aria-hidden="true" />
        <h2 id="weak-topics-title" className="text-body font-strong text-fg">Weak topics</h2>
      </div>
      {weak.length === 0 ? (
        <p className="text-caption text-fg-muted">
          {!signedIn
            ? 'Sign in to save attempts and see which topics need more work.'
            : attempts.length === 0
              ? 'Grade a few attempts and the topics that need more work will show up here.'
              : 'Nothing weak yet: no topic with two or more attempts is below 60%.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {weak.map((w) => (
            <li key={w.topic} className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate text-body text-fg">{w.topic}</span>
              <span className="text-caption tabular-nums text-fg-subtle">{Math.round(w.score * 100)}% over {w.attempts}</span>
              <Button size="sm" variant="secondary" aria-label={`Practise ${w.topic}`} onClick={() => onPractice(w.topic)}>Practise</Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

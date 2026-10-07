import React from 'react';
import { Bookmark, BookmarkCheck, Eye, EyeOff } from 'lucide-react';
import { Badge, Button, Checkbox, IconButton, ProgressRing, cn } from '@nomadic/ui';
import { HIGH_MATCH, postedLabel, type ScoredJob } from './feedLogic';
import { CompanyLogo } from './CompanyLogo';

interface JobCardProps {
  job: ScoredJob;
  saved: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onToggleSave: () => void;
  /** Marked "Not interested": the card offers "Show again" instead. */
  hidden?: boolean;
  onToggleHidden?: () => void;
  onOpen: () => void;
  onApply: () => void;
  applyDisabled?: boolean;
  /** "Apply" on the desktop; the phone app says "Auto apply from desktop". */
  applyLabel?: string;
  /** Batch selection for apply (desktop only). */
  selectable?: boolean;
}

const NO_MATCH_HINT = 'No skills to compare: add skills to your profile, or this listing names no skills or known role';
const ESTIMATED_HINT = 'This listing names no skills; estimated from the core skills of the role in its title';

export function MatchBadge({ job }: { job: ScoredJob }) {
  if (!job.match) return <Badge tone="neutral" size="sm" title={NO_MATCH_HINT}>No match data</Badge>;
  const tone = job.match.score >= HIGH_MATCH ? 'success' : job.match.score >= 40 ? 'accent' : 'neutral';
  const est = job.match.estimated;
  return <Badge tone={tone} size="sm" title={est ? ESTIMATED_HINT : undefined}>{est ? '~' : ''}{job.match.score}% match</Badge>;
}

function MatchRing({ job }: { job: ScoredJob }) {
  if (!job.match) return null;
  const score = job.match.score;
  const est = job.match.estimated;
  const tone = score >= HIGH_MATCH ? 'success' : score >= 40 ? 'accent' : 'warning';
  return (
    <div className="flex shrink-0 flex-col items-center" title={est ? ESTIMATED_HINT : 'How many of the listed skills you have'}>
      <ProgressRing value={score} size={40} thickness={3.5} tone={tone} showValue label={`${est ? 'Estimated ' : ''}${score}% match`} />
      <span className="mt-0.5 text-[10px] leading-3 text-fg-subtle">{est ? 'est.' : 'match'}</span>
    </div>
  );
}

export const JobCard = React.memo(function JobCard({ job, saved, selected, onToggleSelect, onToggleSave, hidden, onToggleHidden, onOpen, onApply, applyDisabled, applyLabel = 'Apply', selectable = true }: JobCardProps) {
  const posted = postedLabel(job.createdAt);
  const missing = job.match?.missing ?? [];
  const meta = [job.location, job.employmentType === 'internship' ? 'Internship' : '', posted].filter(Boolean);
  return (
    <article
      data-selected={selected || undefined}
      className={cn(
        'group relative flex w-full flex-col gap-3 rounded-lg border border-line bg-surface p-4 text-fg transition-[border-color,box-shadow] duration-fast ease-standard',
        'hover:border-line-strong hover:shadow-e2 focus-within:border-line-strong',
        selected && 'border-accent ring-1 ring-inset ring-accent',
      )}
    >
      <div className="flex items-start gap-3">
        <CompanyLogo company={job.company} url={job.applyUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-caption text-fg-muted">{job.company}</p>
          <button type="button" onClick={onOpen} className="block w-full rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <h3 className="line-clamp-2 text-body-lg font-strong text-fg group-hover:text-accent">{job.title}</h3>
          </button>
          {meta.length > 0 && <p className="mt-1 truncate text-caption text-fg-subtle">{meta.join(' · ')}</p>}
        </div>
        <MatchRing job={job} />
      </div>

      {missing.length > 0 && (
        <p className="line-clamp-1 text-caption text-fg-muted" title={missing.join(', ')}>
          <span className="text-fg-subtle">To learn: </span>
          {missing.slice(0, 2).join(', ')}{missing.length > 2 ? ` +${missing.length - 2}` : ''}
        </p>
      )}

      <div className="mt-auto flex items-center gap-1 border-t border-line pt-3">
        {selectable && <Checkbox checked={selected} onCheckedChange={onToggleSelect} aria-label={`Select ${job.title} at ${job.company}`} className="mr-1" />}
        <IconButton
          label={saved ? 'Remove from saved' : 'Save job'}
          icon={saved ? <BookmarkCheck /> : <Bookmark />}
          pressed={saved}
          variant="ghost"
          size="sm"
          onClick={onToggleSave}
        />
        {onToggleHidden && (
          <IconButton
            label={hidden ? 'Show this job again' : 'Not interested (hide this job)'}
            icon={hidden ? <Eye /> : <EyeOff />}
            variant="ghost"
            size="sm"
            onClick={onToggleHidden}
          />
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={onOpen} aria-label={`Details for ${job.title}`}>Details</Button>
          <Button size="sm" onClick={onApply} disabled={applyDisabled} aria-label={applyLabel === 'Apply' ? undefined : `${applyLabel}: ${job.title} at ${job.company}`}>{applyLabel}</Button>
        </div>
      </div>
    </article>
  );
});

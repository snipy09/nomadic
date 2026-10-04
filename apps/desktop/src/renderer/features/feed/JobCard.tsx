import React from 'react';
import { Bookmark, BookmarkCheck, Clock, Eye, EyeOff, MapPin } from 'lucide-react';
import { Badge, Button, Checkbox, IconButton, ProgressRing, cn } from '@nomadic/ui';
import { HIGH_MATCH, postedLabel, type ScoredJob } from './feedLogic';

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
}

const MONOGRAM_TONES = [
  'bg-accent-subtle text-accent-subtle-fg',
  'bg-success-subtle text-success-fg',
  'bg-warning-subtle text-warning-fg',
  'bg-danger-subtle text-danger-fg',
  'bg-surface-sunken text-fg',
];

/** Stable colour per company so the same company always looks the same. */
export function monogramTone(company: string): string {
  let h = 0;
  for (let i = 0; i < company.length; i++) h = (h * 31 + company.charCodeAt(i)) >>> 0;
  return MONOGRAM_TONES[h % MONOGRAM_TONES.length];
}

export function CompanyMonogram({ company, size = 'md' }: { company: string; size?: 'md' | 'lg' }) {
  const letter = (company.trim()[0] || '?').toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md font-strong',
        size === 'lg' ? 'size-12 text-title' : 'size-10 text-heading',
        monogramTone(company),
      )}
    >
      {letter}
    </span>
  );
}

export function MatchBadge({ job }: { job: ScoredJob }) {
  if (!job.match) return <Badge tone="neutral" size="sm" title="Add skills to your profile to see a match">No match data</Badge>;
  const tone = job.match.score >= HIGH_MATCH ? 'success' : job.match.score >= 40 ? 'accent' : 'neutral';
  return <Badge tone={tone} size="sm">{job.match.score}% match</Badge>;
}

function MatchRing({ job }: { job: ScoredJob }) {
  if (!job.match) return <span className="text-caption text-fg-subtle" title="Add skills to your profile to see a match">No match data</span>;
  const score = job.match.score;
  const tone = score >= HIGH_MATCH ? 'success' : score >= 40 ? 'accent' : 'warning';
  return (
    <div className="flex flex-col items-center gap-0.5">
      <ProgressRing value={score} size={44} thickness={4} tone={tone} showValue label={`${score}% match`} />
      <span className="text-caption text-fg-subtle">match</span>
    </div>
  );
}

export const JobCard = React.memo(function JobCard({ job, saved, selected, onToggleSelect, onToggleSave, hidden, onToggleHidden, onOpen, onApply, applyDisabled }: JobCardProps) {
  const posted = postedLabel(job.createdAt);
  const missing = job.match?.missing ?? [];
  return (
    <article
      data-selected={selected || undefined}
      className={cn(
        'group relative flex w-full flex-col rounded-lg border border-line bg-surface text-fg transition-[border-color,box-shadow,transform] duration-fast ease-standard',
        'hover:-translate-y-px hover:border-line-strong hover:shadow-e2 focus-within:border-line-strong',
        selected && 'border-accent ring-1 ring-inset ring-accent',
      )}
    >
      <div className="flex items-start gap-3 p-4 pb-3">
        <CompanyMonogram company={job.company} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-caption font-strong uppercase tracking-wide text-fg-subtle">{job.company}</p>
          <button type="button" onClick={onOpen} className="mt-0.5 block w-full rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <h3 className="line-clamp-2 text-body-lg font-strong text-fg group-hover:text-accent">{job.title}</h3>
          </button>
        </div>
        <MatchRing job={job} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-4 text-caption text-fg-muted">
        {job.location && <span className="flex items-center gap-1 rounded bg-surface-sunken px-1.5 py-0.5"><MapPin className="size-3" aria-hidden="true" />{job.location}</span>}
        {job.employmentType === 'internship' && <span className="rounded bg-accent-subtle px-1.5 py-0.5 text-accent-subtle-fg">Internship</span>}
        {posted && <span className="flex items-center gap-1 px-1 text-fg-subtle"><Clock className="size-3" aria-hidden="true" />{posted}</span>}
        {job.source && <span className="px-1 text-fg-subtle">via {job.source}</span>}
      </div>

      {missing.length > 0 && (
        <div className="mt-3 px-4">
          <p className="mb-1 text-caption text-fg-subtle">Skills to add</p>
          <ul className="flex flex-wrap gap-1" aria-label="Missing skills">
            {missing.slice(0, 3).map((s) => (
              <li key={s} className="rounded border border-dashed border-line-strong px-1.5 py-0.5 text-caption text-fg-muted">{s}</li>
            ))}
            {missing.length > 3 && <li className="px-1 py-0.5 text-caption text-fg-subtle">+{missing.length - 3} more</li>}
          </ul>
        </div>
      )}

      <div className="mt-auto flex items-center gap-1 px-3 pb-3 pt-4">
        <Checkbox checked={selected} onCheckedChange={onToggleSelect} aria-label={`Select ${job.title} at ${job.company}`} className="mx-1" />
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
          <Button size="sm" variant="secondary" onClick={onOpen}>Details</Button>
          <Button size="sm" onClick={onApply} disabled={applyDisabled}>Apply</Button>
        </div>
      </div>
    </article>
  );
});

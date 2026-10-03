import React from 'react';
import { Bookmark, BookmarkCheck, Building2, Clock, MapPin } from 'lucide-react';
import { Badge, Button, Card, Checkbox, IconButton, cn } from '@nomadic/ui';
import { HIGH_MATCH, postedLabel, type ScoredJob } from './feedLogic';

interface JobCardProps {
  job: ScoredJob;
  saved: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onToggleSave: () => void;
  onOpen: () => void;
  onApply: () => void;
  applyDisabled?: boolean;
}

export function MatchBadge({ job }: { job: ScoredJob }) {
  if (!job.match) return <Badge tone="neutral" size="sm" title="Add skills to your profile to see a match">No match data</Badge>;
  const tone = job.match.score >= HIGH_MATCH ? 'success' : job.match.score >= 40 ? 'accent' : 'neutral';
  return <Badge tone={tone} size="sm">{job.match.score}% match</Badge>;
}

export const JobCard = React.memo(function JobCard({ job, saved, selected, onToggleSelect, onToggleSave, onOpen, onApply, applyDisabled }: JobCardProps) {
  const posted = postedLabel(job.createdAt);
  return (
    <Card padding="md" selected={selected} className={cn('flex flex-col gap-3')}>
      <div className="flex items-start gap-3">
        <Checkbox checked={selected} onCheckedChange={onToggleSelect} aria-label={`Select ${job.title} at ${job.company}`} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onOpen} className="block w-full rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <h3 className="line-clamp-2 text-body font-strong text-fg">{job.title}</h3>
            <p className="mt-0.5 flex items-center gap-1 truncate text-caption text-fg-muted"><Building2 className="size-3.5 shrink-0" aria-hidden="true" />{job.company}</p>
          </button>
        </div>
        <MatchBadge job={job} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-fg-subtle">
        {job.location && <span className="flex items-center gap-1"><MapPin className="size-3.5" aria-hidden="true" />{job.location}</span>}
        {posted && <span className="flex items-center gap-1"><Clock className="size-3.5" aria-hidden="true" />{posted}</span>}
        {job.employmentType === 'internship' && <Badge size="sm" tone="neutral">Internship</Badge>}
        {job.source && <span>via {job.source}</span>}
      </div>
      {job.match && job.match.missing.length > 0 && (
        <p className="text-caption text-fg-muted">
          <span className="text-fg-subtle">Missing: </span>{job.match.missing.join(', ')}
        </p>
      )}
      <div className="mt-auto flex items-center gap-2 border-t border-line pt-3">
        <IconButton
          label={saved ? 'Remove from saved' : 'Save job'}
          icon={saved ? <BookmarkCheck /> : <Bookmark />}
          pressed={saved}
          variant="ghost"
          size="sm"
          onClick={onToggleSave}
        />
        <Button size="sm" variant="ghost" onClick={onOpen}>Details</Button>
        <Button size="sm" className="ml-auto" onClick={onApply} disabled={applyDisabled}>Apply</Button>
      </div>
    </Card>
  );
});

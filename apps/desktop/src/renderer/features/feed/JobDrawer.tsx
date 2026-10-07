import React from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import { Badge, Button, Drawer, DrawerContent } from '@nomadic/ui';
import { getApi } from '../../types';
import { postedLabel, type ScoredJob } from './feedLogic';
import { MatchBadge } from './JobCard';
import { IS_MOBILE } from '../../platform';

interface JobDrawerProps {
  job: ScoredJob | null;
  saved: boolean;
  onClose: () => void;
  onToggleSave: () => void;
  onApply: () => void;
  onCopied: () => void;
  onFindContacts?: () => void;
  applyLabel?: string;
}

export function JobDrawer({ job, saved, onClose, onToggleSave, onApply, onCopied, onFindContacts, applyLabel = 'Apply with review' }: JobDrawerProps) {
  const open = (url: string) => {
    const api = getApi();
    if (api.openExternalUrl) void api.openExternalUrl(url);
    else window.open(url, '_blank', 'noopener');
  };
  return (
    <Drawer open={Boolean(job)} onOpenChange={(o) => { if (!o) onClose(); }}>
      {job && (
        <DrawerContent side={IS_MOBILE ? 'bottom' : undefined}
          title={job.title}
          description={[job.company, job.location, postedLabel(job.createdAt), job.source ? `via ${job.source}` : ''].filter(Boolean).join(' · ')}
          size="lg"
          footer={
            <>
              <Button variant="ghost" onClick={onToggleSave}>{saved ? 'Saved' : 'Save'}</Button>
              {onFindContacts && <Button variant="ghost" onClick={onFindContacts}>Find contacts</Button>}
              <Button variant="secondary" rightIcon={<ExternalLink />} onClick={() => open(job.applyUrl)}>Open posting</Button>
              <Button onClick={onApply}>{applyLabel}</Button>
            </>
          }
        >
          <div className="flex flex-col gap-5">
            <section aria-labelledby="match-h" className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <h3 id="match-h" className="text-body font-strong text-fg">Your match</h3>
                <MatchBadge job={job} />
              </div>
              {job.match ? (
                <>
                  {job.match.estimated && (
                    <p className="text-caption text-fg-subtle">This listing names no skills, so the match is estimated from the core skills of the role in its title.</p>
                  )}
                  {job.match.matched.length > 0 && (
                    <div className="flex flex-wrap gap-1.5" aria-label="Skills you have">
                      {job.match.matched.map((s) => <Badge key={s} tone="success" size="sm">{s}</Badge>)}
                    </div>
                  )}
                  {job.match.missing.length > 0 && (
                    <p className="text-caption text-fg-muted">Top missing skills: {job.match.missing.join(', ')}</p>
                  )}
                </>
              ) : (
                <p className="text-caption text-fg-subtle">Add skills to your profile, or this posting names no recognisable skills or role.</p>
              )}
            </section>
            <section aria-labelledby="desc-h">
              <h3 id="desc-h" className="mb-1 text-body font-strong text-fg">Description</h3>
              <p className="whitespace-pre-line text-body text-fg-muted">{job.description?.trim() || 'The posting has no description. Open it to read the details.'}</p>
            </section>
            <section className="flex items-center gap-2 text-caption text-fg-subtle">
              <span className="truncate">{job.applyUrl}</span>
              <Button size="sm" variant="ghost" leftIcon={<Copy />} onClick={() => { void navigator.clipboard?.writeText(job.applyUrl); onCopied(); }}>Copy link</Button>
            </section>
          </div>
        </DrawerContent>
      )}
    </Drawer>
  );
}

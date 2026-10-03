import { ExternalLink } from 'lucide-react';
import { Badge, Button, Drawer, DrawerContent } from '@nomadic/ui';
import type { PracticeAttempt } from '@job-automator/learning';
import type { PracticeEntry, PracticeRecordResult } from '../../../shared/ipc';
import { getApi } from '../../types';
import { AttemptPanel } from './AttemptPanel';
import { KIND_LABEL, DifficultyBadge } from './EntryList';

/** Opens a dataset link in the system browser (https only). */
export function openProblemLink(url: string): void {
  if (!/^https:\/\//.test(url)) return;
  const api = getApi();
  if (api?.openExternalUrl) void api.openExternalUrl(url);
  else window.open(url, '_blank', 'noopener');
}

const providerOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'the source site';
  }
};

interface EntryDetailProps {
  entry: PracticeEntry | null;
  onClose: () => void;
  limitReached: boolean;
  onRecord: (attempt: PracticeAttempt) => Promise<PracticeRecordResult>;
  onOpenUpgrade?: () => void;
  onSelectTopic: (topic: string) => void;
}

export function EntryDetail({ entry, onClose, limitReached, onRecord, onOpenUpgrade, onSelectTopic }: EntryDetailProps) {
  return (
    <Drawer open={!!entry} onOpenChange={(open) => { if (!open) onClose(); }}>
      {entry && (
        <DrawerContent
          size="lg"
          title={entry.title}
          description={[KIND_LABEL[entry.kind], entry.companies.length ? `Asked at ${entry.companies.length} ${entry.companies.length === 1 ? 'company' : 'companies'}` : ''].filter(Boolean).join(' · ')}
          headerExtra={
            <div className="flex flex-wrap items-center gap-1.5">
              <DifficultyBadge difficulty={entry.difficulty} />
              {entry.topics.map((t) => (
                <Button key={t} size="sm" variant="ghost" className="h-6 px-2 text-caption" aria-label={`Show all ${t} practice`} onClick={() => { onSelectTopic(t); onClose(); }}>
                  {t}
                </Button>
              ))}
            </div>
          }
        >
          <div className="flex flex-col gap-5">
            {entry.link && (
              <div className="flex flex-col gap-1.5">
                <Button className="self-start" leftIcon={<ExternalLink />} onClick={() => openProblemLink(entry.link!)}>
                  Open problem on {providerOf(entry.link)}
                </Button>
                <p className="text-caption text-fg-subtle">Solve it there, then come back and mark how it went. There is no code runner in the app yet.</p>
              </div>
            )}

            {entry.prompt && entry.prompt !== entry.title && (
              <p className="whitespace-pre-wrap text-body text-fg">{entry.prompt}</p>
            )}

            {entry.companies.length > 0 && (
              <section aria-label="Companies" className="flex flex-col gap-1.5">
                <h3 className="text-label font-strong text-fg">Companies</h3>
                <ul className="flex flex-wrap gap-1.5">
                  {entry.companies.slice(0, 12).map((c) => (
                    <li key={c.name}><Badge size="sm" variant="outline">{c.name}</Badge></li>
                  ))}
                  {entry.companies.length > 12 && <li><Badge size="sm">+{entry.companies.length - 12} more</Badge></li>}
                </ul>
              </section>
            )}

            <AttemptPanel
              key={entry.id}
              entry={entry}
              mode="single"
              limitReached={limitReached}
              onRecord={onRecord}
              onOpenUpgrade={onOpenUpgrade}
            />
          </div>
        </DrawerContent>
      )}
    </Drawer>
  );
}

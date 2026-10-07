import React, { useEffect, useState } from 'react';
import { Flag, Search, UserPlus } from 'lucide-react';
import { Badge, Button, EmptyState, Input, Select, Skeleton, useToast } from '@nomadic/ui';
import type { DirectoryContact, OutreachContactKind, OutreachReportReason } from '@nomadic/app-core/shared/ipc';
import { OUTREACH_REPORT_REASONS } from '@nomadic/app-core/shared/ipc';
import { KIND_INFO, PICKABLE_KINDS, REPORT_REASON_LABELS } from './outreachLogic';
import { useDirectorySearch } from './useOutreach';

interface DirectoryPanelProps {
  initialCompany?: string;
  savedContactIds: Set<string>;
  onAdd: (c: DirectoryContact) => Promise<void>;
}

/** Search published contacts: addresses that companies and people list on their own pages. */
export function DirectoryPanel({ initialCompany = '', savedContactIds, onAdd }: DirectoryPanelProps) {
  const { toast } = useToast();
  const dir = useDirectorySearch();
  const [company, setCompany] = useState(initialCompany);
  const [kind, setKind] = useState<'all' | OutreachContactKind>('all');
  const [reporting, setReporting] = useState<string | null>(null);
  const [reason, setReason] = useState<OutreachReportReason>('bounced');

  const runSearch = () => void dir.search({ company: company.trim() || undefined, kinds: kind === 'all' ? undefined : [kind], limit: 25 });

  useEffect(() => {
    if (initialCompany.trim()) runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCompany]);

  const report = async (c: DirectoryContact) => {
    const a = window.api;
    if (!a?.outreachReportContact) return;
    const r = await a.outreachReportContact({ contactId: c.id, reason });
    setReporting(null);
    toast(r.success
      ? { title: 'Thanks for reporting', description: 'This contact will be checked and hidden if needed.', tone: 'success' }
      : { title: 'Report not sent', description: r.error ?? 'Try again.', tone: 'danger' });
  };

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
        aria-label="Search contacts"
      >
        <Input
          aria-label="Company"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Company, e.g. Razorpay"
          leftIcon={<Search />}
          wrapperClassName="min-w-[220px] flex-1"
        />
        <Select
          value={kind}
          onValueChange={(v) => setKind(v as 'all' | OutreachContactKind)}
          options={[{ value: 'all', label: 'Everyone' }, ...PICKABLE_KINDS.map((k) => ({ value: k, label: KIND_INFO[k].label }))]}
          className="w-48"
        />
        <Button type="submit" loading={dir.loading}>Search</Button>
      </form>

      {dir.rowsLeft !== null && <p className="text-caption text-fg-muted">{dir.rowsLeft} contact views left today on your plan.</p>}

      {dir.loading && !dir.contacts.length ? (
        <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : dir.error ? (
        <EmptyState bordered tone="danger" title="Search did not work" description={dir.error} actions={<Button variant="secondary" onClick={runSearch}>Try again</Button>} />
      ) : !dir.searched ? (
        <EmptyState bordered icon={<Search />} title="Find people who can refer you" description="Search a company to see recruiters, hiring managers, founders, employees and team inboxes it has published." />
      ) : dir.contacts.length === 0 ? (
        <EmptyState bordered title="No published contacts yet" description="Nobody at this company is listed yet. Add someone you know with Add person, using an address they share publicly." />
      ) : (
        <ul className="flex flex-col gap-2">
          {dir.contacts.map((c) => {
            const saved = savedContactIds.has(c.id);
            return (
              <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-line bg-surface p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-body font-strong text-fg">{c.name ?? c.email}</span>
                    <Badge size="sm" tone="neutral">{KIND_INFO[c.kind].label}</Badge>
                    {c.mxOk === false && <Badge size="sm" tone="warning">Mail server not found</Badge>}
                  </div>
                  <div className="text-caption text-fg-muted">
                    {[c.roleTitle, c.company, c.name ? c.email : null].filter(Boolean).join(' · ')}
                  </div>
                  {c.hiringFor && <div className="text-caption text-fg-muted">Hiring for {c.hiringFor}</div>}
                  {c.sourceUrl && (
                    <div className="truncate text-caption text-fg-subtle">Listed on {c.sourceUrl}</div>
                  )}
                  {reporting === c.id && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Select
                        value={reason}
                        onValueChange={(v) => setReason(v as OutreachReportReason)}
                        options={OUTREACH_REPORT_REASONS.map((r) => ({ value: r, label: REPORT_REASON_LABELS[r] }))}
                        size="sm"
                        className="w-56"
                      />
                      <Button size="sm" variant="danger" onClick={() => void report(c)}>Send report</Button>
                      <Button size="sm" variant="ghost" onClick={() => setReporting(null)}>Cancel</Button>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" leftIcon={<Flag />} onClick={() => setReporting(c.id)} aria-label={`Report ${c.name ?? c.email}`}>
                    Report
                  </Button>
                  <Button size="sm" variant={saved ? 'ghost' : 'secondary'} leftIcon={<UserPlus />} disabled={saved} onClick={() => void onAdd(c)}>
                    {saved ? 'Added' : 'Add'}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

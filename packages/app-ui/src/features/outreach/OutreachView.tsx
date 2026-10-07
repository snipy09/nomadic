import React, { useMemo, useState } from 'react';
import { Plus, Search, Trash2, Users } from 'lucide-react';
import {
  Badge, Button, Card, CardContent, EmptyState, IconButton, Input, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger, useToast,
} from '@nomadic/ui';
import type { MasterProfile } from '../../types';
import type { DirectoryContact, OutreachPerson } from '@nomadic/app-core/shared/ipc';
import { Composer } from './Composer';
import { DirectoryPanel } from './DirectoryPanel';
import { displayName, KIND_INFO, matchesPerson, messagesFor, PURPOSE_LABELS, senderFacts, STATUS_INFO } from './outreachLogic';
import { PersonForm } from './PersonForm';
import { SmtpPanel } from './SmtpPanel';
import { useOutreach } from './useOutreach';

interface OutreachViewProps {
  profile: MasterProfile;
  initialCompany?: string;
  onLog?: (msg: string) => void;
}

/**
 * Reach people who can refer you: find published contacts, keep a list of people,
 * write a message per person, review it and send it (or open it in Gmail/LinkedIn).
 */
export function OutreachView({ profile, initialCompany = '', onLog }: OutreachViewProps) {
  const { toast } = useToast();
  const outreach = useOutreach();
  const [tab, setTab] = useState(initialCompany ? 'find' : 'people');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messageId, setMessageId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<'add' | 'edit' | null>(null);
  const sender = useMemo(() => senderFacts(profile), [profile]);

  const people = outreach.people.filter((p) => matchesPerson(query, p));
  const selected = outreach.people.find((p) => p.id === selectedId) ?? null;
  const personMessages = selected ? messagesFor(outreach.messages, selected.id) : [];
  const activeMessage = messageId === 'new' ? null : personMessages.find((m) => m.id === messageId) ?? personMessages[0] ?? null;
  const savedContactIds = useMemo(() => new Set(outreach.people.map((p) => p.contactId).filter((x): x is string => Boolean(x))), [outreach.people]);

  const pick = (p: OutreachPerson) => {
    setSelectedId(p.id);
    setMessageId(null);
    setForm(null);
  };

  const addFromDirectory = async (c: DirectoryContact) => {
    const r = await outreach.savePerson({
      name: c.name,
      email: c.email,
      company: c.company,
      roleTitle: c.roleTitle,
      kind: c.kind,
      contactId: c.id,
      sourceUrl: c.sourceUrl,
    });
    if (!r.ok) {
      toast({ title: 'Not added', description: r.error, tone: 'danger' });
      return;
    }
    toast({ title: `${c.name ?? c.email} added`, description: 'Write them a message from People.', tone: 'success' });
    if (r.value.person) setSelectedId(r.value.person.id);
  };

  const removePerson = async (p: OutreachPerson) => {
    if (!window.confirm(`Remove ${displayName(p)} and their messages from this computer?`)) return;
    const r = await outreach.deletePerson(p.id);
    if (!r.ok) toast({ title: 'Not removed', description: r.error, tone: 'danger' });
    else if (selectedId === p.id) setSelectedId(null);
  };

  if (outreach.loading && !outreach.people.length && !outreach.error) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-headline font-bold text-fg">Outreach</h1>
          <p className="mt-1 max-w-2xl text-body text-fg-muted">
            Write to recruiters, hiring managers, founders, employees and alumni who can refer you. You review every message before it goes.
          </p>
        </div>
        <div className="text-right text-caption text-fg-muted">
          {outreach.sentToday} of {outreach.sendLimit} emails sent today
        </div>
      </header>

      {outreach.error && (
        <EmptyState bordered tone="danger" title="Outreach did not load" description={outreach.error} actions={<Button variant="secondary" onClick={() => void outreach.reload()}>Try again</Button>} />
      )}

      {!outreach.error && (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="people" count={outreach.people.length}>People</TabsTrigger>
            <TabsTrigger value="find">Find contacts</TabsTrigger>
            <TabsTrigger value="account">Email account</TabsTrigger>
          </TabsList>

          <TabsContent value="people" className="pt-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(240px,320px)_1fr]">
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex gap-2">
                  <Input aria-label="Filter people" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter" leftIcon={<Search />} wrapperClassName="flex-1" />
                  <Button leftIcon={<Plus />} onClick={() => { setForm('add'); setSelectedId(null); }}>Add person</Button>
                </div>
                {outreach.people.length === 0 ? (
                  <EmptyState
                    bordered
                    size="sm"
                    icon={<Users />}
                    title="No one yet"
                    description="Find published contacts or add someone you know."
                    actions={<Button size="sm" variant="secondary" onClick={() => setTab('find')}>Find contacts</Button>}
                  />
                ) : people.length === 0 ? (
                  <p className="p-3 text-caption text-fg-muted">No one matches “{query}”.</p>
                ) : (
                  <ul className="flex flex-col gap-1" aria-label="People">
                    {people.map((p) => {
                      const last = messagesFor(outreach.messages, p.id)[0];
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => pick(p)}
                            aria-current={selectedId === p.id ? 'true' : undefined}
                            className={`w-full rounded-md border px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent ${selectedId === p.id ? 'border-accent bg-accent-subtle' : 'border-line bg-surface hover:bg-surface-hover'}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-body font-strong text-fg">{displayName(p)}</span>
                              {last && <Badge size="sm" tone={STATUS_INFO[last.status].tone}>{STATUS_INFO[last.status].label}</Badge>}
                            </div>
                            <div className="truncate text-caption text-fg-muted">{[KIND_INFO[p.kind].label, p.company].join(' · ')}</div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="min-w-0">
                {form === 'add' || (form === 'edit' && selected) ? (
                  <Card>
                    <CardContent className="pt-4">
                      <PersonForm
                        initial={form === 'edit' ? selected ?? undefined : undefined}
                        defaultCompany={initialCompany}
                        onCancel={() => setForm(null)}
                        onSave={async (input) => {
                          const r = await outreach.savePerson(input);
                          if (!r.ok) return r.error;
                          setForm(null);
                          if (r.value.person) setSelectedId(r.value.person.id);
                          return null;
                        }}
                      />
                    </CardContent>
                  </Card>
                ) : selected ? (
                  <Card>
                    <CardContent className="flex flex-col gap-4 pt-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="text-body-lg font-strong text-fg">{displayName(selected)}</h2>
                          <p className="text-caption text-fg-muted">
                            {[selected.roleTitle, KIND_INFO[selected.kind].label, selected.company].filter(Boolean).join(' · ')}
                          </p>
                          <p className="text-caption text-fg-muted">{[selected.email, selected.linkedinUrl].filter(Boolean).join(' · ')}</p>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setForm('edit')}>Edit</Button>
                          <IconButton size="sm" variant="ghost" label={`Remove ${displayName(selected)}`} icon={<Trash2 />} onClick={() => void removePerson(selected)} />
                        </div>
                      </div>

                      {personMessages.length > 0 && (
                        <div className="flex flex-wrap gap-2" role="list" aria-label="Messages">
                          {personMessages.map((m) => (
                            <Button
                              key={m.id}
                              role="listitem"
                              size="sm"
                              variant={activeMessage?.id === m.id && messageId !== 'new' ? 'subtle' : 'ghost'}
                              onClick={() => setMessageId(m.id)}
                            >
                              {PURPOSE_LABELS[m.purpose]} · {STATUS_INFO[m.status].label}
                            </Button>
                          ))}
                          <Button size="sm" variant={messageId === 'new' ? 'subtle' : 'ghost'} leftIcon={<Plus />} onClick={() => setMessageId('new')}>New message</Button>
                        </div>
                      )}

                      <Composer
                        key={`${selected.id}-${messageId === 'new' ? 'new' : activeMessage?.id ?? 'none'}`}
                        person={selected}
                        message={messageId === 'new' ? null : activeMessage}
                        sender={sender}
                        outreach={outreach}
                        onSaved={(id) => setMessageId(id)}
                        onLog={onLog}
                      />
                    </CardContent>
                  </Card>
                ) : (
                  <EmptyState bordered title="Pick someone" description="Choose a person on the left to write to them, or add someone new." />
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="find" className="pt-4">
            <DirectoryPanel initialCompany={initialCompany} savedContactIds={savedContactIds} onAdd={addFromDirectory} />
          </TabsContent>

          <TabsContent value="account" className="pt-4">
            <SmtpPanel smtp={outreach.smtp} onChanged={() => void outreach.reload()} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

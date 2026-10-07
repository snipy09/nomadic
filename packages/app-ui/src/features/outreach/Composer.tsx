import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileText, Linkedin, Mail, Send, Sparkles } from 'lucide-react';
import { Badge, Button, Checkbox, Field, Input, Select, Textarea, useToast } from '@nomadic/ui';
import type { OutreachChannel, OutreachMessage, OutreachPerson, OutreachPurpose } from '@nomadic/app-core/shared/ipc';
import { OUTREACH_PURPOSES } from '@nomadic/app-core/shared/ipc';
import { draftProblems, LINKEDIN_NOTE_LIMIT, PURPOSE_LABELS, STATUS_INFO, templateFor, type SenderFacts } from './outreachLogic';
import type { useOutreach } from './useOutreach';

type Outreach = ReturnType<typeof useOutreach>;

interface ComposerProps {
  person: OutreachPerson;
  message: OutreachMessage | null;
  sender: SenderFacts;
  outreach: Outreach;
  onSaved: (id: number) => void;
  onLog?: (msg: string) => void;
}

interface Draft {
  channel: OutreachChannel;
  purpose: OutreachPurpose;
  jobTitle: string;
  subject: string;
  body: string;
}

function toDraft(m: OutreachMessage | null, person: OutreachPerson): Draft {
  if (m) return { channel: m.channel, purpose: m.purpose, jobTitle: m.jobTitle ?? '', subject: m.subject, body: m.body };
  return { channel: person.email ? 'email' : 'linkedin', purpose: 'referral', jobTitle: '', subject: '', body: '' };
}

/** Write, review and send one message. Sending is possible only after the user ticks the review box. */
export function Composer({ person, message, sender, outreach, onSaved, onLog }: ComposerProps) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft>(() => toDraft(message, person));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(toDraft(message, person));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message?.id, message?.updatedAt, person.id]);

  const saved = useMemo(() => toDraft(message, person), [message, person]);
  const dirty = !message || JSON.stringify(saved) !== JSON.stringify(draft);
  const problems = draftProblems(draft, person);
  const status = message?.status ?? 'draft';
  const locked = status !== 'draft' && status !== 'ready';
  const reviewed = status === 'ready' && !dirty;
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const act = async (label: string, fn: () => Promise<string | null>) => {
    setBusy(label);
    setError(null);
    const err = await fn();
    setBusy(null);
    if (err) setError(err);
  };

  const useTemplate = () => set(templateFor({ purpose: draft.purpose, channel: draft.channel, person, sender, jobTitle: draft.jobTitle }));

  const draftWithAi = () =>
    act('ai', async () => {
      const a = window.api;
      if (!a?.outreachDraftAi) return 'Nomadic AI is not available in this build.';
      const r = await a.outreachDraftAi({ personId: person.id, channel: draft.channel, purpose: draft.purpose, jobTitle: draft.jobTitle || null });
      if (!r.success) return r.error;
      set({ subject: draft.channel === 'email' ? r.subject ?? draft.subject : '', body: r.body ?? draft.body });
      toast({ title: 'Draft written', description: 'Read it, fix anything that is not true, then save and review.', tone: 'success' });
      return null;
    });

  const save = () =>
    act('save', async () => {
      const r = await outreach.saveMessage({
        id: message?.id,
        personId: person.id,
        channel: draft.channel,
        purpose: draft.purpose,
        jobTitle: draft.jobTitle.trim() || null,
        subject: draft.channel === 'email' ? draft.subject : '',
        body: draft.body,
      });
      if (!r.ok) return r.error;
      if (r.value.message) onSaved(r.value.message.id);
      return null;
    });

  const review = (checked: boolean) => {
    if (!message || !checked) return;
    void act('review', async () => {
      const r = await outreach.reviewMessage(message.id);
      return r.ok ? null : r.error;
    });
  };

  const send = () =>
    act('send', async () => {
      if (!message) return null;
      const r = await outreach.sendMessage(message.id);
      if (!r.ok) return r.error;
      onLog?.(`Outreach email sent to ${person.email} (${person.company}).`);
      toast({ title: 'Email sent', description: 'Added to your Tracker with a follow-up in a week.', tone: 'success' });
      return null;
    });

  const open = (via: 'gmail' | 'mailto' | 'linkedin') =>
    act(via, async () => {
      if (!message) return null;
      const r = await outreach.openMessage(message.id, via);
      if (!r.ok) return r.error;
      if (r.value.copied) toast({ title: 'Note copied', description: 'Paste it into the connection request, then mark it as sent here.', tone: 'neutral' });
      return null;
    });

  const mark = (s: 'sent' | 'replied' | 'no_reply' | 'bounced') =>
    act(`mark-${s}`, async () => {
      if (!message) return null;
      const r = await outreach.markMessage(message.id, s);
      return r.ok ? null : r.error;
    });

  const smtpReady = Boolean(outreach.smtp?.configured);
  const limitHit = outreach.sentToday >= outreach.sendLimit;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_INFO[status].tone}>{STATUS_INFO[status].label}</Badge>
        {message?.sentAt && <span className="text-caption text-fg-muted">Sent {new Date(message.sentAt).toLocaleString()}</span>}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Channel">
          <Select
            value={draft.channel}
            disabled={locked}
            onValueChange={(v) => set({ channel: v as OutreachChannel })}
            options={[
              { value: 'email', label: 'Email', disabled: !person.email },
              { value: 'linkedin', label: 'LinkedIn note', disabled: !person.linkedinUrl },
            ]}
          />
        </Field>
        <Field label="Purpose">
          <Select
            value={draft.purpose}
            disabled={locked}
            onValueChange={(v) => set({ purpose: v as OutreachPurpose })}
            options={OUTREACH_PURPOSES.map((p) => ({ value: p, label: PURPOSE_LABELS[p] }))}
          />
        </Field>
        <Field label="Role you want">
          <Input value={draft.jobTitle} disabled={locked} onChange={(e) => set({ jobTitle: e.target.value })} placeholder="Optional" />
        </Field>
      </div>

      {!locked && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" leftIcon={<FileText />} onClick={useTemplate}>Start from a template</Button>
          <Button size="sm" variant="secondary" leftIcon={<Sparkles />} loading={busy === 'ai'} onClick={draftWithAi}>Draft with Nomadic AI</Button>
        </div>
      )}

      {draft.channel === 'email' && (
        <Field label="Subject">
          <Input value={draft.subject} disabled={locked} onChange={(e) => set({ subject: e.target.value })} maxLength={300} />
        </Field>
      )}
      <Field
        label="Message"
        hint={draft.channel === 'linkedin' ? `${draft.body.length} / ${LINKEDIN_NOTE_LIMIT} characters` : undefined}
      >
        <Textarea value={draft.body} disabled={locked} onChange={(e) => set({ body: e.target.value })} rows={draft.channel === 'linkedin' ? 4 : 10} maxLength={5000} />
      </Field>

      {!locked && problems.length > 0 && (
        <ul className="flex flex-col gap-1 text-caption text-fg-muted">
          {problems.map((p) => <li key={p}>• {p}</li>)}
        </ul>
      )}
      {error && <p role="alert" className="text-caption text-danger-fg">{error}</p>}

      {!locked && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <Checkbox
            label="I reviewed this message"
            description={dirty ? 'Save your changes first.' : 'Every word goes out as written.'}
            checked={reviewed}
            disabled={dirty || !message || problems.length > 0 || busy !== null}
            onCheckedChange={(c) => review(c === true)}
          />
          <Button variant={dirty ? 'primary' : 'secondary'} disabled={!dirty || !draft.body.trim()} loading={busy === 'save'} onClick={save}>
            {message ? 'Save changes' : 'Save draft'}
          </Button>
        </div>
      )}

      {reviewed && (
        <div className="flex flex-wrap gap-2">
          {draft.channel === 'email' ? (
            <>
              <Button
                leftIcon={<Send />}
                loading={busy === 'send'}
                disabled={!smtpReady || limitHit}
                title={!smtpReady ? 'Connect your email account first' : limitHit ? 'Daily limit reached' : undefined}
                onClick={send}
              >
                Send from my email
              </Button>
              <Button variant="secondary" leftIcon={<ExternalLink />} loading={busy === 'gmail'} onClick={() => open('gmail')}>Open in Gmail</Button>
              <Button variant="secondary" leftIcon={<Mail />} loading={busy === 'mailto'} onClick={() => open('mailto')}>Open in mail app</Button>
            </>
          ) : (
            <Button leftIcon={<Linkedin />} loading={busy === 'linkedin'} onClick={() => open('linkedin')}>Copy note and open LinkedIn</Button>
          )}
          <Button variant="ghost" loading={busy === 'mark-sent'} onClick={() => mark('sent')}>I sent it myself</Button>
        </div>
      )}
      {reviewed && draft.channel === 'email' && (
        <p className="text-caption text-fg-muted">
          {smtpReady
            ? `${outreach.sentToday} of ${outreach.sendLimit} emails sent from your account today.`
            : 'To send from Nomadic, connect your email account in the Email account tab. Or open the message in Gmail and send it there.'}
        </p>
      )}

      {locked && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          <span className="self-center text-caption text-fg-muted">What happened?</span>
          <Button size="sm" variant="secondary" disabled={status === 'replied'} loading={busy === 'mark-replied'} onClick={() => mark('replied')}>Replied</Button>
          <Button size="sm" variant="secondary" disabled={status === 'no_reply'} loading={busy === 'mark-no_reply'} onClick={() => mark('no_reply')}>No reply</Button>
          <Button size="sm" variant="secondary" disabled={status === 'bounced'} loading={busy === 'mark-bounced'} onClick={() => mark('bounced')}>Bounced</Button>
        </div>
      )}
    </div>
  );
}

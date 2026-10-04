import React, { useState } from 'react';
import { Button, Field, Input, Select, Textarea } from '@nomadic/ui';
import type { OutreachContactKind, OutreachPerson, OutreachPersonInput } from '../../../shared/ipc';
import { KIND_INFO, PICKABLE_KINDS } from './outreachLogic';

interface PersonFormProps {
  initial?: Partial<OutreachPerson>;
  defaultCompany?: string;
  onSave: (input: OutreachPersonInput) => Promise<string | null>;
  onCancel: () => void;
}

const LINKEDIN = /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\//i;

/** Add or edit someone to reach. Only what the user types is stored. */
export function PersonForm({ initial, defaultCompany = '', onSave, onCancel }: PersonFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [company, setCompany] = useState(initial?.company ?? defaultCompany);
  const [roleTitle, setRoleTitle] = useState(initial?.roleTitle ?? '');
  const [kind, setKind] = useState<OutreachContactKind>(initial?.kind ?? 'employee');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [linkedinUrl, setLinkedinUrl] = useState(initial?.linkedinUrl ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const emailBad = email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const linkedinBad = linkedinUrl.trim() !== '' && !LINKEDIN.test(linkedinUrl.trim());
  const canSave = company.trim() !== '' && !emailBad && !linkedinBad && (email.trim() !== '' || linkedinUrl.trim() !== '');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const err = await onSave({
      id: initial?.id,
      name: name.trim() || null,
      company: company.trim(),
      roleTitle: roleTitle.trim() || null,
      kind,
      email: email.trim() || null,
      linkedinUrl: linkedinUrl.trim() || null,
      notes: notes.trim() || null,
      contactId: initial?.contactId ?? null,
      sourceUrl: initial?.sourceUrl ?? null,
    });
    setSaving(false);
    if (err) setError(err);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" aria-label={initial?.id ? 'Edit person' : 'Add person'}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
        </Field>
        <Field label="Company" required>
          <Input value={company} onChange={(e) => setCompany(e.target.value)} />
        </Field>
        <Field label="Who they are">
          <Select
            value={kind}
            onValueChange={(v) => setKind(v as OutreachContactKind)}
            options={PICKABLE_KINDS.map((k) => ({ value: k, label: KIND_INFO[k].label }))}
          />
        </Field>
        <Field label="Role">
          <Input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder="e.g. Engineering Manager" />
        </Field>
        <Field label="Email" error={emailBad ? 'That does not look like an email address.' : undefined}>
          <Input type="email" value={email} invalid={emailBad} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="LinkedIn profile" error={linkedinBad ? 'Paste a linkedin.com link.' : undefined}>
          <Input value={linkedinUrl} invalid={linkedinBad} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://www.linkedin.com/in/..." />
        </Field>
      </div>
      <Field label="Notes" hint="Only on this computer.">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </Field>
      {!canSave && company.trim() !== '' && !emailBad && !linkedinBad && (
        <p className="text-caption text-fg-muted">Add an email address or a LinkedIn link.</p>
      )}
      {error && <p role="alert" className="text-caption text-danger-fg">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={!canSave} loading={saving}>Save</Button>
      </div>
    </form>
  );
}

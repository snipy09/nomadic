import React, { useEffect, useState } from 'react';
import { Copy, ExternalLink, Trash2 } from 'lucide-react';
import { Button, Drawer, DrawerContent, Field, Textarea } from '@nomadic/ui';
import { getApi, type Application } from '../../types';
import { NOTES_MAX, formatDate, formatDateTime, historyNewestFirst, modeLabel, postingUrl, statusLabel } from './applicationsLogic';
import { MoveSelect, StatusBadge } from './ApplicationCard';

interface ApplicationDrawerProps {
  app: Application | null;
  onClose: () => void;
  onMove: (app: Application, status: string) => void;
  onSaveNotes: (app: Application, notes: string) => Promise<boolean>;
  onDelete: (app: Application) => void;
  onCopied: () => void;
}

function openExternal(url: string) {
  const api = getApi();
  if (api.openExternalUrl) void api.openExternalUrl(url);
  else window.open(url, '_blank', 'noopener');
}

export function ApplicationDrawer({ app, onClose, onMove, onSaveNotes, onDelete, onCopied }: ApplicationDrawerProps) {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset local state when a different application is opened.
  useEffect(() => {
    setNotes(app?.notes ?? '');
    setNotesError(null);
    setConfirmDelete(false);
  }, [app?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const link = app ? postingUrl(app) : null;
  const dirty = Boolean(app) && notes !== (app?.notes ?? '');

  const save = async () => {
    if (!app) return;
    if (notes.length > NOTES_MAX) { setNotesError(`Notes can be up to ${NOTES_MAX} characters.`); return; }
    setSaving(true);
    const ok = await onSaveNotes(app, notes);
    setSaving(false);
    setNotesError(ok ? null : 'Notes were not saved. Try again.');
  };

  return (
    <Drawer open={Boolean(app)} onOpenChange={(o) => { if (!o) onClose(); }}>
      {app && (
        <DrawerContent
          title={app.title}
          description={app.company}
          size="lg"
          footer={confirmDelete ? (
            <>
              <span className="mr-auto text-body text-fg-muted">Delete this application and its history?</span>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              <Button variant="danger" onClick={() => onDelete(app)}>Delete permanently</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" leftIcon={<Trash2 />} className="mr-auto" onClick={() => setConfirmDelete(true)}>Delete</Button>
              {link && <Button variant="secondary" rightIcon={<ExternalLink />} onClick={() => openExternal(link)}>Open posting</Button>}
            </>
          )}
        >
          <div className="flex flex-col gap-6">
            <section aria-labelledby="app-details-h" className="flex flex-col gap-3">
              <h3 id="app-details-h" className="text-body font-strong text-fg">Details</h3>
              <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-body">
                <dt className="text-fg-subtle">Company</dt><dd className="text-fg">{app.company}</dd>
                <dt className="text-fg-subtle">Role</dt><dd className="text-fg">{app.title}</dd>
                <dt className="text-fg-subtle">Status</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={app.status} />
                  <MoveSelect app={app} onMove={(s) => onMove(app, s)} className="w-44" />
                </dd>
                <dt className="text-fg-subtle">Applied</dt><dd className="text-fg">{formatDate(app.applied_at)}</dd>
                <dt className="text-fg-subtle">How</dt><dd className="text-fg">{modeLabel(app.mode)}</dd>
                <dt className="text-fg-subtle">Link</dt>
                <dd className="flex min-w-0 items-center gap-2">
                  {link ? (
                    <>
                      <span className="truncate text-fg-muted">{link}</span>
                      <Button size="sm" variant="ghost" leftIcon={<Copy />} onClick={() => { void navigator.clipboard?.writeText(link); onCopied(); }}>Copy</Button>
                    </>
                  ) : (
                    <span className="text-fg-subtle">No link saved</span>
                  )}
                </dd>
              </dl>
            </section>

            <section aria-labelledby="app-history-h" className="flex flex-col gap-2">
              <h3 id="app-history-h" className="text-body font-strong text-fg">Status history</h3>
              {(app.history ?? []).length === 0 ? (
                <p className="text-caption text-fg-subtle">No status changes recorded yet.</p>
              ) : (
                <ol className="flex flex-col gap-2 border-l border-line pl-4" aria-label="Status history">
                  {historyNewestFirst(app).map((h, i) => (
                    <li key={`${h.status}-${h.changed_at}-${i}`} className="flex flex-col">
                      <span className="text-body text-fg">{statusLabel(h.status)}</span>
                      <span className="text-caption text-fg-subtle">{formatDateTime(h.changed_at)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <Field label="Notes" hint="Interview dates, contacts, follow-ups. Synced with your account." error={notesError ?? undefined} labelAside={`${notes.length}/${NOTES_MAX}`}>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} autoResize maxRows={14} placeholder="Add a note" />
              </Field>
              <div className="flex justify-end gap-2">
                {dirty && <Button size="sm" variant="ghost" onClick={() => { setNotes(app.notes ?? ''); setNotesError(null); }}>Discard</Button>}
                <Button size="sm" onClick={() => void save()} disabled={!dirty} loading={saving}>Save notes</Button>
              </div>
            </section>
          </div>
        </DrawerContent>
      )}
    </Drawer>
  );
}

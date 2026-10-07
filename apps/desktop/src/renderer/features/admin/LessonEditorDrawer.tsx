import React, { useEffect, useState } from 'react';
import { Badge, Button, Drawer, DrawerContent, EmptyState, Field, Input, Select, Textarea, useToast } from '@nomadic/ui';
import { getApi } from '../../types';
import type { AdminLessonItem, ContentStatus } from '../../../shared/admin';
import {
  CONTENT_STATUS_LABELS, allowedLessonStatuses, contentStatusTone, formatDateTime, lessonDraftChanged, parseKeyPoints,
  validateLessonDraft, type LessonDraft, type LessonDraftErrors,
} from './adminLogic';
import { AdminErrorState, ConfirmChangeDialog, LoadingRows } from './shared';
import { useAdminQuery } from './useAdminQuery';
import { IS_MOBILE } from '../../platform';

interface LessonEditorDrawerProps {
  lesson: AdminLessonItem | null;
  onClose: () => void;
  onSaved: () => void;
}

const toDraft = (l: AdminLessonItem): LessonDraft => ({
  title: l.title,
  summaryMd: l.summaryMd,
  keyPoints: l.keyPoints.join('\n'),
  status: l.status,
});

export function LessonEditorDrawer({ lesson, onClose, onSaved }: LessonEditorDrawerProps) {
  return (
    <Drawer open={lesson !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      {lesson && <LessonEditor lesson={lesson} onSaved={onSaved} onClose={onClose} />}
    </Drawer>
  );
}

function LessonEditor({ lesson, onSaved, onClose }: { lesson: AdminLessonItem; onSaved: () => void; onClose: () => void }) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<LessonDraft>(() => toDraft(lesson));
  const [errors, setErrors] = useState<LessonDraftErrors>({});
  const [confirming, setConfirming] = useState(false);

  useEffect(() => { setDraft(toDraft(lesson)); setErrors({}); }, [lesson.id, lesson.version]);

  const history = useAdminQuery(() => getApi().adminContentHistory({ type: 'lesson', id: lesson.id }), `${lesson.id}:${lesson.version}`);

  const set = <K extends keyof LessonDraft>(k: K, v: LessonDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const changed = lessonDraftChanged(draft, lesson);

  const review = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateLessonDraft(draft);
    setErrors(errs);
    if (Object.keys(errs).length === 0 && changed) setConfirming(true);
  };

  const save = async (reason: string) => {
    const res = await getApi().adminUpdateLesson({
      id: lesson.id,
      expectedVersion: lesson.version,
      title: draft.title,
      summaryMd: draft.summaryMd,
      keyPoints: parseKeyPoints(draft.keyPoints),
      status: draft.status,
      reason,
    });
    if (!res.ok) return res.error;
    toast({ title: 'Lesson saved', description: `${draft.title.trim()} is now version ${res.data.version}.`, tone: 'success' });
    onSaved();
    return null;
  };

  const statusOptions = allowedLessonStatuses(lesson.status).map((s) => ({ value: s, label: CONTENT_STATUS_LABELS[s] }));

  return (
    <DrawerContent side={IS_MOBILE ? 'bottom' : undefined}
      title="Edit lesson"
      description={`${lesson.id} · skill ${lesson.skillId}`}
      size="xl"
      headerExtra={
        <div className="flex flex-wrap gap-2">
          <Badge tone={contentStatusTone(lesson.status)} size="sm">{CONTENT_STATUS_LABELS[lesson.status]}</Badge>
          <Badge tone="neutral" size="sm">Version {lesson.version}</Badge>
          {lesson.aiDrafted && <Badge tone="warning" size="sm">AI drafted: needs review before publishing</Badge>}
        </div>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button type="submit" form="lesson-editor-form" disabled={!changed}>Review and save</Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <form id="lesson-editor-form" onSubmit={review} className="flex flex-col gap-4" noValidate>
          <Field label="Title" required error={errors.title}>
            <Input value={draft.title} onChange={(e) => set('title', e.target.value)} maxLength={200} />
          </Field>
          <Field label="Lesson text" required error={errors.summaryMd} hint="Markdown. No links: learners get links only from curated, link-checked resources.">
            <Textarea value={draft.summaryMd} onChange={(e) => set('summaryMd', e.target.value)} rows={12} maxLength={20_000} />
          </Field>
          <Field label="Key points" error={errors.keyPoints} hint="One per line, up to 20.">
            <Textarea value={draft.keyPoints} onChange={(e) => set('keyPoints', e.target.value)} rows={5} />
          </Field>
          <Field label="Status" hint="Draft, then review, then published. Publishing needs a review step first.">
            <Select value={draft.status} onValueChange={(v) => set('status', v as ContentStatus)} options={statusOptions} />
          </Field>
        </form>

        <section aria-labelledby="lesson-history-heading" className="flex flex-col gap-3">
          <h3 id="lesson-history-heading" className="text-heading font-strong text-fg">Earlier versions</h3>
          {history.error ? (
            <AdminErrorState title="Could not load versions" error={history.error} code={history.code} onRetry={history.refresh} />
          ) : history.loading && !history.data ? (
            <LoadingRows label="Loading versions" rows={2} />
          ) : (history.data ?? []).length === 0 ? (
            <EmptyState size="sm" bordered title="No earlier versions" description="Each save keeps a copy of the version it replaced." />
          ) : (
            <ol className="flex flex-col gap-2">
              {(history.data ?? []).map((v) => (
                <li key={v.version} className="rounded-md border border-line p-3">
                  <div className="flex flex-wrap items-center gap-2 text-caption text-fg-subtle">
                    <Badge tone="neutral" size="sm">Version {v.version}</Badge>
                    <span>{String(v.snapshot['status'] ?? '')}</span>
                    <span>Replaced {formatDateTime(v.createdAt)}{v.editedByEmail ? ` by ${v.editedByEmail}` : ''}</span>
                  </div>
                  <p className="mt-1 font-strong text-fg">{String(v.snapshot['title'] ?? '')}</p>
                  <p className="line-clamp-2 text-body text-fg-muted">{String(v.snapshot['summary_md'] ?? '')}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <ConfirmChangeDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Save lesson"
        confirmLabel={`Save as version ${lesson.version + 1}`}
        summary={
          <ul className="flex flex-col gap-1">
            <li><span className="text-fg-subtle">Lesson:</span> {draft.title.trim()}</li>
            <li><span className="text-fg-subtle">Version:</span> {lesson.version} to {lesson.version + 1} (version {lesson.version} is kept in history)</li>
            {draft.status !== lesson.status && (
              <li><span className="text-fg-subtle">Status:</span> {CONTENT_STATUS_LABELS[lesson.status]} to <strong className="font-strong">{CONTENT_STATUS_LABELS[draft.status]}</strong></li>
            )}
          </ul>
        }
        onConfirm={save}
      />
    </DrawerContent>
  );
}

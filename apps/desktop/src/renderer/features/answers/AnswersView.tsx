import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, History, MessageSquareText, Plus, RefreshCw, Search, Sparkles, Trash2, X } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, EmptyState, IconButton, Input, Skeleton, Textarea, useToast } from '@nomadic/ui';
import type { MasterProfile } from '../../types';
import { APP_ANSWERS } from '../../../shared/applicationAnswers';
import { AppAnswerFields } from './AppAnswerFields';
import {
  answeredCount, defMatches, draftableEmpty, fromDraft, matchesQuery, newRowId, prettyQuestion, sameDraft, toDraft,
  type AnswersDraft,
} from './answersLogic';
import { mergeMissing } from './resumeFacts';
import { useAnswerDrafts } from './useAnswerDrafts';
import { useRememberedAnswers } from './useRememberedAnswers';

interface AnswersViewProps {
  profile: MasterProfile;
  onSaveProfile: (p: MasterProfile) => Promise<boolean>;
  saving?: boolean;
  onLog?: (msg: string) => void;
}

/**
 * Every answer Nomadic uses on application forms, in one place: the common questions
 * (from onboarding or typed here), the candidate's own question/answer pairs, and the
 * answers remembered on this computer from apply reviews.
 */
export function AnswersView({ profile, onSaveProfile, saving, onLog }: AnswersViewProps) {
  const { toast } = useToast();
  const initial = useMemo(() => toDraft(profile.customAnswers), [profile.customAnswers]);
  const [draft, setDraft] = useState<AnswersDraft>(initial);
  const [drafted, setDrafted] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const ai = useAnswerDrafts();
  const remembered = useRememberedAnswers();

  // A saved profile from elsewhere (sync, Settings) replaces the page only when nothing is being edited.
  const dirty = !sameDraft(draft, initial);
  useEffect(() => {
    if (!dirty) setDraft(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const { done, total } = answeredCount(draft.app);
  const emptyDraftable = draftableEmpty(draft.app);
  const resumeText = profile.resumeText?.trim() ?? '';

  const setApp = (id: string, v: string) => {
    setDraft((d) => ({ ...d, app: { ...d.app, [id]: v } }));
    setDrafted((s) => {
      if (!s.has(id)) return s;
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  };
  const setOwn = (id: string, patch: Partial<{ question: string; answer: string }>) =>
    setDraft((d) => ({ ...d, own: d.own.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const removeOwn = (id: string) => setDraft((d) => ({ ...d, own: d.own.filter((r) => r.id !== id) }));
  const addOwn = () => setDraft((d) => ({ ...d, own: [...d.own, { id: newRowId(), question: '', answer: '' }] }));

  const draftWithAi = async () => {
    const got = await ai.draft(emptyDraftable, {
      name: [profile.firstName, profile.lastName].filter(Boolean).join(' '),
      desiredTitle: profile.desiredTitle,
      skills: profile.techStack,
      location: profile.location,
      documentText: resumeText.slice(0, 50_000),
    });
    if (!got) return;
    const ids = Object.keys(got).filter((k) => got[k]?.trim());
    setDraft((d) => ({ ...d, app: mergeMissing(d.app, got) }));
    setDrafted((s) => new Set([...s, ...ids]));
    toast({
      title: ids.length ? `Nomadic AI drafted ${ids.length} answer${ids.length === 1 ? '' : 's'}` : 'Nothing to draft',
      description: ids.length ? 'Check each one, then save.' : 'Your resume does not show the missing answers. Type them in.',
      tone: ids.length ? 'success' : 'neutral',
    });
  };

  const save = async () => {
    setSaveError(null);
    const customAnswers = fromDraft(profile.customAnswers, draft);
    try {
      const ok = await onSaveProfile({ ...profile, customAnswers });
      if (!ok) {
        setSaveError('Your answers were not saved. Try again.');
        return;
      }
      setDrafted(new Set());
      onLog?.('Application answers saved.');
      toast({ title: 'Answers saved', description: 'Nomadic uses them on your next applications.', tone: 'success' });
    } catch (e) {
      setSaveError(`Your answers were not saved: ${e instanceof Error ? e.message : 'unknown error'}.`);
    }
  };

  const ownShown = draft.own.filter((r) => matchesQuery(query, r.question, r.answer));
  const rememberedShown = remembered.items.filter((r) => matchesQuery(query, prettyQuestion(r.key), r.answer));
  const anyAppShown = APP_ANSWERS.some(defMatches(query));

  return (
    <div className="flex flex-col gap-6 pb-24">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-heading font-strong text-fg">Answers</h1>
          <p className="mt-1 max-w-2xl text-body text-fg-muted">
            What Nomadic writes on application forms. Answer once here and every application uses it; you still review each form before it is sent.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-body font-strong text-fg">{done} of {total}</div>
            <div className="text-caption text-fg-muted">common questions answered</div>
          </div>
          <div
            role="progressbar"
            aria-label="Common questions answered"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
            className="h-2 w-28 overflow-hidden rounded-full bg-surface-sunken"
          >
            <div className="h-full bg-accent transition-[width] duration-base" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
          </div>
        </div>
      </header>

      <div className="max-w-md">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          leftIcon={<Search />}
          placeholder="Search questions and answers"
          aria-label="Search answers"
        />
      </div>

      <Card>
        <CardHeader
          icon={<MessageSquareText />}
          title="Common questions"
          description="Asked on most forms: education, notice period, relocation, short texts about you."
          actions={
            emptyDraftable.length > 0 && resumeText ? (
              <Button size="sm" variant="secondary" leftIcon={<Sparkles />} loading={ai.busy} loadingText="Drafting…" onClick={() => void draftWithAi()}>
                Draft empty answers with AI
              </Button>
            ) : undefined
          }
        />
        <CardContent className="flex flex-col gap-4">
          {!resumeText && emptyDraftable.length > 0 && (
            <p className="text-caption text-fg-muted">Add a resume in Settings and run setup again, or type the answers yourself. Nomadic AI drafts from your resume only.</p>
          )}
          {ai.error && (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-body text-warning-fg">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span className="flex-1">{ai.error}</span>
              <IconButton label="Dismiss" icon={<X />} size="sm" variant="ghost" onClick={ai.clearError} />
            </div>
          )}
          {anyAppShown ? (
            <AppAnswerFields values={draft.app} onChange={setApp} drafted={drafted} idPrefix="answers" filter={defMatches(query)} />
          ) : (
            <p className="text-body text-fg-muted">No common question matches "{query}".</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          icon={<Plus />}
          title="Your own answers"
          description="Questions you want answered the same way every time, such as a cover note or why you want to work in a field."
          actions={<Button size="sm" variant="secondary" leftIcon={<Plus />} onClick={addOwn}>Add a question</Button>}
        />
        <CardContent>
          {draft.own.length === 0 ? (
            <EmptyState
              size="sm"
              bordered
              title="No questions of your own yet"
              description="Add a question and its answer. Nomadic uses it when a form asks the same thing."
            />
          ) : ownShown.length === 0 ? (
            <p className="text-body text-fg-muted">None of your questions match "{query}".</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {ownShown.map((r, i) => (
                <li key={r.id} className="flex flex-col gap-2 rounded-md border border-line p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      value={r.question}
                      onChange={(e) => setOwn(r.id, { question: e.target.value })}
                      placeholder="Question, as forms ask it"
                      aria-label={`Question ${i + 1}`}
                      maxLength={200}
                      className="flex-1"
                    />
                    <IconButton label={`Remove question ${i + 1}`} icon={<Trash2 />} variant="ghost" size="sm" onClick={() => removeOwn(r.id)} />
                  </div>
                  <Textarea
                    value={r.answer}
                    onChange={(e) => setOwn(r.id, { answer: e.target.value })}
                    placeholder="Your answer"
                    aria-label={`Answer ${i + 1}`}
                    rows={2}
                    autoResize
                    maxRows={8}
                    maxLength={2000}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <RememberedSection state={remembered} shown={rememberedShown} query={query} />

      <div className="sticky bottom-0 z-10 -mx-5 flex flex-wrap items-center justify-end gap-3 border-t border-line bg-canvas/95 px-5 py-3 md:-mx-8 md:px-8">
        {saveError && <p role="alert" className="mr-auto text-body text-danger-fg">{saveError}</p>}
        {!saveError && dirty && <p className="mr-auto text-caption text-fg-muted">You have unsaved changes.</p>}
        <Button variant="ghost" disabled={!dirty || saving} onClick={() => { setDraft(initial); setDrafted(new Set()); setSaveError(null); }}>
          Discard
        </Button>
        <Button variant="primary" leftIcon={<Check />} disabled={!dirty} loading={saving} loadingText="Saving…" onClick={() => void save()}>
          Save answers
        </Button>
      </div>
    </div>
  );
}

const RememberedSection: React.FC<{
  state: ReturnType<typeof useRememberedAnswers>;
  shown: ReturnType<typeof useRememberedAnswers>['items'];
  query: string;
}> = ({ state, shown, query }) => {
  const [confirmClear, setConfirmClear] = useState(false);
  const [editing, setEditing] = useState<{ key: string; value: string } | null>(null);

  const commit = async () => {
    if (!editing) return;
    const value = editing.value.trim();
    const ok = await state.update(editing.key, value ? value : null);
    if (ok) setEditing(null);
  };

  return (
    <Card>
      <CardHeader
        icon={<History />}
        title="Remembered from your applications"
        description="Short answers you typed while reviewing a form. Nomadic fills them in the next time a form asks the same question. Kept on this computer only."
        actions={
          state.status === 'ready' && state.items.length > 0 ? (
            confirmClear ? (
              <div className="flex items-center gap-1">
                <Button size="sm" variant="danger" onClick={() => { setConfirmClear(false); void state.clearAll(); }}>Forget all</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmClear(false)}>Cancel</Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" leftIcon={<Trash2 />} onClick={() => setConfirmClear(true)}>Forget all</Button>
            )
          ) : undefined
        }
      />
      <CardContent>
        {state.error && state.status === 'ready' && (
          <div role="alert" className="mb-3 flex items-center gap-2 text-body text-danger-fg">
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            <span className="flex-1">{state.error}</span>
            <IconButton label="Dismiss" icon={<X />} size="sm" variant="ghost" onClick={state.clearError} />
          </div>
        )}
        {state.status === 'loading' ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading remembered answers">
            <Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" />
          </div>
        ) : state.status === 'unavailable' ? (
          <p className="text-body text-fg-muted">Remembered answers are kept by the desktop app.</p>
        ) : state.status === 'error' ? (
          <EmptyState
            size="sm"
            tone="danger"
            title="Could not load remembered answers"
            description={state.error ?? undefined}
            actions={<Button size="sm" variant="secondary" leftIcon={<RefreshCw />} onClick={() => void state.reload()}>Try again</Button>}
          />
        ) : state.items.length === 0 ? (
          <EmptyState
            size="sm"
            bordered
            title="Nothing remembered yet"
            description='When a form needs you, the answer you type during review is saved here and filled in next time. Long texts, passwords and files are never kept.'
          />
        ) : shown.length === 0 ? (
          <p className="text-body text-fg-muted">No remembered answer matches "{query}".</p>
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((r) => {
              const q = prettyQuestion(r.key);
              const isEditing = editing?.key === r.key;
              return (
                <li key={r.key} className="flex flex-wrap items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1 basis-56">
                    <div className="truncate text-body font-strong text-fg" title={q}>{q}</div>
                    {r.createdAt && <div className="text-caption text-fg-subtle">Saved {formatDate(r.createdAt)}</div>}
                  </div>
                  {isEditing ? (
                    <form
                      className="flex flex-1 basis-72 items-center gap-2"
                      onSubmit={(e) => { e.preventDefault(); void commit(); }}
                    >
                      <Input
                        autoFocus
                        value={editing.value}
                        onChange={(e) => setEditing({ key: r.key, value: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Escape') setEditing(null); }}
                        aria-label={`Answer for ${q}`}
                        maxLength={200}
                        className="flex-1"
                      />
                      <Button size="sm" type="submit">Save</Button>
                      <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(null)}>Cancel</Button>
                    </form>
                  ) : (
                    <>
                      <Badge tone="neutral" className="max-w-xs truncate" title={r.answer}>{r.answer}</Badge>
                      <div className="ml-auto flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditing({ key: r.key, value: r.answer })} aria-label={`Edit answer for ${q}`}>Edit</Button>
                        <IconButton label={`Forget answer for ${q}`} icon={<Trash2 />} size="sm" variant="ghost" onClick={() => void state.update(r.key, null)} />
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

function formatDate(s: string): string {
  const d = new Date(s.includes('T') || s.endsWith('Z') ? s : `${s.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

import React, { useMemo, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, Lightbulb, ListChecks, NotebookPen } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea, useToast } from '@nomadic/ui';
import type { GradeResult, ProblemNote, Roadmap } from '@job-automator/learning';
import { getApi, type LearningEventInput } from '../../types';
import { learnIndex, moduleById, problemByRef, topicById } from './catalog';
import { quizItemById, type QuizItem } from './content';
import { LearnItem } from './DayTaskList';
import { InlineText } from './InlineText';
import { formatMinutes, knowThisEvent, problemAttemptedEvent, topicProblems, type Progress } from './learnModel';
import { QuizForm } from './QuizForm';
import { topicQuizEvents } from './quizLogic';

interface TopicScreenProps {
  topicId: string;
  roadmap: Roadmap | null;
  progress: Progress | null;
  notes: ProblemNote[];
  trackId: string;
  practiceRemaining: number;
  isFree: boolean;
  onBack: () => void;
  onRecord: (events: LearningEventInput[]) => Promise<{ ok: boolean; error?: string }>;
  onSaveNote: (note: ProblemNote) => Promise<{ ok: boolean; error?: string }>;
  onOpenUpgrade?: (feature?: string) => void;
}

const TIER_LABEL = { must: 'Must do', good: 'Good to do', stretch: 'Stretch', company: 'Company list' } as const;

/** Topic page: what to learn, key points, hands-on tasks, named problems with notes, the topic quiz and "I already know this". */
export function TopicScreen(props: TopicScreenProps) {
  const { topicId, roadmap, progress, notes, trackId, practiceRemaining, isFree, onBack, onRecord, onSaveNote } = props;
  const { toast } = useToast();
  const topic = topicById(topicId);
  const openedAt = useRef(Date.now());
  const [editing, setEditing] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const items = useMemo(
    () => (topic?.quiz_item_ids ?? []).map((id) => quizItemById(id)).filter((x): x is QuizItem => !!x),
    [topic]
  );

  const learnItems = topic ? (topic.learn_items.length ? topic.learn_items : topic.key_points) : [];
  if (!topic) {
    return <EmptyState bordered title="Topic not found" description="This topic is no longer in the catalogue." actions={<Button onClick={onBack}>Go back</Button>} />;
  }
  const mod = moduleById(topic.module_id);
  const problems = topicProblems(topic.id, roadmap, learnIndex());
  const learnDone = progress?.done.has(`${topic.id}/learn`) ?? false;
  const solved = new Set([...(progress?.done ?? [])].map((k) => /\/solve\/([a-z0-9-]+)/.exec(k)?.[1]).filter(Boolean) as string[]);
  const noteFor = (ref: string) => notes.find((n) => n.ref === ref);

  const record = async (events: LearningEventInput[], ok: string) => {
    const res = await onRecord(events);
    toast(res.ok ? { title: ok, tone: 'success' } : { title: 'Not saved', description: res.error, tone: 'danger' });
  };

  const submitQuiz = async (grades: GradeResult[]) => {
    const { events } = topicQuizEvents(topic.id, items, grades, trackId, new Date(), (Date.now() - openedAt.current) / 1000);
    const res = await onRecord(events);
    if (!res.ok) toast({ title: 'Your answers were not saved', description: res.error, tone: 'danger' });
    return res;
  };

  const saveNote = async (ref: string, resolveLater: boolean) => {
    const res = await onSaveNote({ ref, note: noteText.slice(0, 2000), resolve_later: resolveLater, updated_at: new Date().toISOString() });
    if (res.ok) setEditing(null);
    else toast({ title: 'Note not saved', description: res.error, tone: 'danger' });
  };

  return (
    <article className="flex flex-col gap-4" aria-labelledby="topic-title">
      <div>
        <Button variant="ghost" size="sm" leftIcon={<ArrowLeft />} onClick={onBack}>Back</Button>
      </div>
      <header className="flex flex-col gap-1">
        <h2 id="topic-title" className="text-title font-strong text-fg">{topic.title}</h2>
        <div className="flex flex-wrap items-center gap-2 text-caption text-fg-subtle">
          {mod && <span>{mod.title}</span>}
          <span>· {formatMinutes(topic.learn_minutes)} to learn</span>
          <Badge size="sm" tone="neutral">{topic.tier}</Badge>
          {topic.ai_drafted && topic.status !== 'published' && <Badge size="sm" tone="warning">AI-drafted, under review</Badge>}
          {learnDone && <Badge size="sm" tone="success">Learned</Badge>}
        </div>
      </header>

      <Card padding="lg" className="flex flex-col gap-4">
        <p className="text-body-lg text-fg"><InlineText text={topic.summary_md} /></p>
        {learnItems.length > 0 && (
          <section aria-labelledby="topic-learn" className="flex flex-col gap-2">
            <h3 id="topic-learn" className="flex items-center gap-2 text-heading font-strong text-fg">
              <ListChecks className="size-4 text-accent" aria-hidden="true" /> What to learn
            </h3>
            <ol className="flex flex-col gap-2">
              {learnItems.map((item, i) => (
                <li key={item} className="flex gap-3 rounded-lg bg-surface-sunken/70 px-3 py-2 text-body text-fg">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-caption font-strong text-accent-fg">{i + 1}</span>
                  <LearnItem text={item} />
                </li>
              ))}
            </ol>
          </section>
        )}
        {topic.key_points.length > 0 && topic.learn_items.length > 0 && (
          <section aria-labelledby="topic-remember" className="flex flex-col gap-1.5 rounded-lg border border-accent/30 bg-accent-subtle/50 p-3">
            <h3 id="topic-remember" className="flex items-center gap-2 text-body font-strong text-accent-subtle-fg">
              <Lightbulb className="size-4" aria-hidden="true" /> Remember
            </h3>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-fg-muted">
              {topic.key_points.map((k) => <li key={k}><InlineText text={k} /></li>)}
            </ul>
          </section>
        )}
        {!learnDone && (
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
            <span className="mr-auto text-caption text-fg-subtle">Already comfortable with every point above?</span>
            <Button size="sm" variant="secondary" onClick={() => void record([knowThisEvent(topic.id, topic.skill_ids[0] ?? mod?.skill_ids[0] ?? null, trackId, new Date())], 'Marked as learned')}>
              I already know this
            </Button>
          </div>
        )}
      </Card>

      {topic.tasks.length > 0 && (
        <section aria-labelledby="topic-tasks" className="flex flex-col gap-2">
          <h3 id="topic-tasks" className="text-heading font-strong text-fg">Hands-on practice</h3>
          <ul className="flex flex-col gap-1">
            {topic.tasks.map((t) => (
              <li key={t.key} className="text-body text-fg">{t.title} <span className="text-caption text-fg-subtle">· {formatMinutes(t.minutes)}{t.optional ? ' · optional' : ''}</span></li>
            ))}
          </ul>
          <p className="text-caption text-fg-subtle">Tick these on Today when your plan schedules them.</p>
        </section>
      )}

      {problems.length > 0 && (
        <section aria-labelledby="topic-problems" className="flex flex-col gap-2">
          <h3 id="topic-problems" className="text-heading font-strong text-fg">Problems</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Problem</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>On company lists</TableHead>
                <TableHead>Status</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {problems.map((row) => {
                const p = problemByRef(row.ref);
                if (!p) return null;
                const slug = row.ref.slice(3);
                const note = noteFor(row.ref);
                return (
                  <React.Fragment key={row.ref}>
                    <TableRow>
                      <TableCell>
                        <div className="text-body text-fg">{p.title}</div>
                        <div className="text-caption text-fg-subtle">
                          {TIER_LABEL[row.tier]}{row.company ? ` · on ${row.company}'s list` : ''}{p.paid_only ? ' · LeetCode Premium' : ''}
                          {note?.resolve_later ? ' · re-solve later' : ''}
                        </div>
                      </TableCell>
                      <TableCell className="capitalize">{p.difficulty}</TableCell>
                      <TableCell>{p.companies}</TableCell>
                      <TableCell>{solved.has(slug) ? <Badge size="sm" tone="success">Solved</Badge> : '—'}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button size="sm" variant="secondary" rightIcon={<ExternalLink />} onClick={() => void getApi().openExternalUrl(p.link)}>Open</Button>
                          <Button size="sm" variant="ghost" onClick={() => void record([problemAttemptedEvent(row.ref, false, trackId, new Date())], 'Recorded: solved')}>Solved</Button>
                          <Button size="sm" variant="ghost" onClick={() => void record([problemAttemptedEvent(row.ref, true, trackId, new Date())], 'Recorded: solved with a hint')}>Needed a hint</Button>
                          <Button size="sm" variant="ghost" leftIcon={<NotebookPen />} aria-label={`Note for ${p.title}`} onClick={() => { setEditing(row.ref); setNoteText(note?.note ?? ''); }}>Note</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {editing === row.ref && (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <div className="flex flex-col gap-2">
                            <Textarea rows={3} maxLength={2000} value={noteText} onChange={(e) => setNoteText(e.target.value)} aria-label={`Note for ${p.title}`} />
                            <div className="flex flex-wrap gap-2">
                              <Button size="sm" onClick={() => void saveNote(row.ref, note?.resolve_later ?? false)}>Save note</Button>
                              <Button size="sm" variant="secondary" onClick={() => void saveNote(row.ref, !(note?.resolve_later ?? false))}>
                                {note?.resolve_later ? 'Clear "re-solve later"' : 'Save and re-solve later'}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </section>
      )}

      <section aria-labelledby="topic-quiz" className="flex flex-col gap-2">
        <h3 id="topic-quiz" className="text-heading font-strong text-fg">Quiz</h3>
        {items.length === 0 ? (
          <Card variant="sunken" padding="sm" className="text-body text-fg-muted">No quiz for this topic yet.</Card>
        ) : practiceRemaining < items.length ? (
          <Card padding="md" className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-body font-strong text-fg">Daily practice limit reached</div>
              <div className="text-caption text-fg-subtle">{isFree ? 'The free plan includes 10 practice questions a day. Come back tomorrow or upgrade.' : 'Come back tomorrow.'}</div>
            </div>
            {isFree && props.onOpenUpgrade && <Button onClick={() => props.onOpenUpgrade?.('Unlimited practice')}>Upgrade</Button>}
          </Card>
        ) : (
          <QuizForm
            key={`topic-${topic.id}`}
            items={items}
            label={`${topic.title} quiz`}
            submitLabel="Check answers"
            onSubmit={submitQuiz}
            renderResult={(grades, reset) => {
              const right = grades.filter((g) => g.correct).length;
              const passed = right / grades.length >= 0.8;
              return (
                <Card padding="md" className={passed ? 'border-success/40' : 'border-warning/40'}>
                  <p className="text-body text-fg">{passed ? 'Quiz passed. Missed questions come back for review.' : `${right} of ${grades.length} correct. You need 80% to pass.`}</p>
                  {!passed && <Button size="sm" className="mt-2" onClick={reset} disabled={practiceRemaining < items.length}>Try again</Button>}
                </Card>
              );
            }}
          />
        )}
      </section>
    </article>
  );
}

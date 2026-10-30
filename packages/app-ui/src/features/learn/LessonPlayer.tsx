import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Lightbulb, X } from 'lucide-react';
import { Badge, Button, Card, Checkbox, EmptyState, IconButton, cn, useToast } from '@nomadic/ui';
import type { GradeResult, ProblemNote, Roadmap } from '@job-automator/learning';
import { getApi, type LearningEventInput } from '../../types';
import { prefs } from '../../store/preferences';
import { learnIndex, problemByRef } from './catalog';
import { quizItemById, type QuizItem } from './content';
import { InlineText } from './InlineText';
import { CheckSection, PointList, ProblemCard } from './lessonParts';
import { LessonLinks, type LessonLinksProps } from './LessonLinks';
import { formatMinutes, knowThisEvent, solvedEvent, type EntryView, type Progress } from './learnModel';
import { topicQuizEvents } from './quizLogic';
import { lessonContent, lessonPoints, lessonScreens, topicGroups, type LessonScreen } from './sessionModel';

type Result = Promise<{ ok: boolean; error?: string }>;

export interface LessonPlayerProps {
  topicId: string;
  /** Today's entries of this topic (lesson, check, hands-on, problems). */
  views: EntryView[];
  /** Where to open: the start, or straight at the check or the practice. */
  start?: 'intro' | 'check' | 'practice';
  roadmap: Roadmap | null;
  progress: Progress;
  notes: ProblemNote[];
  trackId: string;
  practiceRemaining: number;
  isFree: boolean;
  intake?: LessonLinksProps['intake'];
  /** The next step of the session after this lesson. */
  next?: { label: string; onGo: () => void } | null;
  onClose: () => void;
  onToggle: (view: EntryView, done: boolean, durationS: number) => Result;
  onRecord: (events: LearningEventInput[]) => Result;
  onSaveNote: (note: ProblemNote) => Result;
  onOpenUpgrade?: (feature?: string) => void;
}

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable || /^(radio|checkbox|slider|option)$/.test(el.getAttribute('role') ?? ''));

/**
 * A lesson in focus mode, one short screen at a time: what you will learn, the
 * points (2–3 per screen), a recap, the check, today's practice for the topic,
 * then the next step of the session. Resumes on the screen it was left on.
 */
export function LessonPlayer(props: LessonPlayerProps) {
  const { topicId, views, roadmap, progress, notes, trackId, practiceRemaining, isFree, onToggle, onRecord } = props;
  const { toast } = useToast();
  const index = learnIndex();
  const content = useMemo(() => lessonContent(topicId, roadmap, index), [topicId, roadmap, index]);
  const group = useMemo(() => topicGroups(views, () => content?.title ?? '').get(topicId), [views, topicId, content]);
  const lesson = group?.lessons.find((l) => !l.done) ?? group?.lessons[0] ?? null;
  const part = lesson?.entry.part ?? 1;
  const parts = lesson?.entry.parts ?? 1;
  const lastPart = part === parts;
  const points = useMemo(() => (content ? lessonPoints(content.points, part, parts) : []), [content, part, parts]);
  const quiz = useMemo(
    () => (content?.quizItemIds ?? []).map((id) => quizItemById(id)).filter((x): x is QuizItem => !!x),
    [content]
  );
  const practice = [...(group?.handson ?? []), ...(group?.solves ?? [])];
  const screens = useMemo(
    () => lessonScreens({ points, recap: !!content?.recap.length && lastPart, check: quiz.length > 0 && lastPart, practice: practice.length > 0 }),
    [points, content, lastPart, quiz.length, practice.length]
  );
  const resumeKey = lesson?.key ?? topicId;
  const firstOf = (kind: LessonScreen['kind']) => Math.max(0, screens.findIndex((s) => s.kind === kind));
  const [at, setAt] = useState(() => {
    if (props.start === 'check' || props.start === 'practice') return firstOf(props.start);
    return Math.min(prefs.getLessonScreen(resumeKey), screens.length - 1);
  });
  const openedAt = useRef(Date.now());
  const problemOpened = useRef(new Map<string, number>());
  const marking = useRef(false);
  const [checkTaken, setCheckTaken] = useState(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const screen = screens[Math.min(at, screens.length - 1)];
  const lessonDone = !lesson || lesson.done || progress.done.has(`${topicId}/learn`);
  const quizDone = progress.done.has(`${topicId}/quiz`);

  useEffect(() => {
    prefs.setLessonScreen(resumeKey, screen.kind === 'done' ? 0 : at);
  }, [at, resumeKey, screen.kind]);
  useEffect(() => {
    headingRef.current?.focus();
  }, [at]);

  if (!content) {
    return <EmptyState bordered title="Lesson not found" description="This topic is no longer in the catalogue." actions={<Button onClick={props.onClose}>Back</Button>} />;
  }

  /** The lesson counts as learned once the student moves past its last points screen. */
  const markLearned = async () => {
    if (!lesson || lessonDone || marking.current) return;
    marking.current = true;
    const res = await onToggle(lesson, true, Math.min((Date.now() - openedAt.current) / 1000, lesson.entry.minutes * 180));
    marking.current = false;
    if (!res.ok) toast({ title: 'Progress not saved', description: res.error, tone: 'danger' });
  };

  const go = (to: number) => {
    const target = Math.max(0, Math.min(screens.length - 1, to));
    const leavingContent = (screen.kind === 'intro' || screen.kind === 'points') && !['intro', 'points'].includes(screens[target].kind);
    if (target > at && leavingContent) void markLearned();
    setAt(target);
  };
  const nextScreen = () => go(at + 1);
  const back = () => go(at - 1);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      props.onClose();
      return;
    }
    if (isTyping(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowRight' && screen.kind !== 'done') {
      e.preventDefault();
      nextScreen();
    } else if (e.key === 'ArrowLeft' && at > 0) {
      e.preventDefault();
      back();
    }
  };

  const knowThis = async () => {
    const res = await onRecord([knowThisEvent(topicId, content.topic?.skill_ids[0] ?? null, trackId, new Date())]);
    if (!res.ok) {
      toast({ title: 'Not saved', description: res.error, tone: 'danger' });
      return;
    }
    const after = screens.findIndex((s) => s.kind === 'check' || s.kind === 'practice' || s.kind === 'done');
    setAt(after);
  };

  const submitCheck = async (grades: GradeResult[]) => {
    const { events } = topicQuizEvents(topicId, quiz, grades, trackId, new Date(), (Date.now() - openedAt.current) / 1000);
    const res = await onRecord(events);
    if (!res.ok) toast({ title: 'Your answers were not saved', description: res.error, tone: 'danger' });
    else setCheckTaken(true);
    return res;
  };

  const doneCount = practice.filter((v) => v.done).length;
  const primaryLabel =
    screen.kind === 'intro' ? (at === 0 && !lessonDone ? (points.length ? 'Start' : 'Mark as learned') : 'Continue') : screen.kind === 'points' ? 'Got it' : screen.kind === 'practice' ? 'Finish' : 'Continue';

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4" onKeyDown={onKeyDown} role="region" aria-label={`Lesson: ${content.title}`}>
      <header className="flex items-center gap-3">
        <IconButton label="Close lesson" icon={<X />} variant="ghost" onClick={props.onClose} shortcut={['Esc']} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-body-lg font-strong text-fg">{content.title}</div>
          <div className="truncate text-caption text-fg-subtle">
            {content.moduleTitle}
            {parts > 1 ? ` · part ${part} of ${parts}` : ''}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden gap-1 sm:flex" aria-hidden="true">
            {screens.map((s, i) => (
              <span key={i} className={cn('size-2 rounded-full', i < at ? 'bg-accent' : i === at ? 'bg-accent ring-2 ring-accent/30' : 'bg-surface-active')} />
            ))}
          </div>
          <span className="text-caption tabular-nums text-fg-subtle">
            {at + 1} / {screens.length}
          </span>
        </div>
      </header>

      <Card padding="lg" className="flex min-h-[18rem] flex-col gap-4">
        {screen.kind === 'intro' && (
          <>
            <h2 ref={headingRef} tabIndex={-1} className="text-title font-strong text-fg outline-none">{content.title}</h2>
            <div className="flex flex-wrap items-center gap-2 text-caption text-fg-subtle">
              <span>{formatMinutes(lesson?.entry.minutes ?? content.minutes)}</span>
              {lessonDone && lesson && <Badge size="sm" tone="success">Learned</Badge>}
              {content.unreviewed && <Badge size="sm" tone="warning">AI-drafted, under review</Badge>}
            </div>
            {content.summary && (
              <p className="text-body-lg text-fg">
                <InlineText text={content.summary} />
              </p>
            )}
            {points.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="text-label font-strong uppercase tracking-wide text-accent">
                  {parts > 1 ? `In this part you learn ${points.length} things` : `You will learn ${points.length} things`}
                </div>
                <ol className="grid gap-1.5 sm:grid-cols-2">
                  {points.map((p) => (
                    <li key={p.n} className="flex gap-2 text-body text-fg">
                      <span className="w-5 shrink-0 text-right text-fg-subtle">{p.n}.</span>
                      <span className="min-w-0">{p.name ?? p.text}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {!points.length && lesson && <p className="text-body text-fg-muted">{lesson.task.title}</p>}
            {content.topic && !lessonDone && (
              <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-line pt-3 text-caption text-fg-subtle">
                <span className="mr-auto">Know all of this already?</span>
                <Button size="sm" variant="ghost" onClick={() => void knowThis()}>I already know this</Button>
              </div>
            )}
          </>
        )}

        {screen.kind === 'points' && (
          <>
            <h2 ref={headingRef} tabIndex={-1} className="sr-only outline-none">
              Points {screen.points[0].n} to {screen.points[screen.points.length - 1].n}
            </h2>
            <PointList points={screen.points} size="lg" />
            {content.topic && (
              <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <span className="mr-1 text-caption text-fg-subtle">Need it explained?</span>
                <LessonLinks topic={content.topic} intake={props.intake} points={screen.points} short />
              </div>
            )}
          </>
        )}

        {screen.kind === 'recap' && (
          <>
            <h2 ref={headingRef} tabIndex={-1} className="flex items-center gap-2 text-heading font-strong text-fg outline-none">
              <Lightbulb className="size-5 text-accent" aria-hidden="true" /> Remember
            </h2>
            <ul className="flex list-disc flex-col gap-2 pl-5 text-body-lg text-fg">
              {content.recap.map((k) => <li key={k}><InlineText text={k} /></li>)}
            </ul>
            <p className="mt-auto border-t border-line pt-3 text-body text-fg-muted">
              Before you go on, say the main idea of this lesson out loud in one sentence.
            </p>
          </>
        )}

        {screen.kind === 'check' && (
          <>
            <h2 ref={headingRef} tabIndex={-1} className="text-heading font-strong text-fg outline-none">Check yourself</h2>
            <p className="text-body text-fg-muted">From memory, without looking back. 80% passes; misses come back as reviews.</p>
            <CheckSection
              items={quiz}
              title={content.title}
              practiceRemaining={practiceRemaining}
              isFree={isFree}
              done={quizDone}
              onSubmit={submitCheck}
              onOpenUpgrade={props.onOpenUpgrade}
            />
          </>
        )}

        {screen.kind === 'practice' && (
          <>
            <h2 ref={headingRef} tabIndex={-1} className="text-heading font-strong text-fg outline-none">Practice</h2>
            <p className="text-body text-fg-muted">
              {group?.solves.length ? 'Try each problem on your own for 20 minutes before you look at hints. ' : ''}
              {doneCount} of {practice.length} done.
            </p>
            <ul className="flex flex-col gap-3">
              {group?.handson.map((v) => (
                <li key={v.key}>
                  <Card padding="md" className={cn('flex items-start gap-3', v.done && 'border-success/40')}>
                    <Checkbox
                      className="mt-0.5"
                      checked={v.done}
                      aria-label={`${v.done ? 'Untick' : 'Tick'} ${v.task.title}`}
                      onCheckedChange={(c) => void onToggle(v, c === true, 0).then((r) => !r.ok && toast({ title: 'Not saved', description: r.error, tone: 'danger' }))}
                    />
                    <div className="min-w-0 flex-1">
                      <div className={cn('text-body-lg', v.done ? 'text-fg-subtle line-through' : 'font-strong text-fg')}>{v.task.title}</div>
                      <div className="text-caption text-fg-subtle">Hands-on · {formatMinutes(v.entry.minutes)}{v.task.note ? ` · ${v.task.note}` : ''}</div>
                    </div>
                  </Card>
                </li>
              ))}
              {group?.solves.map((v) => {
                const p = v.task.problem_ref ? problemByRef(v.task.problem_ref) : undefined;
                if (!p) return null;
                return (
                  <li key={v.key}>
                    <ProblemCard
                      problem={p}
                      done={v.done}
                      minutes={v.entry.minutes}
                      tag={v.task.note ?? null}
                      note={notes.find((n) => n.ref === p.ref)}
                      onOpen={() => {
                        problemOpened.current.set(v.key, Date.now());
                        void getApi().openExternalUrl(p.link);
                      }}
                      onSolved={(hint) => {
                        const started = problemOpened.current.get(v.key);
                        const spent = started ? Math.min((Date.now() - started) / 1000, v.entry.minutes * 180) : 0;
                        return onRecord([solvedEvent(v.task, v.key, spent, hint, trackId, index, new Date())]);
                      }}
                      onUndo={() => onToggle(v, false, 0)}
                      onSaveNote={props.onSaveNote}
                    />
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {screen.kind === 'done' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-success-subtle text-success-fg [&_svg]:size-7" aria-hidden="true">
              <Check strokeWidth={3} />
            </span>
            <h2 ref={headingRef} tabIndex={-1} className="text-title font-strong text-fg outline-none">
              {parts > 1 && !lastPart ? `Part ${part} done` : 'Lesson done'}
            </h2>
            <p className="max-w-md text-body text-fg-muted">
              {parts > 1 && !lastPart
                ? 'The rest of this lesson is in a later session.'
                : [
                    quiz.length
                      ? quizDone
                        ? 'Check passed.'
                        : checkTaken
                          ? 'Check not passed yet; the questions you missed come back as reviews.'
                          : 'You can take the check any time from this lesson.'
                      : null,
                    practice.length ? `${doneCount} of ${practice.length} practice tasks done.` : null,
                  ]
                    .filter(Boolean)
                    .join(' ') || 'Nice work.'}
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {props.next ? (
                <Button variant="primary" rightIcon={<ArrowRight />} onClick={props.next.onGo}>
                  Next: {props.next.label}
                </Button>
              ) : null}
              <Button variant={props.next ? 'secondary' : 'primary'} onClick={props.onClose}>Back to Today</Button>
            </div>
          </div>
        )}
      </Card>

      {screen.kind !== 'done' && (
        <footer className="flex items-center gap-2">
          <Button variant="ghost" leftIcon={<ArrowLeft />} disabled={at === 0} onClick={back}>
            Back
          </Button>
          <span className="mr-auto hidden text-caption text-fg-subtle md:inline">Use ← and → to move, Esc to close.</span>
          <Button variant="primary" rightIcon={<ArrowRight />} onClick={nextScreen}>
            {primaryLabel}
          </Button>
        </footer>
      )}
    </div>
  );
}

import React, { useMemo, useRef } from 'react';
import { ArrowLeft, Lightbulb, ListChecks, PlayCircle } from 'lucide-react';
import { Badge, Button, Card, EmptyState, useToast } from '@nomadic/ui';
import type { GradeResult, LearningEvent, ProblemNote, Roadmap } from '@job-automator/learning';
import { getApi, type LearningEventInput } from '../../types';
import { learnIndex, problemByRef } from './catalog';
import { quizItemById, type QuizItem } from './content';
import { InlineText } from './InlineText';
import { CheckSection, PointList, ProblemCard } from './lessonParts';
import { LessonLinks, type LessonLinksProps } from './LessonLinks';
import {
  formatMinutes,
  knowThisEvent,
  problemAttemptedEvent,
  solvedEvent,
  solvedRefs,
  topicProblems,
  untickEvent,
  type Progress,
} from './learnModel';
import { topicQuizEvents } from './quizLogic';
import { lessonContent, lessonPoints } from './sessionModel';

type Result = Promise<{ ok: boolean; error?: string }>;

const TIER_LABEL = { must: 'Must do', good: 'Good to do', stretch: 'Stretch', company: 'Company list' } as const;

interface LessonReferenceProps {
  topicId: string;
  roadmap: Roadmap | null;
  progress: Progress | null;
  events: LearningEvent[];
  notes: ProblemNote[];
  trackId: string;
  practiceRemaining: number;
  isFree: boolean;
  intake?: LessonLinksProps['intake'];
  backLabel?: string;
  onBack: () => void;
  /** Opens the lesson in focus mode (only when it is in the plan). */
  onStudy?: () => void;
  onRecord: (events: LearningEventInput[]) => Result;
  onSaveNote: (note: ProblemNote) => Result;
  onOpenUpgrade?: (feature?: string) => void;
}

/**
 * A topic on one page, to look something up: summary, every point, the recap,
 * its problems and the check. Problems solved here tick the matching task of
 * the plan, so there is one way to mark a problem done.
 */
export function LessonReference(props: LessonReferenceProps) {
  const { topicId, roadmap, progress, events, notes, trackId, practiceRemaining, isFree, onRecord } = props;
  const { toast } = useToast();
  const index = learnIndex();
  const openedAt = useRef(Date.now());
  const content = useMemo(() => lessonContent(topicId, roadmap, index), [topicId, roadmap, index]);
  const quiz = useMemo(
    () => (content?.quizItemIds ?? []).map((id) => quizItemById(id)).filter((x): x is QuizItem => !!x),
    [content]
  );
  if (!content) {
    return <EmptyState bordered title="Topic not found" description="This topic is no longer in the catalogue." actions={<Button onClick={props.onBack}>Go back</Button>} />;
  }
  const points = lessonPoints(content.points);
  const learned = progress?.done.has(`${topicId}/learn`) || progress?.doneTasks.has(`${topicId}/learn`);
  const quizDone = progress?.done.has(`${topicId}/quiz`) ?? false;
  const solved = solvedRefs(progress?.done ?? new Set(), events);
  const rows = topicProblems(topicId, roadmap, index);

  const record = async (evs: LearningEventInput[], ok?: string) => {
    const res = await onRecord(evs);
    if (!res.ok) toast({ title: 'Not saved', description: res.error, tone: 'danger' });
    else if (ok) toast({ title: ok, tone: 'success' });
    return res;
  };

  /** A problem of the plan is ticked as its task; anything else is recorded as an attempt. */
  const markSolved = (ref: string, hint: boolean) => {
    const task = progress?.tasks.find((t) => t.problem_ref === ref);
    const now = new Date();
    return record([task ? solvedEvent(task, task.id, 0, hint, trackId, index, now) : problemAttemptedEvent(ref, hint, trackId, now)]);
  };
  const undoSolved = (ref: string) => {
    const task = progress?.tasks.find((t) => t.problem_ref === ref);
    if (!task) return Promise.resolve({ ok: false, error: 'Only problems in your plan can be unticked.' });
    const keys = [...(progress?.done ?? [])].filter((k) => k === task.id || k.startsWith(`${task.id}@`));
    return record(keys.map((k) => untickEvent(task, k, trackId, index, new Date())));
  };

  const submitCheck = async (grades: GradeResult[]) => {
    const { events: evs } = topicQuizEvents(topicId, quiz, grades, trackId, new Date(), (Date.now() - openedAt.current) / 1000);
    const res = await onRecord(evs);
    if (!res.ok) toast({ title: 'Your answers were not saved', description: res.error, tone: 'danger' });
    return res;
  };

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-4" aria-labelledby="lesson-ref-title">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" leftIcon={<ArrowLeft />} onClick={props.onBack}>{props.backLabel ?? 'Back'}</Button>
        {props.onStudy && (
          <Button className="ml-auto" size="sm" variant="primary" leftIcon={<PlayCircle />} onClick={props.onStudy}>
            Study it step by step
          </Button>
        )}
      </div>
      <header className="flex flex-col gap-1">
        <h2 id="lesson-ref-title" className="text-title font-strong text-fg">{content.title}</h2>
        <div className="flex flex-wrap items-center gap-2 text-caption text-fg-subtle">
          <span>{content.moduleTitle}</span>
          <span>· {formatMinutes(content.minutes)} to learn</span>
          {content.unreviewed && <Badge size="sm" tone="warning">AI-drafted, under review</Badge>}
          {learned && <Badge size="sm" tone="success">Learned</Badge>}
        </div>
      </header>

      <Card padding="lg" className="flex flex-col gap-4">
        {content.summary && <p className="text-body-lg text-fg"><InlineText text={content.summary} /></p>}
        {points.length > 0 && (
          <section aria-labelledby="lesson-ref-points" className="flex flex-col gap-3">
            <h3 id="lesson-ref-points" className="flex items-center gap-2 text-heading font-strong text-fg">
              <ListChecks className="size-4 text-accent" aria-hidden="true" /> What to learn
            </h3>
            <PointList points={points} />
          </section>
        )}
        {content.recap.length > 0 && (
          <section aria-labelledby="lesson-ref-recap" className="flex flex-col gap-1.5 rounded-lg border border-accent/30 bg-accent-subtle/50 p-3">
            <h3 id="lesson-ref-recap" className="flex items-center gap-2 text-body font-strong text-accent-subtle-fg">
              <Lightbulb className="size-4" aria-hidden="true" /> Remember
            </h3>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-fg-muted">
              {content.recap.map((k) => <li key={k}><InlineText text={k} /></li>)}
            </ul>
          </section>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {content.topic && <LessonLinks topic={content.topic} intake={props.intake} />}
          {content.topic && !learned && (
            <Button
              className="ml-auto"
              size="sm"
              variant="ghost"
              onClick={() => void record([knowThisEvent(topicId, content.topic!.skill_ids[0] ?? null, trackId, new Date())], 'Marked as learned')}
            >
              I already know this
            </Button>
          )}
        </div>
      </Card>

      {content.topic && content.topic.tasks.length > 0 && (
        <section aria-labelledby="lesson-ref-handson" className="flex flex-col gap-2">
          <h3 id="lesson-ref-handson" className="text-heading font-strong text-fg">Hands-on</h3>
          <ul className="flex flex-col gap-1">
            {content.topic.tasks.map((t) => (
              <li key={t.key} className="text-body text-fg">
                {t.title} <span className="text-caption text-fg-subtle">· {formatMinutes(t.minutes)}{t.optional ? ' · optional' : ''}</span>
              </li>
            ))}
          </ul>
          <p className="text-caption text-fg-subtle">Your plan gives these their own time in a session.</p>
        </section>
      )}

      {rows.length > 0 && (
        <section aria-labelledby="lesson-ref-problems" className="flex flex-col gap-2">
          <h3 id="lesson-ref-problems" className="text-heading font-strong text-fg">Problems</h3>
          <ul className="flex flex-col gap-3">
            {rows.map((row) => {
              const p = problemByRef(row.ref);
              if (!p) return null;
              const inPlan = !!progress?.tasks.some((t) => t.problem_ref === row.ref);
              return (
                <li key={row.ref}>
                  <ProblemCard
                    problem={p}
                    done={solved.has(row.ref)}
                    tag={row.company ? `On ${row.company}'s list` : TIER_LABEL[row.tier]}
                    note={notes.find((n) => n.ref === row.ref)}
                    onOpen={() => void getApi().openExternalUrl(p.link)}
                    onSolved={(hint) => markSolved(row.ref, hint)}
                    onUndo={inPlan ? () => undoSolved(row.ref) : undefined}
                    onSaveNote={props.onSaveNote}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="lesson-ref-check" className="flex flex-col gap-2">
        <h3 id="lesson-ref-check" className="text-heading font-strong text-fg">Check yourself</h3>
        <CheckSection
          items={quiz}
          title={content.title}
          practiceRemaining={practiceRemaining}
          isFree={isFree}
          done={quizDone}
          onSubmit={submitCheck}
          onOpenUpgrade={props.onOpenUpgrade}
        />
      </section>
    </article>
  );
}

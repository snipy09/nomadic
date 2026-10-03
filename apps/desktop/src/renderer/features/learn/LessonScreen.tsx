import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, ExternalLink } from 'lucide-react';
import { Badge, Button, Card, EmptyState, useToast } from '@nomadic/ui';
import type { GradeResult, Lesson } from '@job-automator/learning';
import { getApi, type LearningEventInput } from '../../types';
import { checkItemsFor, lessonResources, skillById, skillName } from './content';
import { InlineText } from './InlineText';
import { checkEvents, lessonViewedEvent, type PathStep } from './learnLogic';
import { QuizForm } from './QuizForm';

interface LessonScreenProps {
  lesson: Lesson;
  trackId: string;
  /** The skill's place on the path (null when the skill is not on the current path). */
  step: PathStep | null;
  practiceRemaining: number;
  /** Practice questions allowed per day on this plan. */
  practiceLimit: number;
  isFree: boolean;
  backLabel: string;
  onBack: () => void;
  onRecord: (events: LearningEventInput[]) => Promise<{ ok: boolean; error?: string }>;
  /** The next lesson after this one passes, if any. */
  nextLesson: { id: string; title: string } | null;
  onOpenLesson: (lessonId: string) => void;
  onOpenUpgrade?: (feature?: string) => void;
}

type Mode = 'check' | 'placement' | null;

const TYPE_LABEL: Record<string, string> = {
  video: 'Video', doc: 'Docs', book: 'Book', course: 'Course', cheatsheet: 'Cheat sheet',
  article: 'Article', interactive: 'Interactive', problem: 'Practice problems',
};

/** Lesson: summary, curated resources, and the check that completes it (or a placement check to skip it). */
export function LessonScreen(props: LessonScreenProps) {
  const { lesson, trackId, step, practiceRemaining, practiceLimit, isFree, backLabel, onBack, onRecord, nextLesson, onOpenLesson, onOpenUpgrade } = props;
  const { toast } = useToast();
  const skill = skillById(lesson.skill_id);
  const resources = useMemo(() => lessonResources(lesson), [lesson]);
  const items = useMemo(() => checkItemsFor(lesson), [lesson]);
  const locked = step?.state === 'locked';
  const masteredAtOpen = useRef(step?.state === 'mastered');
  const [mode, setMode] = useState<Mode>(() => (step?.state === 'mastered' || locked ? null : 'check'));
  // The attempt whose results are on screen; the daily limit only blocks starting a new one.
  const [submitted, setSubmitted] = useState<Mode>(null);
  const openedAt = useRef(Date.now());
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Opening a lesson is recorded once per visit (it never counts toward mastery).
  useEffect(() => {
    headingRef.current?.focus();
    openedAt.current = Date.now();
    void onRecord([lessonViewedEvent(lesson, trackId, new Date())]);
  }, [lesson.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const overLimit = practiceRemaining < items.length && submitted !== mode;

  const submit = (kind: 'lesson' | 'placement') => async (grades: GradeResult[]) => {
    const { events } = checkEvents(kind, lesson, items, grades, trackId, new Date(), (Date.now() - openedAt.current) / 1000);
    const res = await onRecord(events);
    if (res.ok) setSubmitted(kind === 'lesson' ? 'check' : 'placement');
    if (!res.ok) toast({ title: 'Your answers were not saved', description: res.error, tone: 'danger' });
    return res;
  };

  const result = (kind: 'lesson' | 'placement') => (grades: GradeResult[], reset: () => void) => {
    const right = grades.filter((g) => g.correct).length;
    const passed = right / grades.length >= 0.8;
    return (
      <Card padding="md" className={passed ? 'border-success/40 bg-success-subtle/40' : 'border-warning/40 bg-warning-subtle/40'}>
        <div className="flex flex-col gap-2">
          <p className="text-body font-strong text-fg">
            {passed
              ? kind === 'lesson' ? 'Lesson complete.' : `Placed out of ${lesson.title}.`
              : `${right} of ${grades.length} correct. You need 80% to ${kind === 'lesson' ? 'complete the lesson' : 'skip it'}.`}
          </p>
          <p className="text-body text-fg-muted">
            {passed
              ? 'These questions come back for a quick review on your Today screen so they stick.'
              : 'The questions you missed come back for review tomorrow. Read the summary again and retry when ready.'}
          </p>
          <div className="flex flex-wrap gap-2">
            {passed && nextLesson && <Button onClick={() => onOpenLesson(nextLesson.id)}>Next: {nextLesson.title}</Button>}
            {!passed && kind === 'lesson' && <Button onClick={() => { setSubmitted(null); reset(); }} disabled={practiceRemaining < items.length}>Try again</Button>}
            {!passed && kind === 'placement' && <Button onClick={() => { setSubmitted(null); setMode(locked ? null : 'check'); }}>Take the lesson instead</Button>}
            <Button variant={passed && nextLesson ? 'ghost' : 'secondary'} onClick={onBack}>{backLabel}</Button>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <article className="flex flex-col gap-4" aria-labelledby="learn-lesson-title">
      <div>
        <Button variant="ghost" size="sm" leftIcon={<ArrowLeft />} onClick={onBack}>{backLabel}</Button>
      </div>

      <header className="flex flex-col gap-1">
        <h2 id="learn-lesson-title" ref={headingRef} tabIndex={-1} className="text-title font-strong text-fg outline-none">{lesson.title}</h2>
        <div className="flex flex-wrap items-center gap-2 text-caption text-fg-subtle">
          {skill && <span>Level {skill.level}</span>}
          <span>About {lesson.estimated_minutes} min</span>
          {step?.state === 'mastered' && <Badge tone="success" size="sm">Mastered</Badge>}
          {locked && <Badge size="sm">Locked</Badge>}
        </div>
      </header>

      <Card padding="md" className="flex flex-col gap-3">
        <p className="text-body-lg text-fg"><InlineText text={lesson.summary_md} /></p>
        {lesson.key_points.length > 0 && (
          <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-fg-muted">
            {lesson.key_points.map((k) => <li key={k}><InlineText text={k} /></li>)}
          </ul>
        )}
      </Card>

      <section aria-labelledby="learn-resources-heading" className="flex flex-col gap-2">
        <h3 id="learn-resources-heading" className="text-heading font-strong text-fg">Resources</h3>
        {resources.length === 0 ? (
          <Card variant="sunken" padding="sm" className="text-body text-fg-muted">
            No curated resource for this lesson yet. The summary above and the check below cover the essentials.
          </Card>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {resources.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
                <div className="mr-auto min-w-0">
                  <div className="text-body text-fg">{r.title}</div>
                  <div className="text-caption text-fg-subtle">
                    {r.provider} · {TYPE_LABEL[r.type] ?? r.type}{r.duration_minutes ? ` · ${r.duration_minutes} min` : ''}{r.is_free ? ' · free' : ''}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  rightIcon={<ExternalLink />}
                  aria-label={`Open ${r.title} in your browser`}
                  onClick={() => { void getApi().openExternalUrl(r.url); }}
                >
                  Open
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="learn-check-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id="learn-check-heading" className="mr-auto text-heading font-strong text-fg">
            {mode === 'placement' ? 'Placement check' : 'Check your understanding'}
          </h3>
          {mode !== 'placement' && !masteredAtOpen.current && items.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => { setSubmitted(null); setMode('placement'); }}>I already know this</Button>
          )}
          {mode === 'placement' && !locked && (
            <Button variant="ghost" size="sm" onClick={() => { setSubmitted(null); setMode('check'); }}>Back to the lesson check</Button>
          )}
        </div>

        {items.length === 0 ? (
          <EmptyState size="sm" bordered icon={<BookOpen />} title="No check for this lesson yet" description="Questions for this skill are being written." />
        ) : overLimit && mode !== null ? (
          <Card padding="md" className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-body font-strong text-fg">Daily practice limit reached</div>
              <div className="text-caption text-fg-subtle">
                {isFree ? `The free plan includes ${practiceLimit} practice questions a day. Come back tomorrow or upgrade.` : 'Come back tomorrow.'}
              </div>
            </div>
            {isFree && onOpenUpgrade && <Button onClick={() => onOpenUpgrade('Unlimited practice')}>Upgrade</Button>}
          </Card>
        ) : mode === 'check' ? (
          <>
            <p className="text-body text-fg-muted">Answer {items.length === 1 ? 'the question' : `all ${items.length} questions`}. Get 80% right to complete the lesson.</p>
            <QuizForm key={`check-${lesson.id}`} items={items} label="Lesson check" submitLabel="Check answers" onSubmit={submit('lesson')} renderResult={result('lesson')} />
          </>
        ) : mode === 'placement' ? (
          <>
            <p className="text-body text-fg-muted">Already know {lesson.title}? Get 80% right and it counts as mastered, so your path moves on.</p>
            <QuizForm key={`placement-${lesson.id}`} items={items} label="Placement check" submitLabel="Check answers" onSubmit={submit('placement')} renderResult={result('placement')} />
          </>
        ) : locked ? (
          <Card variant="sunken" padding="sm" className="text-body text-fg-muted">
            Finish {step!.blockedBy.map(skillName).join(', ')} first, or take the placement check if you already know this.
          </Card>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-body text-fg-muted">You have mastered this skill.</p>
            <Button variant="secondary" size="sm" onClick={() => { setSubmitted(null); setMode('check'); }}>Practise again</Button>
          </div>
        )}
      </section>
    </article>
  );
}

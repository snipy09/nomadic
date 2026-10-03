import React, { useState } from 'react';
import { BookOpen, Flame, RotateCcw } from 'lucide-react';
import { Button, Card, EmptyState, ProgressRing, useToast } from '@nomadic/ui';
import type { GradeResult } from '@job-automator/learning';
import type { LearningEventInput } from '../../types';
import { skillName, type QuizItem } from './content';
import { reviewEvents, type TodayModel } from './learnLogic';
import { QuizForm } from './QuizForm';

interface TodayScreenProps {
  today: TodayModel;
  trackId: string;
  isFree: boolean;
  onRecord: (events: LearningEventInput[]) => Promise<{ ok: boolean; error?: string }>;
  onOpenLesson: (lessonId: string) => void;
  onOpenPath: () => void;
  onOpenUpgrade?: (feature?: string) => void;
}

/** Today: due reviews first (SM-2), then the next lesson; streak and weekly goal. */
export function TodayScreen({ today, trackId, isFree, onRecord, onOpenLesson, onOpenPath, onOpenUpgrade }: TodayScreenProps) {
  const { toast } = useToast();
  // Freeze the due items while a review session is open (recording them changes what is due).
  const [session, setSession] = useState<QuizItem[] | null>(null);

  const submitReviews = async (grades: GradeResult[]) => {
    const res = await onRecord(reviewEvents(session ?? [], grades, trackId, new Date()));
    if (!res.ok) toast({ title: 'Your answers were not saved', description: res.error, tone: 'danger' });
    return res;
  };

  const unlimited = !Number.isFinite(today.limit);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card padding="md" className="flex items-center gap-3">
          <Flame className="size-6 shrink-0 text-warning" aria-hidden="true" />
          <div>
            <div className="text-title font-strong text-fg">{today.streak.current} {today.streak.current === 1 ? 'day' : 'days'}</div>
            <div className="text-caption text-fg-subtle">
              Streak{today.streak.activeToday ? ' · done today' : today.streak.current > 0 ? ' · study today to keep it' : ''} · best {today.streak.longest}
            </div>
          </div>
        </Card>
        <Card padding="md" className="flex items-center gap-3">
          <ProgressRing value={today.week.activeDays} max={today.week.target} size={48} thickness={5} label="Weekly goal" tone={today.week.activeDays >= today.week.target ? 'success' : 'accent'}>
            <span className="text-caption font-strong text-fg">{Math.min(today.week.activeDays, today.week.target)}/{today.week.target}</span>
          </ProgressRing>
          <div>
            <div className="text-body font-strong text-fg">Weekly goal</div>
            <div className="text-caption text-fg-subtle">Study {today.week.target} days a week (last 7 days)</div>
          </div>
        </Card>
        <Card padding="md">
          <div className="text-body font-strong text-fg">Practice today</div>
          <div className="text-caption text-fg-subtle">
            {unlimited ? `${today.practiceUsed} questions answered` : `${today.practiceUsed} of ${today.limit} questions used`}
          </div>
          {today.limitReached && isFree && onOpenUpgrade && (
            <Button size="sm" variant="subtle" className="mt-2" onClick={() => onOpenUpgrade('Unlimited practice')}>Upgrade for unlimited</Button>
          )}
        </Card>
      </div>

      <section aria-labelledby="learn-reviews-heading" className="flex flex-col gap-2">
        <h2 id="learn-reviews-heading" className="text-heading font-strong text-fg">Reviews</h2>
        {session ? (
          <QuizForm
            items={session}
            label="Review"
            submitLabel="Check answers"
            onSubmit={submitReviews}
            renderResult={(grades) => {
              const right = grades.filter((g) => g.correct).length;
              return (
                <Card padding="md" className="flex flex-wrap items-center gap-3">
                  <p className="mr-auto text-body text-fg">
                    {right} of {grades.length} remembered. {right < grades.length ? 'Missed ones come back tomorrow; the rest come back later.' : 'They come back at longer intervals.'}
                  </p>
                  <Button onClick={() => setSession(null)}>Done</Button>
                </Card>
              );
            }}
          />
        ) : today.reviews.length > 0 ? (
          <Card padding="md" className="flex flex-wrap items-center gap-3">
            <RotateCcw className="size-5 shrink-0 text-accent" aria-hidden="true" />
            <div className="mr-auto">
              <div className="text-body font-strong text-fg">{today.reviews.length} {today.reviews.length === 1 ? 'question' : 'questions'} due</div>
              <div className="text-caption text-fg-subtle">
                {[...new Set(today.reviews.map((r) => r.item.skill_id))].slice(0, 3).map(skillName).join(', ')}
              </div>
            </div>
            <Button onClick={() => setSession(today.reviews.map((r) => r.item))}>Start review</Button>
          </Card>
        ) : today.limitReached ? (
          <Card variant="sunken" padding="sm" className="text-body text-fg-muted">
            Daily practice limit reached. Reviews wait until tomorrow.
          </Card>
        ) : (
          <Card variant="sunken" padding="sm" className="text-body text-fg-muted">
            No reviews due. Questions you answer come back here on a spaced schedule, missed ones the next day.
          </Card>
        )}
      </section>

      <section aria-labelledby="learn-next-heading" className="flex flex-col gap-2">
        <h2 id="learn-next-heading" className="text-heading font-strong text-fg">Next lesson</h2>
        {today.lesson ? (
          <Card padding="md" className="flex flex-wrap items-center gap-3">
            <BookOpen className="size-5 shrink-0 text-accent" aria-hidden="true" />
            <div className="mr-auto min-w-0">
              <div className="text-body font-strong text-fg">{today.lesson.title}</div>
              <div className="text-caption text-fg-subtle">About {today.lesson.estimated_minutes} min with resources · a short check completes it</div>
            </div>
            <Button onClick={() => onOpenLesson(today.lesson!.id)}>Start lesson</Button>
          </Card>
        ) : (
          <EmptyState
            size="sm"
            bordered
            title="Your path is complete"
            description="Every skill on your path is mastered. Set a new goal to keep going."
            actions={<Button variant="secondary" onClick={onOpenPath}>Open My path</Button>}
          />
        )}
      </section>
    </div>
  );
}

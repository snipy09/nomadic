import React, { useEffect, useMemo, useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { Button, EmptyState, Skeleton, Tabs, TabsList, TabsTrigger } from '@nomadic/ui';
import { learnTierFor } from '@job-automator/learning';
import type { AppUser } from '../../types';
import { GoalSetup } from './GoalSetup';
import { lessonById, roleById } from './content';
import { asEvents, buildPath, buildToday } from './learnLogic';
import { LessonScreen } from './LessonScreen';
import { PathScreen } from './PathScreen';
import { TodayScreen } from './TodayScreen';
import { useLearning } from './useLearning';

interface LearnViewProps {
  currentUser?: Pick<AppUser, 'tier'> | null;
  /** Role family suggested from the profile for first-run goal setup. */
  suggestedRole?: string;
  onOpenUpgrade?: (feature?: string) => void;
  onLog?: (msg: string) => void;
}

type Screen =
  | { name: 'today' | 'path' | 'goal' }
  | { name: 'lesson'; lessonId: string; from: 'today' | 'path' };

/** Learn: goal setup, My Path, Lesson and Today, all derived from the goal and the event log. */
export function LearnView({ currentUser, suggestedRole, onOpenUpgrade, onLog }: LearnViewProps) {
  const data = useLearning();
  const [screen, setScreen] = useState<Screen | null>(null);
  const tier = learnTierFor(currentUser?.tier);
  const isFree = tier === 'free';
  const events = useMemo(() => asEvents(data.events), [data.events]);

  const path = useMemo(() => (data.goal ? buildPath(data.goal, events) : null), [data.goal, events]);
  const today = useMemo(() => (path ? buildToday(path, events, tier, new Date()) : null), [path, events, tier]);

  // First screen once loaded: goal setup, else My Path for a fresh path, else Today.
  useEffect(() => {
    if (data.status !== 'ready' || screen) return;
    if (!data.goal) setScreen({ name: 'goal' });
    else {
      const studied = data.events.some((e) => e.type !== 'skill_marked_known' || e.payload.source !== 'onboarding');
      setScreen({ name: studied ? 'today' : 'path' });
    }
  }, [data.status, data.goal, data.events, screen]);

  if (data.status === 'loading' && !screen) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading your learning path">
        <Skeleton height={28} width={220} />
        <Skeleton height={80} radius="lg" />
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height={52} radius="lg" />)}
      </div>
    );
  }

  if (data.status === 'error') {
    return (
      <EmptyState
        tone="danger"
        bordered
        title="Could not load your learning path"
        description={data.error ?? 'Something went wrong reading your progress.'}
        actions={<Button onClick={data.reload}>Try again</Button>}
      />
    );
  }

  const openLesson = (lessonId: string) =>
    setScreen((s) => ({ name: 'lesson', lessonId, from: s?.name === 'today' ? 'today' : s?.name === 'lesson' ? s.from : 'path' }));

  const record = async (input: Parameters<typeof data.record>[0]) => {
    const res = await data.record(input);
    if (!res.ok) onLog?.(`[Learn] Progress not saved: ${res.error}`);
    return res;
  };

  const header = (
    <header className="flex flex-wrap items-end gap-3">
      <div className="mr-auto">
        <h1 className="text-title font-strong text-fg">Learn</h1>
        <p className="text-caption text-fg-subtle">
          {data.goal ? `${roleById(data.goal.track_id)?.name ?? data.goal.track_id} path` : 'Build a path to your target role'}
          {data.pendingSync > 0 ? ' · saved on this device, syncs when you are online' : ''}
        </p>
      </div>
      {path && (screen?.name === 'today' || screen?.name === 'path') && (
        <Tabs variant="segmented" value={screen.name} onValueChange={(v) => setScreen({ name: v as 'today' | 'path' })}>
          <TabsList aria-label="Learn sections">
            <TabsTrigger value="today" count={today?.reviews.length || undefined}>Today</TabsTrigger>
            <TabsTrigger value="path">My path</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
    </header>
  );

  let body: React.ReactNode;
  if (!screen || screen.name === 'goal' || !data.goal || !path || !today) {
    body = (
      <GoalSetup
        goal={data.goal}
        events={data.events}
        suggestedRole={suggestedRole}
        onCancel={data.goal ? () => setScreen({ name: 'path' }) : undefined}
        onSave={async (g) => {
          const res = await data.saveGoal(g);
          if (res.ok) {
            onLog?.(`[Learn] Goal set: ${g.track_id}, ${g.daily_hours * 5} h/week, ${g.horizon_months} months.`);
            setScreen({ name: 'path' });
          }
          return res;
        }}
      />
    );
  } else if (screen.name === 'lesson') {
    const lesson = lessonById(screen.lessonId);
    const step = [...path.steps, ...path.done].find((s) => s.lessonId === screen.lessonId) ?? null;
    const next = path.next && path.next.lessonId && path.next.lessonId !== screen.lessonId ? lessonById(path.next.lessonId) : undefined;
    const back = () => setScreen({ name: screen.from });
    body = lesson ? (
      <LessonScreen
        key={lesson.id}
        lesson={lesson}
        trackId={data.goal.track_id}
        step={step}
        practiceRemaining={today.practiceRemaining}
        practiceLimit={today.limit}
        isFree={isFree}
        backLabel={screen.from === 'today' ? 'Back to Today' : 'Back to My path'}
        onBack={back}
        onRecord={record}
        nextLesson={next ? { id: next.id, title: next.title } : null}
        onOpenLesson={openLesson}
        onOpenUpgrade={onOpenUpgrade}
      />
    ) : (
      <EmptyState bordered icon={<GraduationCap />} title="Lesson not found" description="This lesson is no longer in the catalogue." actions={<Button onClick={back}>Go back</Button>} />
    );
  } else if (screen.name === 'today') {
    body = (
      <TodayScreen
        today={today}
        trackId={data.goal.track_id}
        isFree={isFree}
        onRecord={record}
        onOpenLesson={openLesson}
        onOpenPath={() => setScreen({ name: 'path' })}
        onOpenUpgrade={onOpenUpgrade}
      />
    );
  } else {
    body = <PathScreen goal={data.goal} path={path} onOpenLesson={openLesson} onChangeGoal={() => setScreen({ name: 'goal' })} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-16">
      {header}
      {body}
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Skeleton, Tabs, TabsList, TabsTrigger, useToast } from '@nomadic/ui';
import {
  applyRoadmapDiff,
  doMore,
  learnTierFor,
  moveEntry,
  paceFactor,
  replan,
  skipToday,
  type LearningEvent,
  type PlanTask,
  type Roadmap,
  type RoleFamilyId,
  type Schedule,
  type Shortfall,
} from '@job-automator/learning';
import type { AppUser } from '../../types';
import { ProjectBuild } from '../projects/ProjectBuild';
import { ProjectLibrary } from '../projects/ProjectLibrary';
import { ActivityHeatmap } from './ActivityHeatmap';
import { allProjects, learnIndex, projectById } from './catalog';
import { isRoleId, roleById } from './content';
import { FeasibilityBar, IntakeFields } from './IntakeFields';
import {
  buildTodayModel,
  defaultIntakeDraft,
  draftProblem,
  draftToIntake,
  feasibilityOf,
  intakeToDraft,
  progressModel,
  progressOf,
  taskDoneEvent,
  todayOf,
  untickEvent,
  type EntryView,
  type IntakeDraft,
} from './learnModel';
import { ProgressScreen } from './ProgressScreen';
import { practiceLeft } from './quizLogic';
import { AdjustPanel, GeneratingState, ReviewScreen } from './ReviewScreen';
import { RoadmapScreen } from './RoadmapScreen';
import { TodayScreen } from './TodayScreen';
import { TopicScreen } from './TopicScreen';
import { useLearning } from './useLearning';
import { WeekScreen } from './WeekScreen';

interface LearnViewProps {
  currentUser?: Pick<AppUser, 'tier'> | null;
  /** Role family suggested from the profile for the first intake. */
  suggestedRole?: string;
  onOpenUpgrade?: (feature?: string) => void;
  onLog?: (msg: string) => void;
}

type Tab = 'today' | 'week' | 'roadmap' | 'projects' | 'progress';
type Screen =
  | { name: Tab }
  | { name: 'intake' }
  | { name: 'generating' }
  | { name: 'review' }
  | { name: 'topic'; topicId: string; from: Tab }
  | { name: 'project'; projectId: string; from: Tab };

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'roadmap', label: 'Roadmap' },
  { value: 'projects', label: 'Projects' },
  { value: 'progress', label: 'Progress' },
];

/** Learn v2: intake → review → Today, Week, Roadmap, Projects and Progress, all from the roadmap and event log. */
export function LearnView({ currentUser, suggestedRole, onOpenUpgrade, onLog }: LearnViewProps) {
  const data = useLearning();
  const { toast } = useToast();
  const [screen, setScreen] = useState<Screen | null>(null);
  const [intake, setIntake] = useState<IntakeDraft | null>(null);
  const [shortfall, setShortfall] = useState<Shortfall | null>(null);
  const [now, setNow] = useState(() => new Date());
  const tier = learnTierFor(currentUser?.tier);
  const isFree = tier === 'free';
  const index = learnIndex();
  const events = data.events as unknown as LearningEvent[];
  const today = todayOf(now);

  // Refresh "today" every minute so the day rolls over while the app stays open.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const roadmap = data.roadmap;
  const schedule = data.schedule && roadmap && data.schedule.roadmap_id === roadmap.id ? data.schedule : null;
  const progress = useMemo(() => (roadmap ? progressOf(roadmap, schedule, events, index) : null), [roadmap, schedule, events, index]);
  const todayModel = useMemo(
    () => (schedule && progress ? buildTodayModel({ schedule, progress, events, now }) : null),
    [schedule, progress, events, now]
  );
  const practice = useMemo(() => practiceLeft(events, tier, now), [events, tier, now]);
  const trackId = roadmap?.track_id ?? (suggestedRole && isRoleId(suggestedRole) ? suggestedRole : 'fullstack');

  // First screen once loaded: review a draft, else Today, else the intake.
  useEffect(() => {
    if (data.status !== 'ready' || screen) return;
    if (data.draft) setScreen({ name: 'review' });
    else if (roadmap && schedule) setScreen({ name: 'today' });
    else setScreen({ name: 'intake' });
  }, [data.status, data.draft, roadmap, schedule, screen]);

  const startIntake = () => {
    const role: RoleFamilyId = roadmap?.track_id ?? (suggestedRole && isRoleId(suggestedRole) ? suggestedRole : 'fullstack');
    setIntake(roadmap ? { ...intakeToDraft(roadmap.intake), startDate: today } : defaultIntakeDraft(role, today));
    setScreen({ name: 'intake' });
  };
  useEffect(() => {
    if (screen?.name === 'intake' && !intake) startIntake();
  }, [screen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (data.status === 'loading' && !screen) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading your roadmap">
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
        title="Could not load your roadmap"
        description={data.error ?? 'Something went wrong reading your progress.'}
        actions={<Button onClick={data.reload}>Try again</Button>}
      />
    );
  }

  const generate = async (draft: IntakeDraft) => {
    setScreen({ name: 'generating' });
    const res = await data.generate(draftToIntake(draft));
    if (res.ok) {
      onLog?.(`[Learn] Roadmap draft ready (${res.draft.roadmap.source}).`);
      setScreen({ name: 'review' });
    } else {
      toast({ title: 'Roadmap not built', description: res.error, tone: 'danger' });
      setScreen({ name: 'intake' });
    }
  };

  const saveSchedule = async (next: Schedule, message?: string) => {
    const res = await data.saveSchedule(next);
    if (!res.ok) toast({ title: 'Schedule not saved', description: res.error, tone: 'danger' });
    else if (message) toast({ title: message, tone: 'success' });
  };

  const replanWith = async (opts: { schedule?: Schedule; roadmap?: Roadmap; pace?: number; templates?: 'keep' | 'intake' } = {}) => {
    if (!roadmap || !schedule || !progress) return null;
    const r = replan({
      schedule: opts.schedule ?? schedule,
      roadmap: opts.roadmap ?? roadmap,
      index,
      done: progress.done,
      today,
      pace: opts.pace,
      templates: opts.templates ?? 'keep',
    });
    setShortfall(r.shortfall);
    return r;
  };

  const record = async (input: Parameters<typeof data.record>[0]) => {
    const res = await data.record(input);
    if (!res.ok) onLog?.(`[Learn] Progress not saved: ${res.error}`);
    return res;
  };

  const toggle = async (v: EntryView, done: boolean, durationS: number) => {
    const ev = done
      ? taskDoneEvent(v.task, v.key, v.entry.minutes, durationS, trackId, index, new Date())
      : untickEvent(v.task, v.key, trackId, index, new Date());
    return record([ev]);
  };

  const openTask = (task: PlanTask, from: Tab) => {
    if (task.project_id) setScreen({ name: 'project', projectId: task.project_id, from });
    else if (task.topic_id && index.topics.has(task.topic_id)) setScreen({ name: 'topic', topicId: task.topic_id, from });
  };

  const changeRoadmap = async (next: Roadmap, nextSchedule: Schedule, message: string) => {
    const res = await data.accept(next, nextSchedule);
    if (res.ok) toast({ title: message, tone: 'success' });
    else toast({ title: 'Not saved', description: res.error, tone: 'danger' });
    return res;
  };

  const header = (
    <header className="flex flex-wrap items-end gap-3">
      <div className="mr-auto">
        <h1 className="text-title font-strong text-fg">Learn</h1>
        <p className="text-caption text-fg-subtle">
          {roadmap ? `${roleById(roadmap.track_id)?.name ?? roadmap.track_id} roadmap` : 'Build a roadmap to your target role'}
          {data.pendingSync > 0 ? ' · saved on this device, syncs when you are online' : ''}
        </p>
      </div>
      {roadmap && schedule && screen && TABS.some((t) => t.value === screen.name) && (
        <Tabs variant="segmented" value={screen.name} onValueChange={(v) => setScreen({ name: v as Tab })}>
          <TabsList aria-label="Learn sections">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} count={t.value === 'today' ? todayModel?.entries.filter((e) => !e.done).length || undefined : undefined}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
    </header>
  );

  let body: React.ReactNode;
  const s = screen ?? { name: 'intake' as const };
  const tabOf = (x: Screen): Tab => (TABS.some((t) => t.value === x.name) ? (x.name as Tab) : 'today');

  if (s.name === 'generating') {
    body = <GeneratingState onCancel={() => setScreen({ name: 'intake' })} />;
  } else if (s.name === 'review' && data.draft) {
    body = (
      <ReviewScreen
        key={data.draft.roadmap.id}
        draft={data.draft}
        beginnerOnly={isFree}
        onAccept={async (r, sch) => {
          const res = await data.accept(r, sch);
          if (res.ok) {
            onLog?.(`[Learn] Roadmap accepted: ${r.modules.length} modules.`);
            setScreen({ name: 'today' });
          }
          return res;
        }}
        onRegenerate={(note) => {
          const d = intake ?? intakeToDraft(data.draft!.roadmap.intake);
          const next = { ...d, note: note.trim() ? note.trim() : d.note };
          setIntake(next);
          void generate(next);
        }}
        onEditIntake={() => {
          setIntake(intakeToDraft(data.draft!.roadmap.intake));
          setScreen({ name: 'intake' });
        }}
        onDiscard={roadmap && schedule ? () => { data.discardDraft(); setScreen({ name: 'roadmap' }); } : undefined}
      />
    );
  } else if (s.name === 'intake' || !roadmap || !schedule || !progress || !todayModel) {
    const draft = intake ?? defaultIntakeDraft((suggestedRole && isRoleId(suggestedRole) ? suggestedRole : 'fullstack') as RoleFamilyId, today);
    const problem = draftProblem(draft);
    body = (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-title font-strong text-fg">{roadmap ? 'Make a new roadmap' : 'Plan your roadmap'}</h2>
          <p className="text-body text-fg-muted">Tell us your target, your time and your level. The plan picks modules from the reviewed catalogue and fits them into your days.</p>
        </div>
        <IntakeFields draft={draft} onChange={setIntake} companiesAllowed={!isFree} />
        <FeasibilityBar feasibility={feasibilityOf(draft, index)} />
        {problem && <p role="alert" className="text-body text-danger-fg">{problem}</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void generate(draft)} disabled={!!problem}>Build my roadmap</Button>
          {roadmap && schedule && <Button variant="ghost" onClick={() => setScreen({ name: 'roadmap' })}>Cancel</Button>}
        </div>
      </div>
    );
  } else if (s.name === 'topic') {
    body = (
      <TopicScreen
        topicId={s.topicId}
        roadmap={roadmap}
        progress={progress}
        notes={data.notes}
        trackId={trackId}
        practiceRemaining={practice.remaining}
        isFree={isFree}
        onBack={() => setScreen({ name: s.from })}
        onRecord={record}
        onSaveNote={data.saveNote}
        onOpenUpgrade={onOpenUpgrade}
      />
    );
  } else if (s.name === 'project') {
    const project = projectById(s.projectId);
    const doneModules = new Set((progress ? roadmapModulesDone(progress, roadmap) : []));
    body = project ? (
      <ProjectBuild
        key={project.id}
        project={project}
        mine={data.projects.find((p) => p.project_id === project.id) ?? null}
        doneModules={doneModules}
        trackId={trackId}
        beginnerOnly={isFree}
        onBack={() => setScreen({ name: s.from })}
        onSave={data.saveProject}
        onRecord={record}
        onCheckRepo={data.checkRepo}
        onOpenTopic={(topicId) => setScreen({ name: 'topic', topicId, from: s.from })}
        onOpenUpgrade={onOpenUpgrade}
      />
    ) : (
      <EmptyState bordered title="Project not found" actions={<Button onClick={() => setScreen({ name: s.from })}>Go back</Button>} />
    );
  } else if (s.name === 'week') {
    body = (
      <WeekScreen
        schedule={schedule}
        progress={progress}
        today={today}
        onMove={(key, to) => saveSchedule(moveEntry(schedule, key, to), 'Task moved')}
      />
    );
  } else if (s.name === 'roadmap') {
    body = (
      <RoadmapScreen
        roadmap={roadmap}
        schedule={schedule}
        progress={progress}
        onOpenTopic={(topicId) => setScreen({ name: 'topic', topicId, from: 'roadmap' })}
        onOpenTask={(task) => openTask(task, 'roadmap')}
        onNewRoadmap={startIntake}
        adjust={
          <AdjustPanel
            current={roadmap}
            onPropose={async (instruction) => {
              const res = await data.adjust(instruction);
              return res.success && res.proposal ? { proposal: res.proposal } : { error: res.error };
            }}
            onAccept={(p) => changeRoadmap(p.roadmap, p.schedule, 'Roadmap updated')}
          />
        }
      />
    );
  } else if (s.name === 'projects') {
    body = (
      <ProjectLibrary
        projects={allProjects()}
        mine={data.projects}
        role={roadmap.track_id}
        beginnerOnly={isFree}
        onOpen={(projectId) => setScreen({ name: 'project', projectId, from: 'projects' })}
      />
    );
  } else if (s.name === 'progress') {
    body = <ProgressScreen model={progressModel(schedule, progress, index, today)} forecast={todayModel.forecast} />;
  } else {
    const measured = paceFactor(events);
    body = (
      <TodayScreen
        today={todayModel}
        trackId={trackId}
        isFree={isFree}
        practiceRemaining={practice.remaining}
        paceFactor={schedule.pace_factor}
        measuredPace={measured}
        shortfall={shortfall}
        onToggle={toggle}
        onRecord={record}
        onOpenTask={(task) => openTask(task, tabOf(s))}
        onReplan={async () => {
          const r = await replanWith();
          if (r) await saveSchedule(r.schedule, r.moved ? `${r.moved} tasks moved` : 'Plan is up to date');
        }}
        onSkipToday={async () => {
          const r = skipToday({ schedule, roadmap, index, done: progress.done, today });
          setShortfall(r.shortfall);
          await saveSchedule(r.schedule, 'Today is off; the plan moved forward');
        }}
        onDoMore={async () => {
          const next = doMore(schedule, today, progress.done);
          if (next === schedule) toast({ title: 'Nothing left to pull in', tone: 'neutral' });
          else await saveSchedule(next, 'Added the next task to today');
        }}
        onPace={async (factor) => {
          const r = await replanWith({ pace: factor });
          if (r) await saveSchedule(r.schedule, 'Estimates updated');
        }}
        onShortfallOption={async (option) => {
          if (!shortfall) return;
          if (option === 'drop') {
            const optional = progress.tasks.filter((t) => t.optional && !progress.doneTasks.has(t.id)).reverse().slice(0, shortfall.options.drop_optional ?? 0);
            const left = [...schedule.left_out, ...optional.map((t) => ({ task_id: t.id, minutes: t.minutes, reason: 'optional' as const }))];
            const r = await replanWith({ schedule: { ...schedule, left_out: left } });
            if (r) await saveSchedule(r.schedule, `${optional.length} optional tasks left out`);
            return;
          }
          const diff = option === 'extend' ? { end_date: shortfall.options.extend_to } : { weekend_minutes: shortfall.options.weekend_minutes };
          const applied = applyRoadmapDiff(roadmap, diff, index);
          const r = await replanWith({ roadmap: applied.roadmap, templates: 'intake' });
          if (r) await changeRoadmap(applied.roadmap, r.schedule, 'Plan updated');
        }}
        onOpenUpgrade={onOpenUpgrade}
      />
    );
  }

  const showHeatmap = s.name === 'today' || s.name === 'progress';
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-16">
      {header}
      {showHeatmap && roadmap && <ActivityHeatmap events={events} streak={todayModel?.streak} />}
      {body}
    </div>
  );
}

/** Catalogue modules of the roadmap whose tasks are all done. */
function roadmapModulesDone(progress: ReturnType<typeof progressOf>, roadmap: Roadmap | null): string[] {
  if (!roadmap) return [];
  return roadmap.modules
    .map((m) => m.module_id)
    .filter((id) => {
      const tasks = progress.tasks.filter((t) => t.module_id === id);
      return tasks.length > 0 && tasks.every((t) => progress.doneTasks.has(t.id));
    });
}

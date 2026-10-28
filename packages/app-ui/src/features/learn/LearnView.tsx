import React, { useEffect, useMemo, useState } from 'react';
import { Map as MapIcon, BarChart3, RefreshCw, SlidersHorizontal, Sun } from 'lucide-react';
import { Button, Drawer, DrawerContent, EmptyState, Skeleton, Tabs, TabsList, TabsTrigger, useToast } from '@nomadic/ui';
import {
  applyRoadmapDiff,
  buildPath,
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
import { IS_MOBILE } from '../../platform';
import { ActivityHeatmap } from './ActivityHeatmap';
import { learnIndex, projectById } from './catalog';
import { isRoleId, roleById } from './content';
import { DayScreen } from './DayScreen';
import { IntakeWizard } from './IntakeWizard';
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
import { PathScreen } from './PathScreen';
import { ProgressScreen } from './ProgressScreen';
import { practiceLeft } from './quizLogic';
import { AdjustPanel, GeneratingState, ReviewScreen } from './ReviewScreen';
import { TodayScreen } from './TodayScreen';
import { TopicScreen } from './TopicScreen';
import { useLearning } from './useLearning';

interface LearnViewProps {
  currentUser?: Pick<AppUser, 'tier'> | null;
  /** Role family suggested from the profile for the first intake. */
  suggestedRole?: string;
  onOpenUpgrade?: (feature?: string) => void;
  onLog?: (msg: string) => void;
  /** Which tab to open first when a roadmap exists ('path', 'today' or 'progress'). */
  initialTab?: string | null;
}

type Tab = 'path' | 'today' | 'progress';
type Screen =
  | { name: Tab }
  | { name: 'intake' }
  | { name: 'generating' }
  | { name: 'review' }
  | { name: 'day'; date: string }
  | { name: 'topic'; topicId: string; from: Screen }
  | { name: 'project'; projectId: string; from: Screen };

const TABS: Array<{ value: Tab; label: string; icon: React.ReactNode }> = [
  { value: 'path', label: 'Path', icon: <MapIcon /> },
  { value: 'today', label: 'Today', icon: <Sun /> },
  { value: 'progress', label: 'Progress', icon: <BarChart3 /> },
];
const isTab = (name: string): name is Tab => TABS.some((t) => t.value === name);

/** Learn v2: page-by-page intake → review → a week-by-week path of days, Today and Progress. */
export function LearnView({ currentUser, suggestedRole, onOpenUpgrade, onLog, initialTab }: LearnViewProps) {
  const data = useLearning();
  const { toast } = useToast();
  const [screen, setScreen] = useState<Screen | null>(null);
  const [intake, setIntake] = useState<IntakeDraft | null>(null);
  const [shortfall, setShortfall] = useState<Shortfall | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
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
  const path = useMemo(
    () => (roadmap && schedule && progress ? buildPath({ schedule, roadmap, tasks: progress.byId, index, done: progress.done, today }) : null),
    [roadmap, schedule, progress, index, today]
  );
  const pathDays = useMemo(() => new Map((path?.weeks ?? []).flatMap((w) => w.days).map((d) => [d.date, d])), [path]);
  const practice = useMemo(() => practiceLeft(events, tier, now), [events, tier, now]);
  const trackId = roadmap?.track_id ?? (suggestedRole && isRoleId(suggestedRole) ? suggestedRole : 'fullstack');

  // First screen once loaded: review a draft, else the path, else the intake.
  useEffect(() => {
    if (data.status !== 'ready' || screen) return;
    if (data.draft) setScreen({ name: 'review' });
    else if (roadmap && schedule) setScreen({ name: initialTab && isTab(initialTab) ? initialTab : 'path' });
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
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3" aria-busy="true" aria-label="Loading your roadmap">
        <Skeleton height={28} width={220} />
        <Skeleton height={96} radius="lg" />
        <div className="flex flex-col items-center gap-6 pt-4">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} height={72} width={72} radius="full" />)}
        </div>
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

  const openTask = (task: PlanTask, from: Screen) => {
    if (task.project_id) setScreen({ name: 'project', projectId: task.project_id, from });
    else if (task.topic_id && index.topics.has(task.topic_id)) setScreen({ name: 'topic', topicId: task.topic_id, from });
  };

  const changeRoadmap = async (next: Roadmap, nextSchedule: Schedule, message: string) => {
    const res = await data.accept(next, nextSchedule);
    if (res.ok) toast({ title: message, tone: 'success' });
    else toast({ title: 'Not saved', description: res.error, tone: 'danger' });
    return res;
  };

  const s: Screen = screen ?? { name: 'intake' };
  const activeTab: Tab | null = isTab(s.name) ? s.name : s.name === 'day' ? 'path' : null;
  const ready = !!(roadmap && schedule && progress && todayModel && path);
  const todayOpen = todayModel ? todayModel.entries.filter((e) => !e.done).length : 0;
  const roleName = roadmap ? roleById(roadmap.track_id)?.name ?? roadmap.track_id : '';

  const header = ready && activeTab && (
    <header className="flex flex-wrap items-center gap-3">
      <div className="mr-auto min-w-0">
        <h1 className="text-headline font-bold text-fg">Learn</h1>
        <p className="truncate text-caption text-fg-subtle">
          {roleName} roadmap · {path!.weeks.filter((w) => w.days.length).length} weeks
          {data.pendingSync > 0 ? ' · saved on this device, syncs when you are online' : ''}
        </p>
      </div>
      <Tabs variant="segmented" value={activeTab} onValueChange={(v) => setScreen({ name: v as Tab })}>
        <TabsList aria-label="Learn sections">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} icon={t.icon} count={t.value === 'today' ? todayOpen || undefined : undefined}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </header>
  );

  let body: React.ReactNode;
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
            setScreen({ name: 'path' });
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
        onDiscard={roadmap && schedule ? () => { data.discardDraft(); setScreen({ name: 'path' }); } : undefined}
      />
    );
  } else if (s.name === 'intake' || !ready) {
    const draft = intake ?? defaultIntakeDraft((suggestedRole && isRoleId(suggestedRole) ? suggestedRole : 'fullstack') as RoleFamilyId, today);
    body = (
      <IntakeWizard
        key={roadmap ? `edit-${roadmap.id}` : 'new'}
        title={roadmap ? 'New roadmap' : 'Plan your roadmap'}
        draft={draft}
        onChange={setIntake}
        feasibility={feasibilityOf(draft, index)}
        companiesAllowed={!isFree}
        problem={draftProblem(draft)}
        onSubmit={() => void generate(draft)}
        onCancel={ready ? () => setScreen({ name: 'path' }) : undefined}
      />
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
        onBack={() => setScreen(s.from)}
        onRecord={record}
        onSaveNote={data.saveNote}
        onOpenUpgrade={onOpenUpgrade}
      />
    );
  } else if (s.name === 'project') {
    const project = projectById(s.projectId);
    const doneModules = new Set(roadmapModulesDone(progress!, roadmap));
    body = project && IS_MOBILE ? (
      <EmptyState
        bordered
        title={project.title}
        description="Projects are built in the Nomadic desktop app: starter code, stage checks and your GitHub repo check run there. Your progress syncs to this phone."
        actions={<Button onClick={() => setScreen(s.from)}>Go back</Button>}
      />
    ) : project ? (
      <ProjectBuild
        key={project.id}
        project={project}
        mine={data.projects.find((p) => p.project_id === project.id) ?? null}
        doneModules={doneModules}
        trackId={trackId}
        beginnerOnly={isFree}
        backLabel="Back"
        onBack={() => setScreen(s.from)}
        onSave={data.saveProject}
        onRecord={record}
        onCheckRepo={data.checkRepo}
        onOpenTopic={(topicId) => setScreen({ name: 'topic', topicId, from: s })}
        onOpenUpgrade={onOpenUpgrade}
      />
    ) : (
      <EmptyState bordered title="Project not found" actions={<Button onClick={() => setScreen(s.from)}>Go back</Button>} />
    );
  } else if (s.name === 'day') {
    body =
      s.date === today ? null : (
        <DayScreen
          date={s.date}
          today={today}
          schedule={schedule!}
          progress={progress!}
          pathDay={pathDays.get(s.date) ?? null}
          onBack={() => setScreen({ name: 'path' })}
          onToggle={toggle}
          onOpenTask={(task) => openTask(task, s)}
          onMove={(key, to) => saveSchedule(moveEntry(schedule!, key, to), 'Task moved')}
          intake={roadmap?.intake}
        />
      );
  } else if (s.name === 'progress') {
    body = (
      <div className="flex flex-col gap-4">
        <ActivityHeatmap events={events} streak={todayModel!.streak} />
        <ProgressScreen model={progressModel(schedule!, progress!, index, today)} forecast={todayModel!.forecast} />
      </div>
    );
  } else if (s.name === 'path') {
    const pm = progressModel(schedule!, progress!, index, today);
    const total = pm.modules.reduce((n, m) => n + m.minutes_total, 0);
    const done = pm.modules.reduce((n, m) => n + m.minutes_done, 0);
    body = (
      <>
        <PathScreen
          path={path!}
          today={today}
          streak={todayModel!.streak}
          forecast={todayModel!.forecast}
          roleName={roleName}
          percent={total ? Math.round((done / total) * 100) : 0}
          onOpenDay={(date) => setScreen(date === today ? { name: 'today' } : { name: 'day', date })}
          planActions={
            <>
              <Button size="sm" variant="secondary" leftIcon={<SlidersHorizontal />} onClick={() => setAdjustOpen(true)}>Adjust plan</Button>
              <Button size="sm" variant="ghost" leftIcon={<RefreshCw />} onClick={startIntake}>New roadmap</Button>
            </>
          }
        />
        <Drawer open={adjustOpen} onOpenChange={setAdjustOpen}>
          <DrawerContent side={IS_MOBILE ? 'bottom' : undefined} title="Adjust your plan" description="Tell the planner what changed. You see the new plan before anything is saved." size="lg">
            <AdjustPanel
              current={roadmap!}
              onPropose={async (instruction) => {
                const res = await data.adjust(instruction);
                return res.success && res.proposal ? { proposal: res.proposal } : { error: res.error };
              }}
              onAccept={async (p) => {
                const res = await changeRoadmap(p.roadmap, p.schedule, 'Roadmap updated');
                if (res.ok) setAdjustOpen(false);
                return res;
              }}
            />
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  if (s.name === 'today' || (s.name === 'day' && s.date === today)) {
    body = (
      <TodayScreen
        today={todayModel!}
        pathDay={pathDays.get(today) ?? null}
        trackId={trackId}
        isFree={isFree}
        practiceRemaining={practice.remaining}
        paceFactor={schedule!.pace_factor}
        measuredPace={paceFactor(events)}
        shortfall={shortfall}
        onToggle={toggle}
        onRecord={record}
        onOpenTask={(task) => openTask(task, { name: 'today' })}
        intake={roadmap?.intake}
        onReplan={async () => {
          const r = await replanWith();
          if (r) await saveSchedule(r.schedule, r.moved ? `${r.moved} tasks moved` : 'Plan is up to date');
        }}
        onSkipToday={async () => {
          const r = skipToday({ schedule: schedule!, roadmap: roadmap!, index, done: progress!.done, today });
          setShortfall(r.shortfall);
          await saveSchedule(r.schedule, 'Today is off; the plan moved forward');
        }}
        onDoMore={async () => {
          const next = doMore(schedule!, today, progress!.done);
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
            const optional = progress!.tasks.filter((t) => t.optional && !progress!.doneTasks.has(t.id)).reverse().slice(0, shortfall.options.drop_optional ?? 0);
            const left = [...schedule!.left_out, ...optional.map((t) => ({ task_id: t.id, minutes: t.minutes, reason: 'optional' as const }))];
            const r = await replanWith({ schedule: { ...schedule!, left_out: left } });
            if (r) await saveSchedule(r.schedule, `${optional.length} optional tasks left out`);
            return;
          }
          const diff = option === 'extend' ? { end_date: shortfall.options.extend_to } : { weekend_minutes: shortfall.options.weekend_minutes };
          const applied = applyRoadmapDiff(roadmap!, diff, index);
          const r = await replanWith({ roadmap: applied.roadmap, templates: 'intake' });
          if (r) await changeRoadmap(applied.roadmap, r.schedule, 'Plan updated');
        }}
        onOpenUpgrade={onOpenUpgrade}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 pb-16">
      {header}
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

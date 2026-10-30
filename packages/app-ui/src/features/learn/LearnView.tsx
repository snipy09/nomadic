import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarRange, Sun } from 'lucide-react';
import { Button, Drawer, DrawerContent, EmptyState, Skeleton, Tabs, TabsList, TabsTrigger, useToast } from '@nomadic/ui';
import {
  applyRoadmapDiff,
  buildPath,
  doMore,
  formatDay,
  learnTierFor,
  moveEntry,
  paceFactor,
  pullNextDay,
  replan,
  rollForward,
  skipToday,
  topicTitle,
  type LearningEvent,
  type RoadmapDiffInput,
  type RoleFamilyId,
  type Roadmap,
  type Schedule,
  type Shortfall,
} from '@job-automator/learning';
import type { AppUser } from '../../types';
import { prefs } from '../../store/preferences';
import { ProjectBuild } from '../projects/ProjectBuild';
import { IS_MOBILE } from '../../platform';
import { learnIndex, projectById } from './catalog';
import { isRoleId, roleById } from './content';
import { IntakeWizard } from './IntakeWizard';
import {
  buildTodayModel,
  defaultIntakeDraft,
  draftProblem,
  draftToIntake,
  entryViews,
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
import { LessonPlayer } from './LessonPlayer';
import { LessonReference } from './LessonReference';
import { PlanScreen, PlanSettings, SessionSheetBody } from './PlanScreen';
import { practiceLeft } from './quizLogic';
import { AdjustPanel, GeneratingState, ReviewScreen } from './ReviewScreen';
import { ReviewSession } from './ReviewSession';
import { STEP_LABEL, buildSession, planStatus, weekSummary, type SessionStep } from './sessionModel';
import { ShortfallBanner, TodayScreen, isManualStep } from './TodayScreen';
import { useLearning } from './useLearning';

interface LearnViewProps {
  currentUser?: Pick<AppUser, 'tier'> | null;
  /** Role family suggested from the profile for the first intake. */
  suggestedRole?: string;
  onOpenUpgrade?: (feature?: string) => void;
  onLog?: (msg: string) => void;
  /** Which tab to open first when a roadmap exists: 'today', 'plan' or 'continue' (straight into the next step). Older 'path' / 'progress' open Plan. */
  initialTab?: string | null;
}

type Tab = 'today' | 'plan';
type Screen =
  | { name: Tab }
  | { name: 'intake' }
  | { name: 'generating' }
  | { name: 'review' }
  | { name: 'lesson'; topicId: string; date: string; start: 'intro' | 'check' | 'practice'; from: Tab }
  | { name: 'warmup' }
  | { name: 'topic'; topicId: string; from: Screen }
  | { name: 'project'; projectId: string; from: Screen };

const TABS: Array<{ value: Tab; label: string; icon: React.ReactNode }> = [
  { value: 'today', label: 'Today', icon: <Sun /> },
  { value: 'plan', label: 'Plan', icon: <CalendarRange /> },
];
const isTab = (name: string): name is Tab => name === 'today' || name === 'plan';

/** The screen a session step opens (null for steps ticked on Today). */
function stepScreen(s: SessionStep, date: string, from: Tab): Screen | null {
  if (s.kind === 'review') return { name: 'warmup' };
  if (s.kind === 'project') {
    const pid = s.views[0]?.task.project_id;
    return pid ? { name: 'project', projectId: pid, from: { name: from } } : null;
  }
  if (!s.topicId || isManualStep(s)) return null;
  const start = s.kind === 'check' ? 'check' : s.kind === 'practice' || s.kind === 'handson' ? 'practice' : 'intro';
  return { name: 'lesson', topicId: s.topicId, date, start, from };
}
const tabOf = (intent: string | null | undefined): Tab => (intent === 'plan' || intent === 'path' || intent === 'progress' ? 'plan' : 'today');

/** Learn: setup (intake → review), then Today (the next session) and Plan, with lessons in focus mode. */
export function LearnView({ currentUser, suggestedRole, onOpenUpgrade, onLog, initialTab }: LearnViewProps) {
  const data = useLearning();
  const { toast } = useToast();
  const [screen, setScreen] = useState<Screen | null>(null);
  const [intake, setIntake] = useState<IntakeDraft | null>(null);
  const [shortfall, setShortfall] = useState<Shortfall | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sheetDate, setSheetDate] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const rolled = useRef<string | null>(null);
  const continueOnce = useRef(initialTab === 'continue');
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
  const titleOf = (topicId: string) => (roadmap ? topicTitle(topicId, roadmap, index) : topicId);
  const projectTitleOf = (id: string) => projectById(id)?.title ?? 'Project';

  const sessionFor = (date: string, withReviews: boolean) => {
    const day = schedule?.days.find((d) => d.date === date) ?? null;
    return buildSession({
      views: progress ? entryViews(day, progress) : [],
      titleOf,
      projectTitleOf,
      reviewsDue: withReviews && todayModel ? todayModel.reviews.length + todayModel.resolveDue.length : 0,
      reviewsDoneToday: withReviews && todayModel ? todayModel.reviewsDoneToday : 0,
    });
  };
  const session = useMemo(() => sessionFor(today, true), [schedule, progress, todayModel, today]); // eslint-disable-line react-hooks/exhaustive-deps

  // First screen once loaded: review a draft, else Today / Plan, else the intake.
  useEffect(() => {
    if (data.status !== 'ready' || screen) return;
    if (data.draft) setScreen({ name: 'review' });
    else if (roadmap && schedule) setScreen({ name: tabOf(initialTab) });
    else setScreen({ name: 'intake' });
  }, [data.status, data.draft, roadmap, schedule, screen]); // eslint-disable-line react-hooks/exhaustive-deps

  const startIntake = () => {
    const role: RoleFamilyId = roadmap?.track_id ?? (suggestedRole && isRoleId(suggestedRole) ? suggestedRole : 'fullstack');
    setIntake(roadmap ? { ...intakeToDraft(roadmap.intake), startDate: today } : defaultIntakeDraft(role, today));
    setSettingsOpen(false);
    setScreen({ name: 'intake' });
  };
  useEffect(() => {
    if (screen?.name === 'intake' && !intake) startIntake();
  }, [screen]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveSchedule = async (next: Schedule, message?: string, undo?: Schedule) => {
    const res = await data.saveSchedule(next);
    if (!res.ok) toast({ title: 'Schedule not saved', description: res.error, tone: 'danger' });
    else if (message) {
      toast({
        title: message,
        tone: 'success',
        action: undo ? { label: 'Undo', altText: 'Undo: put the work back where it was', onClick: () => void data.saveSchedule(undo) } : undefined,
      });
    }
    return res;
  };

  // Missed work moves forward by itself (once per day and schedule); Undo puts it back for the rest of the day.
  useEffect(() => {
    if (!roadmap || !schedule || !progress || !screen || !isTab(screen.name)) return;
    const key = `${today}|${schedule.generated_at}`;
    if (rolled.current === key || rolled.current === `undone|${today}`) return;
    rolled.current = key;
    const r = rollForward({ schedule, roadmap, index, done: progress.done, today, now: new Date() });
    if (!r) return;
    const before = schedule;
    setShortfall(r.shortfall);
    void data.saveSchedule(r.schedule).then((res) => {
      if (!res.ok) {
        toast({ title: 'Schedule not saved', description: res.error, tone: 'danger' });
        return;
      }
      rolled.current = `${today}|${r.schedule.generated_at}`;
      if (r.moved > 0) {
        toast({
          title: `Moved ${r.moved} unfinished ${r.moved === 1 ? 'task' : 'tasks'} forward`,
          description: 'Your plan picks up where you left off.',
          tone: 'success',
          action: {
            label: 'Undo',
            altText: 'Undo: put the unfinished work back on its days',
            onClick: () => {
              rolled.current = `undone|${today}`;
              setShortfall(null);
              void data.saveSchedule(before);
            },
          },
        });
      }
    });
  }, [roadmap, schedule, progress, screen, today]); // eslint-disable-line react-hooks/exhaustive-deps

  // Straight into the next step when Home asked to continue.
  useEffect(() => {
    if (!continueOnce.current || screen?.name !== 'today' || !todayModel || !path) return;
    continueOnce.current = false;
    const next = session.next && stepScreen(session.next, today, 'today');
    if (next) setScreen(next);
  }, [screen, todayModel, path, session, today]);

  if (data.status === 'loading' && !screen) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3" aria-busy="true" aria-label="Loading your plan">
        <Skeleton height={28} width={220} />
        <Skeleton height={120} radius="lg" />
        <Skeleton height={96} radius="lg" />
        <Skeleton height={200} radius="lg" />
      </div>
    );
  }
  if (data.status === 'error') {
    return (
      <EmptyState
        tone="danger"
        bordered
        title="Could not load your plan"
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

  const replanWith = (opts: { schedule?: Schedule; roadmap?: Roadmap; pace?: number; templates?: 'keep' | 'intake' } = {}) => {
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
  const toggleStep = async (s: SessionStep, done: boolean) => {
    const res = await record(s.views.map((v) => (done ? taskDoneEvent(v.task, v.key, v.entry.minutes, 0, trackId, index, new Date()) : untickEvent(v.task, v.key, trackId, index, new Date()))));
    if (!res.ok) toast({ title: 'Not saved', description: res.error, tone: 'danger' });
  };

  const changeRoadmap = async (next: Roadmap, nextSchedule: Schedule, message: string) => {
    const res = await data.accept(next, nextSchedule);
    if (res.ok) toast({ title: message, tone: 'success' });
    else toast({ title: 'Not saved', description: res.error, tone: 'danger' });
    return res;
  };
  const applyDiff = async (diff: RoadmapDiffInput, message: string) => {
    if (!roadmap) return;
    const applied = applyRoadmapDiff(roadmap, diff, index);
    const r = replanWith({ roadmap: applied.roadmap, templates: 'intake' });
    if (r) await changeRoadmap(applied.roadmap, r.schedule, message);
  };

  const openStep = (s: SessionStep, date: string, from: Tab) => {
    setSheetDate(null);
    const next = stepScreen(s, date, from);
    if (next) setScreen(next);
  };
  /** The step after the current topic in that day's session, for "Next: …". */
  const nextAfter = (date: string, topicId: string | null, from: Tab) => {
    const s = (date === today ? session : sessionFor(date, false)).steps.find((x) => !x.done && x.topicId !== topicId && x.kind !== 'review');
    if (!s) return null;
    return {
      label: `${STEP_LABEL[s.kind]} · ${s.title}`,
      onGo: () => (isManualStep(s) ? setScreen({ name: from }) : openStep(s, date, from)),
    };
  };

  const s: Screen = screen ?? { name: 'intake' };
  const ready = !!(roadmap && schedule && progress && todayModel && path);

  const roleName = roadmap ? roleById(roadmap.track_id)?.name ?? roadmap.track_id : '';
  const stepsLeft = session.total - session.done;
  const header = ready && isTab(s.name) && (
    <header className="flex flex-wrap items-center gap-3">
      <div className="mr-auto min-w-0">
        <h1 className="text-headline font-bold text-fg">Learn</h1>
        <p className="truncate text-caption text-fg-subtle">
          {roleName} plan · ends {formatDay(schedule!.end_date, false)}
          {data.pendingSync > 0 ? ' · saved on this device, syncs when you are online' : ''}
        </p>
      </div>
      <Tabs variant="segmented" value={s.name} onValueChange={(v) => setScreen({ name: v as Tab })}>
        <TabsList aria-label="Learn sections">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} icon={t.icon} count={t.value === 'today' ? stepsLeft || undefined : undefined}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </header>
  );

  const shortfallOption = async (option: 'extend' | 'weekend' | 'drop') => {
    if (!shortfall || !schedule || !progress) return;
    if (option === 'drop') {
      const optional = progress.tasks.filter((t) => t.optional && !progress.doneTasks.has(t.id)).reverse().slice(0, shortfall.options.drop_optional ?? 0);
      const left = [...schedule.left_out, ...optional.map((t) => ({ task_id: t.id, minutes: t.minutes, reason: 'optional' as const }))];
      const r = replanWith({ schedule: { ...schedule, left_out: left } });
      if (r) await saveSchedule(r.schedule, `${optional.length} optional tasks left out`);
      return;
    }
    await applyDiff(option === 'extend' ? { end_date: shortfall.options.extend_to } : { weekend_minutes: shortfall.options.weekend_minutes }, 'Plan updated');
  };
  const fixBanner = shortfall ? <ShortfallBanner shortfall={shortfall} onOption={shortfallOption} /> : null;

  let body: React.ReactNode = null;
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
        onDiscard={roadmap && schedule ? () => { data.discardDraft(); setScreen({ name: 'today' }); } : undefined}
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
        onCancel={ready ? () => setScreen({ name: 'today' }) : undefined}
      />
    );
  } else if (s.name === 'lesson') {
    const day = schedule!.days.find((d) => d.date === s.date) ?? null;
    const views = entryViews(day, progress!).filter((v) => v.task.topic_id === s.topicId && !v.task.project_id);
    body = (
      <LessonPlayer
        key={`${s.topicId}@${s.date}@${s.start}`}
        topicId={s.topicId}
        views={views}
        start={s.start}
        roadmap={roadmap}
        progress={progress!}
        notes={data.notes}
        trackId={trackId}
        practiceRemaining={practice.remaining}
        isFree={isFree}
        intake={roadmap?.intake}
        next={nextAfter(s.date, s.topicId, s.from)}
        onClose={() => setScreen({ name: s.from })}
        onToggle={toggle}
        onRecord={record}
        onSaveNote={data.saveNote}
        onOpenUpgrade={onOpenUpgrade}
      />
    );
  } else if (s.name === 'warmup') {
    body = (
      <ReviewSession
        items={todayModel!.reviews}
        resolveDue={todayModel!.resolveDue}
        notes={data.notes}
        trackId={trackId}
        practiceRemaining={practice.remaining}
        isFree={isFree}
        next={nextAfter(today, null, 'today')}
        onClose={() => setScreen({ name: 'today' })}
        onRecord={record}
        onSaveNote={data.saveNote}
        onOpenUpgrade={onOpenUpgrade}
      />
    );
  } else if (s.name === 'topic') {
    const inPlan = progress!.tasks.some((t) => t.topic_id === s.topicId);
    body = (
      <LessonReference
        topicId={s.topicId}
        roadmap={roadmap}
        progress={progress}
        events={events}
        notes={data.notes}
        trackId={trackId}
        practiceRemaining={practice.remaining}
        isFree={isFree}
        intake={roadmap?.intake}
        onBack={() => setScreen(s.from)}
        onStudy={inPlan ? () => setScreen({ name: 'lesson', topicId: s.topicId, date: today, start: 'intro', from: 'plan' }) : undefined}
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
  } else if (s.name === 'plan') {
    const pm = progressModel(schedule!, progress!, index, today);
    const total = pm.modules.reduce((n, m) => n + m.minutes_total, 0);
    const done = pm.modules.reduce((n, m) => n + m.minutes_done, 0);
    body = (
      <PlanScreen
        path={path!}
        schedule={schedule!}
        today={today}
        week={weekSummary(path!, schedule!, today)}
        status={planStatus(schedule!)}
        ahead={todayModel!.forecast.status === 'ahead'}
        progress={pm}
        percent={total ? Math.round((done / total) * 100) : 0}
        events={events}
        fixBanner={fixBanner}
        onOpenDay={(date) => setSheetDate(date)}
        onOpenSettings={() => setSettingsOpen(true)}
      />
    );
  } else if (s.name === 'today') {
    const nextDay = (path?.weeks ?? []).flatMap((w) => w.days).find((d) => d.date > today && d.state !== 'done') ?? null;
    body = (
      <TodayScreen
        date={today}
        session={session}
        pathDay={pathDays.get(today) ?? null}
        week={weekSummary(path!, schedule!, today)}
        streak={todayModel!.streak}
        nextDay={nextDay}
        beforeStart={todayModel!.beforeStart}
        afterEnd={todayModel!.afterEnd}
        dayKind={todayModel!.day?.kind ?? null}
        shortfall={shortfall}
        started={(st) => st.kind === 'lesson' && !!st.views[0] && prefs.getLessonScreen(st.views[0].key) > 0}
        onOpenStep={(st) => openStep(st, today, 'today')}
        onToggleStep={toggleStep}
        onSkipToday={async () => {
          const r = skipToday({ schedule: schedule!, roadmap: roadmap!, index, done: progress!.done, today });
          setShortfall(r.shortfall);
          await saveSchedule(r.schedule, 'Today is off; the plan moved forward', schedule!);
        }}
        onDoMore={async () => {
          const next = doMore(schedule!, today, progress!.done);
          if (next === schedule) toast({ title: 'Nothing left to pull in', tone: 'neutral' });
          else await saveSchedule(next, 'Added the next task to today', schedule!);
        }}
        onStartNext={async () => {
          const next = pullNextDay(schedule!, today, progress!.done);
          if (next === schedule) toast({ title: 'Nothing left to pull in', tone: 'neutral' });
          else await saveSchedule(next, 'The next session is on today', schedule!);
        }}
        onShortfallOption={shortfallOption}
        onNewRoadmap={startIntake}
      />
    );
  }

  // The session sheet (from Plan): one day's steps.
  const sheetDay = sheetDate ? pathDays.get(sheetDate) ?? null : null;
  const sheetSession = sheetDate && ready ? sessionFor(sheetDate, false) : null;
  const moveTargets = ready
    ? schedule!.days
        .filter((d) => d.date >= today && d.capacity > 0 && d.date !== sheetDate)
        .slice(0, 60)
        .map((d) => ({ value: d.date, label: formatDay(d.date) }))
    : [];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 pb-16">
      {header}
      {body}
      {ready && (
        <>
          <Drawer open={!!sheetDate && !!sheetSession} onOpenChange={(o) => { if (!o) setSheetDate(null); }}>
            {sheetDate && sheetSession && (
              <DrawerContent
                side={IS_MOBILE ? 'bottom' : undefined}
                size="md"
                title={sheetDay ? `Week ${sheetDay.week} · Session ${sheetDay.day}: ${sheetDay.title}` : formatDay(sheetDate)}
                description={formatDay(sheetDate)}
              >
                <SessionSheetBody
                  day={sheetDay}
                  session={sheetSession}
                  today={today}
                  moveTargets={moveTargets}
                  onOpenStep={(st) => {
                    if (st.done && st.topicId && st.kind !== 'project') {
                      setSheetDate(null);
                      setScreen({ name: 'topic', topicId: st.topicId, from: { name: 'plan' } });
                    } else openStep(st, sheetDate, 'plan');
                  }}
                  onToggleStep={toggleStep}
                  onMoveStep={async (st, to) => {
                    let next = schedule!;
                    for (const v of st.views) next = moveEntry(next, v.key, to);
                    await saveSchedule(next, `Moved to ${formatDay(to)}`, schedule!);
                  }}
                  onStartNow={async () => {
                    let next = schedule!;
                    for (const st of sheetSession.steps) for (const v of st.views) if (!v.done) next = moveEntry(next, v.key, today);
                    const res = await saveSchedule(next, 'The session is on today', schedule!);
                    if (res.ok) {
                      setSheetDate(null);
                      setScreen({ name: 'today' });
                    }
                  }}
                />
              </DrawerContent>
            )}
          </Drawer>
          <Drawer open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DrawerContent side={IS_MOBILE ? 'bottom' : undefined} size="lg" title="Plan settings" description="You see the new plan before anything AI-made is saved.">
              <PlanSettings
                intake={roadmap!.intake}
                paceFactor={schedule!.pace_factor}
                measuredPace={paceFactor(events)}
                onSaveCalendar={async (change) => {
                  await applyDiff(change, 'Plan updated');
                  setSettingsOpen(false);
                }}
                onPace={async (factor) => {
                  const r = replanWith({ pace: factor });
                  if (r) await saveSchedule(r.schedule, 'Estimates updated');
                }}
                onNewRoadmap={startIntake}
                adjust={
                  <AdjustPanel
                    current={roadmap!}
                    onPropose={async (instruction) => {
                      const res = await data.adjust(instruction);
                      return res.success && res.proposal ? { proposal: res.proposal } : { error: res.error };
                    }}
                    onAccept={async (p) => {
                      const res = await changeRoadmap(p.roadmap, p.schedule, 'Roadmap updated');
                      if (res.ok) setSettingsOpen(false);
                      return res;
                    }}
                  />
                }
              />
            </DrawerContent>
          </Drawer>
        </>
      )}
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

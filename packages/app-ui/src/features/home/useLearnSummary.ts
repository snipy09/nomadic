import { useMemo } from 'react';
import { buildPath, rollForward, type LearningEvent, type PathDay, type Streak } from '@job-automator/learning';
import { learnIndex } from '../learn/catalog';
import { roleById } from '../learn/content';
import { buildTodayModel, progressModel, progressOf, todayOf } from '../learn/learnModel';
import { useLearning } from '../learn/useLearning';

export interface LearnSummary {
  status: 'loading' | 'ready' | 'error';
  hasRoadmap: boolean;
  roleName: string;
  /** Today's study day; null on a rest day or with no roadmap. */
  today: PathDay | null;
  /** The next study day after today when today has nothing planned. */
  next: PathDay | null;
  percent: number;
  streak: Streak | null;
}

/** What Home shows about Learn, from the same engine the Learn page uses (read only). */
export function useLearnSummary(now: Date = new Date()): LearnSummary {
  const data = useLearning();
  const date = todayOf(now);
  return useMemo(() => {
    const roadmap = data.roadmap;
    const saved = data.schedule && roadmap && data.schedule.roadmap_id === roadmap.id ? data.schedule : null;
    const empty: LearnSummary = { status: data.status, hasRoadmap: false, roleName: '', today: null, next: null, percent: 0, streak: null };
    if (!roadmap || !saved) return empty;
    const index = learnIndex();
    const events = data.events as unknown as LearningEvent[];
    // Learn moves unfinished work forward when it opens; Home shows the same plan without saving it.
    const schedule = rollForward({ schedule: saved, roadmap, index, done: progressOf(roadmap, saved, events, index).done, today: date })?.schedule ?? saved;
    const progress = progressOf(roadmap, schedule, events, index);
    const path = buildPath({ schedule, roadmap, tasks: progress.byId, index, done: progress.done, today: date });
    const days = path.weeks.flatMap((w) => w.days);
    const pm = progressModel(schedule, progress, index, date);
    const total = pm.modules.reduce((n, m) => n + m.minutes_total, 0);
    const done = pm.modules.reduce((n, m) => n + m.minutes_done, 0);
    const todayModel = buildTodayModel({ schedule, progress, events, now: new Date() });
    return {
      status: data.status,
      hasRoadmap: true,
      roleName: roleById(roadmap.track_id)?.name ?? roadmap.track_id,
      today: days.find((d) => d.date === date) ?? null,
      next: days.find((d) => d.date > date && d.state !== 'done') ?? null,
      percent: total ? Math.round((done / total) * 100) : 0,
      streak: todayModel.streak,
    };
  }, [data.status, data.roadmap, data.schedule, data.events, date]);
}

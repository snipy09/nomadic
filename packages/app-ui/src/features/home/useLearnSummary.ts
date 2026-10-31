import { useMemo } from 'react';
import { doneEntries, roleProgress, type LearningEvent, type RoleProgress, type RoleRoadmap, type TopicRef } from '@job-automator/learning';
import { useLearning } from '../learn/useLearning';

export interface LearnSummary {
  status: 'loading' | 'ready' | 'error';
  hasRoadmap: boolean;
  roleName: string;
  roadmap: RoleRoadmap | null;
  /** The next topic to study (null when all are done or there is no roadmap). */
  next: TopicRef | null;
  percent: number;
  done: number;
  total: number;
  capstone: RoleProgress['capstone'];
  /** A v2 roadmap is saved but Learn needs it built again in the new layout. */
  needsRebuild: boolean;
}

/** What Home shows about Learn, from the same roadmap and events the Learn page uses (read only). */
export function useLearnSummary(): LearnSummary {
  const data = useLearning();
  return useMemo(() => {
    const roadmap = data.roleRoadmap;
    const base: LearnSummary = {
      status: data.status,
      hasRoadmap: false,
      roleName: '',
      roadmap: null,
      next: null,
      percent: 0,
      done: 0,
      total: 0,
      capstone: null,
      needsRebuild: !roadmap && !!data.roadmap,
    };
    if (!roadmap) return base;
    const p = roleProgress(roadmap, doneEntries(data.events as unknown as LearningEvent[]));
    return { ...base, hasRoadmap: true, roleName: roadmap.role, roadmap, next: p.next, percent: p.percent, done: p.done, total: p.total, capstone: p.capstone };
  }, [data.status, data.roleRoadmap, data.roadmap, data.events]);
}

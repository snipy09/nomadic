/** Pure logic for Home: the setup checklist and the greeting. Nothing here invents data. */
import type { TabType, WorkspaceMode } from '../../types';

export type ChecklistId = 'profile' | 'resume' | 'roadmap' | 'answers' | 'apply';

export interface ChecklistItem {
  id: ChecklistId;
  title: string;
  description: string;
  done: boolean;
  /** Where the action button goes. */
  tab: TabType;
  /** Section inside that page to open (e.g. Settings → Resumes). */
  intent?: string;
  action: string;
}

export interface ChecklistInput {
  mode: WorkspaceMode;
  /** Profile completeness, 0–100. */
  profilePercent: number;
  /** null while still loading; loading counts as not done. */
  resumes: number | null;
  hasRoadmap: boolean;
  answers: { done: number; total: number };
  applications: number;
}

/** Common answers count as done once at least half are filled: most forms ask only a few. */
export const answersDone = (a: { done: number; total: number }) => a.total > 0 && a.done >= Math.ceil(a.total / 2);

/** The steps that get a new student from sign-up to a first reviewed application, for their workspace. */
export function setupChecklist(i: ChecklistInput): ChecklistItem[] {
  const learn = i.mode !== 'seeker_only';
  const seek = i.mode !== 'learner_only';
  const items: Array<ChecklistItem | false> = [
    {
      id: 'profile',
      title: 'Complete your profile',
      description: 'Name, target role, skills and a profile link drive job matching.',
      done: i.profilePercent >= 100,
      tab: 'settings',
      action: 'Open profile',
    },
    learn && {
      id: 'roadmap',
      title: 'Plan your roadmap',
      description: 'A day-by-day plan for the role you want, about two minutes to set up.',
      done: i.hasRoadmap,
      tab: 'learner-roadmaps',
      action: 'Plan roadmap',
    },
    seek && {
      id: 'resume',
      title: 'Add a resume',
      description: 'Attached to applications. Only what you upload is ever sent.',
      done: (i.resumes ?? 0) > 0,
      tab: 'settings',
      intent: 'resumes',
      action: 'Add resume',
    },
    seek && {
      id: 'answers',
      title: 'Answer common questions',
      description: `Education, notice period and more, written once for every form (${i.answers.done} of ${i.answers.total}).`,
      done: answersDone(i.answers),
      tab: 'answers',
      action: 'Answer questions',
    },
    seek && {
      id: 'apply',
      title: 'Send your first application',
      description: 'Nomadic fills the form; you review every field before it is sent.',
      done: i.applications > 0,
      tab: 'feed',
      action: 'Browse jobs',
    },
  ];
  return items.filter((x): x is ChecklistItem => Boolean(x));
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function longDate(now: Date = new Date()): string {
  return now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}

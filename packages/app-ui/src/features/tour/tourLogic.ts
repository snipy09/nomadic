/**
 * First-run walkthrough: the steps shown after the first sign-in on this computer.
 * Pure so the step list is testable without a DOM. Each step points at an element marked
 * `data-tour="<target>"` (the sidebar items use their tab id); a step without a target is centred.
 */
import type { WorkspaceMode } from '../../types';
import { isTabEnabled } from '../../features';

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** `data-tour` value of the element to highlight; none = a centred card. */
  target?: string;
}

const WELCOME: TourStep = {
  id: 'welcome',
  title: 'Welcome to Nomadic',
  body: 'A quick look around: where to learn, practise and apply. It takes under a minute, and you can skip it at any time.',
};

const LEARN_STEPS: TourStep[] = [
  { id: 'learn', target: 'learner-roadmaps', title: 'Learn', body: 'Your roadmap for any role: subjects, modules and topics, each with YouTube and ChatGPT, then projects.' },
  { id: 'practice', target: 'learner-interview-prep', title: 'Practice', body: 'Company problems, role questions and timed mock rounds. Weak topics show up here as you go.' },
  { id: 'projects', target: 'learner-projects', title: 'Projects', body: 'Guided projects step by step, with starter code, checks and help when you are stuck.' },
];

const JOBS_STEPS: TourStep[] = [
  { id: 'feed', target: 'feed', title: 'Job board', body: 'Jobs and internships open to India, with how well each one matches your skills.' },
  { id: 'applications', target: 'applications', title: 'Applications', body: 'Nomadic fills the form in your browser and you review every field. Nothing is submitted until you tick "I reviewed this". Track each application here.' },
  { id: 'answers', target: 'answers', title: 'Answers', body: 'Your answers to common application questions, reused on every form so you type them once.' },
];

const HOME_STEP: TourStep = { id: 'home', target: 'home', title: 'Home', body: 'Your starting point: a setup checklist, today\'s learning and follow-ups that are due.' };

const END_STEPS: TourStep[] = [
  { id: 'search', target: 'search', title: 'Search and shortcuts', body: 'Press Ctrl+K to jump anywhere. G then a letter opens a page, for example G then H for Home.' },
  { id: 'settings', target: 'settings', title: 'Settings', body: 'Profile, resumes, portal sign-ins, your plan and your data. Help has this tour again if you need it.' },
];

/** Steps for a workspace; tabs hidden by feature flags are left out. */
export function tourSteps(mode: WorkspaceMode = 'unified'): TourStep[] {
  const learn = mode === 'seeker_only' ? [] : LEARN_STEPS;
  const jobs = mode === 'learner_only' ? [] : JOBS_STEPS;
  const pages = [...learn, ...jobs].filter((s) => isTabEnabled(s.target));
  return [WELCOME, HOME_STEP, ...pages, ...END_STEPS];
}

/**
 * The first-run tour starts on its own only on the desktop, for a signed-in account that has finished onboarding
 * (a new account sees onboarding first) and has not seen the tour on this computer.
 */
export function shouldAutoStartTour(o: { isMobile: boolean; email: string; onboardingDone: boolean; seen: boolean }): boolean {
  return !o.isMobile && Boolean(o.email) && o.onboardingDone && !o.seen;
}

export interface Rect { top: number; left: number; width: number; height: number }

export const CARD_WIDTH = 320;
const GAP = 12;
const MARGIN = 16;

/**
 * Where the card goes: to the right of the highlighted element (the sidebar is on the left),
 * clamped inside the window; centred when there is no element.
 */
export function cardPosition(target: Rect | null, viewport: { width: number; height: number }, cardHeight: number): { top: number; left: number } {
  if (!target) {
    return {
      top: Math.max(MARGIN, Math.round((viewport.height - cardHeight) / 2)),
      left: Math.max(MARGIN, Math.round((viewport.width - CARD_WIDTH) / 2)),
    };
  }
  let left = target.left + target.width + GAP;
  if (left + CARD_WIDTH > viewport.width - MARGIN) left = Math.max(MARGIN, target.left - GAP - CARD_WIDTH);
  const maxTop = Math.max(MARGIN, viewport.height - cardHeight - MARGIN);
  const top = Math.min(Math.max(MARGIN, target.top + target.height / 2 - cardHeight / 2), maxTop);
  return { top: Math.round(top), left: Math.round(left) };
}

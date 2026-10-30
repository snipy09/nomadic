// The ONLY module in the renderer allowed to touch localStorage.
// Holds UI preferences and the signed-in session pointer; all other app data lives in the DB.
import { LEGAL_VERSION } from '@nomadic/config';
import type { AppUser, PersonaTrack, TabType, WorkspaceMode } from '../types';

type OppType = 'job' | 'internship' | 'both';

const read = (key: string): string | null => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const write = (key: string, value: string | null): void => {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch {}
};

const K = {
  user: 'nomadic_user',
  workspaceMode: 'nomadic_workspace_mode',
  oppType: 'nomadic_target_opportunity_type',
  track: 'nomadic_active_track',
  tab: (t: string) => `nomadic_last_tab_${t}`,
  terms: 'nomadic_terms_accepted',
  calibrated: 'nomadic_last_calibrated_date',
  oppWaitlist: 'nomadic_opp_board_waitlist',
  sidebarCollapsed: 'nomadic_sidebar_collapsed',
  applicationsView: 'nomadic_applications_view',
  homeChecklistHidden: 'nomadic_home_checklist_hidden',
  lessonScreen: (key: string) => `nomadic_lesson_screen_${key}`,
  tourSeen: (email: string) => `nomadic_tour_seen_${email.trim().toLowerCase()}`,
  reviewSnoozed: (email: string) => `nomadic_review_snoozed_until_${email.trim().toLowerCase()}`,
} as const;

export const prefs = {
  getUser(): AppUser | null {
    const raw = read(K.user);
    if (!raw) return null;
    try {
      const u = JSON.parse(raw);
      return u && typeof u.email === 'string' && u.email.includes('@') ? u : null;
    } catch { return null; }
  },
  setUser(user: AppUser | null): void {
    if (!user) {
      [K.user, K.track, K.tab('learner'), K.tab('seeker')].forEach((k) => write(k, null));
      return;
    }
    const json = JSON.stringify(user);
    write(K.user, json);
  },
  getWorkspaceMode(): WorkspaceMode | null {
    const v = read(K.workspaceMode);
    return v === 'learner_only' || v === 'seeker_only' || v === 'unified' ? v : null;
  },
  setWorkspaceMode: (m: WorkspaceMode) => write(K.workspaceMode, m),
  getOppType(): OppType | null {
    const v = read(K.oppType);
    return v === 'job' || v === 'internship' || v === 'both' ? v : null;
  },
  setOppType: (t: OppType) => write(K.oppType, t),
  getTrack(): PersonaTrack | null {
    const v = read(K.track);
    return v === 'learner' || v === 'seeker' ? v : null;
  },
  setTrack: (t: PersonaTrack) => write(K.track, t),
  getLastTab: (t: PersonaTrack): TabType | null => read(K.tab(t)) as TabType | null,
  setLastTab: (t: PersonaTrack, tab: TabType) => write(K.tab(t), tab),
  /** True only if the user accepted the current version of the terms (LEGAL_VERSION). */
  getTermsAccepted: () => read(K.terms) === LEGAL_VERSION,
  setTermsAccepted: (v: boolean) => write(K.terms, v ? LEGAL_VERSION : null),
  getLastCalibrated: () => read(K.calibrated),
  setLastCalibrated: (d: string) => write(K.calibrated, d),
  getSidebarCollapsed: () => read(K.sidebarCollapsed) === 'true',
  setSidebarCollapsed: (v: boolean) => write(K.sidebarCollapsed, v ? 'true' : 'false'),
  getApplicationsView: (): 'board' | 'list' => (read(K.applicationsView) === 'list' ? 'list' : 'board'),
  hasApplicationsView: () => read(K.applicationsView) !== null,
  setApplicationsView: (v: 'board' | 'list') => write(K.applicationsView, v),
  getHomeChecklistHidden: () => read(K.homeChecklistHidden) === 'true',
  setHomeChecklistHidden: (v: boolean) => write(K.homeChecklistHidden, v ? 'true' : null),
  /** The screen a lesson was left on (per lesson entry), so it resumes there. */
  getLessonScreen(key: string): number {
    const n = Number(read(K.lessonScreen(key)));
    return Number.isInteger(n) && n > 0 ? n : 0;
  },
  setLessonScreen: (key: string, screen: number) => write(K.lessonScreen(key), screen > 0 ? String(screen) : null),
  /** The first-run walkthrough, once per account on this computer. */
  getTourSeen: (email: string) => read(K.tourSeen(email)) === 'true',
  setTourSeen: (email: string) => write(K.tourSeen(email), 'true'),
  /** "Not now" on the in-app review: an ISO time before which it is not asked again on this device. */
  getReviewSnoozedUntil: (email: string) => read(K.reviewSnoozed(email)),
  setReviewSnoozedUntil: (email: string, iso: string) => write(K.reviewSnoozed(email), iso),
  getOppWaitlist: () => read(K.oppWaitlist) === 'true',
  setOppWaitlist: () => write(K.oppWaitlist, 'true'),
};

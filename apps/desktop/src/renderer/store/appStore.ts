import { create } from 'zustand';
import type { AppUser, HeartbeatStatus, MasterProfile, PersonaTrack, TabType, WorkspaceMode } from '../types';
import { prefs } from './preferences';

export const emptyProfile = (): MasterProfile => ({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  linkedin: '',
  github: '',
  sponsorship: 'No',
  desiredSalary: '',
  noticePeriod: '2 weeks',
  groqApiKey: '',
  smtpPassword: '',
  resumeText: '',
  desiredTitle: '',
  techStack: '',
  customAnswers: {},
  onboardingCompleted: false,
});

type Upd<T> = T | ((prev: T) => T);
const apply = <T,>(u: Upd<T>, prev: T): T => (typeof u === 'function' ? (u as (p: T) => T)(prev) : u);

interface AppState {
  currentUser: AppUser | null;
  workspaceMode: WorkspaceMode;
  activeTrack: PersonaTrack;
  activeTab: TabType;
  profile: MasterProfile;
  showUpgradeModal: boolean;
  upgradeFeature: string;
  showCommandPalette: boolean;
  wantsLogin: boolean;
  outreachTargetCompany: string;
  onboardingLoaded: boolean;
  showOnboarding: boolean;
  savingProfile: boolean;
  heartbeat: HeartbeatStatus | null;
  logs: string[];
  setCurrentUser: (u: Upd<AppUser | null>) => void;
  setWorkspaceMode: (u: Upd<WorkspaceMode>) => void;
  setActiveTrack: (u: Upd<PersonaTrack>) => void;
  setActiveTab: (u: Upd<TabType>) => void;
  setProfile: (u: Upd<MasterProfile>) => void;
  setShowUpgradeModal: (u: Upd<boolean>) => void;
  setUpgradeFeature: (u: Upd<string>) => void;
  setShowCommandPalette: (u: Upd<boolean>) => void;
  setWantsLogin: (u: Upd<boolean>) => void;
  setOutreachTargetCompany: (u: Upd<string>) => void;
  setOnboardingLoaded: (u: Upd<boolean>) => void;
  setShowOnboarding: (u: Upd<boolean>) => void;
  setSavingProfile: (u: Upd<boolean>) => void;
  setHeartbeat: (u: Upd<HeartbeatStatus | null>) => void;
  setLogs: (u: Upd<string[]>) => void;
}

const initialTrack = (): PersonaTrack => {
  const mode = prefs.getWorkspaceMode() ?? 'unified';
  if (mode === 'learner_only') return 'learner';
  if (mode === 'seeker_only') return 'seeker';
  return prefs.getTrack() ?? 'learner';
};

export const useAppStore = create<AppState>((set) => {
  const field = <K extends keyof AppState>(k: K) => (u: Upd<AppState[K]>) =>
    set((s) => ({ [k]: apply(u, s[k]) }) as Partial<AppState>);
  return {
    currentUser: prefs.getUser(),
    workspaceMode: prefs.getWorkspaceMode() ?? 'unified',
    activeTrack: initialTrack(),
    activeTab: prefs.getLastTab(prefs.getTrack() ?? 'learner') ?? 'learner-roadmaps',
    profile: emptyProfile(),
    showUpgradeModal: false,
    upgradeFeature: '',
    showCommandPalette: false,
    wantsLogin: false,
    outreachTargetCompany: '',
    onboardingLoaded: false,
    showOnboarding: false,
    savingProfile: false,
    heartbeat: null,
    logs: [],
    setCurrentUser: field('currentUser'),
    setWorkspaceMode: field('workspaceMode'),
    setActiveTrack: field('activeTrack'),
    setActiveTab: field('activeTab'),
    setProfile: field('profile'),
    setShowUpgradeModal: field('showUpgradeModal'),
    setUpgradeFeature: field('upgradeFeature'),
    setShowCommandPalette: field('showCommandPalette'),
    setWantsLogin: field('wantsLogin'),
    setOutreachTargetCompany: field('outreachTargetCompany'),
    setOnboardingLoaded: field('onboardingLoaded'),
    setShowOnboarding: field('showOnboarding'),
    setSavingProfile: field('savingProfile'),
    setHeartbeat: field('heartbeat'),
    setLogs: field('logs'),
  };
});

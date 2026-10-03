import React, { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import {
  TabType, ThemeMode, MasterProfile, HeartbeatStatus, AppUser, getApi, PersonaTrack, WorkspaceMode
} from './types';
import { Onboarding } from './features/onboarding/Onboarding';
import { AppShell, useTheme } from '@nomadic/ui';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { HomeView } from './components/HomeView';
import { LearnerView } from './components/LearnerView';
import { UpgradeDialog } from './features/billing/UpgradeDialog';
import { ENTITLEMENTS_KEY } from './features/billing/useEntitlements';
import { queryClient } from './queryClient';
import { FeedView } from './features/feed/FeedView';
import { OutreachView } from './components/OutreachView';
import { ApplicationsView } from './features/applications/ApplicationsView';
import { ProfileView } from './features/profile/ProfileView';
import { AdminView } from './features/admin/AdminView';
import { AuthScreen } from './features/auth/AuthScreen';
import { ResourceVaultView } from './components/ResourceVaultView';
import { InterviewPrepView } from './components/InterviewPrepView';
import { OpportunityBoardView } from './components/OpportunityBoardView';
import { CommandPalette } from './components/CommandPalette';
import { NomadicAssistant } from './components/NomadicAssistant';
import { isTabEnabled, FEATURES } from './features';
import { prefs } from './store/preferences';
import { useAppStore } from './store/appStore';
export default function App() {
  // Current user state (session pointer persisted via the preferences module)
  const { theme, setTheme } = useTheme({ defaultTheme: 'light' });
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => prefs.getSidebarCollapsed());
  const toggleSidebar = () => setSidebarCollapsed((c) => { prefs.setSidebarCollapsed(!c); return !c; });

  // Single source of truth: Zustand store (see store/appStore.ts)
  const currentUser = useAppStore((s) => s.currentUser);
  const setCurrentUser = useAppStore((s) => s.setCurrentUser);
  const workspaceMode = useAppStore((s) => s.workspaceMode);
  const setWorkspaceModeState = useAppStore((s) => s.setWorkspaceMode);
  const activeTrack = useAppStore((s) => s.activeTrack);
  const setActiveTrack = useAppStore((s) => s.setActiveTrack);
  const showUpgradeModal = useAppStore((s) => s.showUpgradeModal);
  const setShowUpgradeModal = useAppStore((s) => s.setShowUpgradeModal);
  const upgradeFeature = useAppStore((s) => s.upgradeFeature);
  const setUpgradeFeature = useAppStore((s) => s.setUpgradeFeature);
  const showCommandPalette = useAppStore((s) => s.showCommandPalette);
  const setShowCommandPalette = useAppStore((s) => s.setShowCommandPalette);
  const wantsLogin = useAppStore((s) => s.wantsLogin);
  const setWantsLogin = useAppStore((s) => s.setWantsLogin);
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const outreachTargetCompany = useAppStore((s) => s.outreachTargetCompany);
  const setOutreachTargetCompany = useAppStore((s) => s.setOutreachTargetCompany);
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const onboardingLoaded = useAppStore((s) => s.onboardingLoaded);
  const setOnboardingLoaded = useAppStore((s) => s.setOnboardingLoaded);
  const showOnboarding = useAppStore((s) => s.showOnboarding);
  const setShowOnboarding = useAppStore((s) => s.setShowOnboarding);
  const savingProfile = useAppStore((s) => s.savingProfile);
  const setSavingProfile = useAppStore((s) => s.setSavingProfile);
  const heartbeat = useAppStore((s) => s.heartbeat);
  const setHeartbeat = useAppStore((s) => s.setHeartbeat);
  const logs = useAppStore((s) => s.logs);
  const setLogs = useAppStore((s) => s.setLogs);

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const entry = `[${timestamp}] ${message}`;
    setLogs((prev) => [entry, ...prev.slice(0, 199)]);
  }, []);

  const loadProfileFromDb = async (): Promise<MasterProfile | null> => {
    const api = getApi();
    if (!api) {
      setOnboardingLoaded(true);
      return null;
    }

    try {
      const res: any = await api.getMasterProfile();
      const data = (res && res.data) ? res.data : res;
      if (data) {
        let customAnswersObj = {};
        try {
          if (data.customAnswersJson) customAnswersObj = JSON.parse(data.customAnswersJson);
          else if (data.custom_answers_json) customAnswersObj = JSON.parse(data.custom_answers_json);
        } catch {}

        const isCompleted = data.onboarding_completed !== undefined
          ? Boolean(data.onboarding_completed)
          : Boolean(data.onboardingCompleted);

        const mapped: MasterProfile = {
          firstName: data.firstName || data.first_name || '',
          lastName: data.lastName || data.last_name || '',
          email: data.email || '',
          phone: data.phone || '',
          linkedin: data.linkedin || data.linkedin_url || '',
          github: data.github || data.github_url || '',
          sponsorship: data.sponsorship || 'No',
          desiredSalary: data.desiredSalary || data.desired_salary || '',
          noticePeriod: data.noticePeriod || data.notice_period || '2 weeks',
          groqApiKey: data.groqApiKey || data.groq_api_key || '',
          smtpPassword: data.smtpPassword || data.smtp_password || '',
          resumeText: data.resumeText || data.resume_text || '',
          desiredTitle: data.desiredTitle || data.desired_title || '',
          techStack: data.techStack || data.tech_stack || '',
          customAnswers: customAnswersObj,
          onboardingCompleted: isCompleted,
        };
        setProfile(mapped);
        if (!isCompleted) {
          setShowOnboarding(true);
        } else {
          setShowOnboarding(false);
        }
        return mapped;
      } else {
        setShowOnboarding(true);
        return null;
      }
    } catch (err: any) {
      addLog(`[Profile] Local profile init: ${err?.message || String(err)}`);
      return null;
    } finally {
      setOnboardingLoaded(true);
    }
  };

  // A disabled feature's tab (e.g. a restored preference) falls back to the default view.
  useEffect(() => {
    if (!isTabEnabled(activeTab)) setActiveTab(activeTrack === 'seeker' ? 'feed' : 'learner-roadmaps');
  }, [activeTab, activeTrack]);

  useEffect(() => {
    loadProfileFromDb();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleNavigate = (newTab: TabType) => {
    setActiveTab(newTab);
    if (['learner-roadmaps', 'learner-resources', 'learner-interview-prep'].includes(newTab)) {
      setActiveTrack('learner');
      prefs.setTrack('learner');
      prefs.setLastTab('learner', newTab);
    } else if (['feed', 'outreach', 'applications'].includes(newTab)) {
      setActiveTrack('seeker');
      prefs.setTrack('seeker');
      prefs.setLastTab('seeker', newTab);
    } else {
      // Shared tabs: opportunities, settings, logs
      prefs.setLastTab(activeTrack, newTab);
    }
  };

  const handleTrackChange = (newTrack: PersonaTrack) => {
    if (workspaceMode === 'learner_only') newTrack = 'learner';
    if (workspaceMode === 'seeker_only') newTrack = 'seeker';
    setActiveTrack(newTrack);
    prefs.setTrack(newTrack);
    const savedTab = prefs.getLastTab(newTrack);
    if (savedTab) {
      setActiveTab(savedTab);
      return;
    }

    if (newTrack === 'learner') {
      setActiveTab('learner-roadmaps');
    } else {
      setActiveTab('feed');
    }
  };

  const handleLoginSuccess = async (user: AppUser) => {
    void queryClient.invalidateQueries({ queryKey: ENTITLEMENTS_KEY });
    setCurrentUser(user);
    prefs.setUser(user);

    const loadedProf = await loadProfileFromDb();

    const isExistingUser = Boolean(
      user.onboardingCompleted ||
      loadedProf?.onboardingCompleted
    );

    if (isExistingUser) {
      setShowOnboarding(false);
      if (user.role === 'admin') {
        setActiveTab('admin-overview');
      } else {
        setActiveTrack('learner');
        setActiveTab('learner-roadmaps');
      }
      addLog(`[Auth] Session active (${user.email}). Navigated to Learner Roadmaps.`);
    } else {
      setShowOnboarding(true);
      addLog(`[Auth] New user (${user.email}) registered. Direct to onboarding.`);
    }
  };

  const handleLogout = () => {
    queryClient.removeQueries({ queryKey: ENTITLEMENTS_KEY });
    setCurrentUser(null);
    try {
      prefs.setUser(null);
      sessionStorage.clear();
      const api = getApi();
      if (api && (api as any).authLogout) {
        (api as any).authLogout();
      }
    } catch {}
    setActiveTrack('learner');
    setActiveTab('learner-roadmaps');
    addLog('[Auth] Signed out successfully.');
  };

  const handleSaveProfile = async (updatedProfile?: MasterProfile): Promise<boolean> => {
    const api = getApi();
    const profToSave = updatedProfile || profile;
    setSavingProfile(true);
    setProfile(profToSave);
    if (profToSave.workspaceMode) {
      setWorkspaceModeState(profToSave.workspaceMode);
      prefs.setWorkspaceMode(profToSave.workspaceMode);
      if (profToSave.workspaceMode === 'learner_only') {
        setActiveTrack('learner');
      } else if (profToSave.workspaceMode === 'seeker_only') {
        setActiveTrack('seeker');
      }
    }
    if (profToSave.targetOpportunityType) {
      prefs.setOppType(profToSave.targetOpportunityType);
    }
    try {
      if (api && api.saveMasterProfile) {
        const res: any = await api.saveMasterProfile({
          firstName: profToSave.firstName,
          lastName: profToSave.lastName,
          email: profToSave.email,
          phone: profToSave.phone,
          linkedin: profToSave.linkedin,
          github: profToSave.github,
          sponsorship: profToSave.sponsorship,
          desiredSalary: profToSave.desiredSalary,
          noticePeriod: profToSave.noticePeriod,
          groqApiKey: profToSave.groqApiKey,
          smtpPassword: profToSave.smtpPassword,
          resumeText: profToSave.resumeText,
          desiredTitle: profToSave.desiredTitle,
          techStack: profToSave.techStack,
          customAnswersJson: JSON.stringify(profToSave.customAnswers || {}),
          onboarding_completed: 1,
        });
        if (res && res.success === false) throw new Error(res.error || 'Save rejected');
      }
      addLog('[Profile] Master candidate profile saved.');
      return true;
    } catch (err: any) {
      addLog(`[Profile] Failed to save profile: ${err?.message || String(err)}`);
      return false;
    } finally {
      setSavingProfile(false);
    }
  };

  const handleOpenUpgrade = (featureName?: string) => {
    setUpgradeFeature(featureName || '');
    setShowUpgradeModal(true);
  };

  // 1. If not logged in, ALWAYS show the Login & Sign-up page first
  if (!currentUser) {
    return (
      <AuthScreen
        onLoginSuccess={(u) => {
          setWantsLogin(false);
          handleLoginSuccess(u);
        }}
        onLog={addLog}
      />
    );
  }

  // 2. Wait until initial profile and data check finishes
  if (!onboardingLoaded) {
    return (
      <div className="min-h-screen bg-[#0A0A0C] flex flex-col items-center justify-center text-slate-400 font-sans p-4 select-none">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold text-slate-200">Loading your Nomadic workspace...</p>
            <p className="text-[11px] text-slate-500 font-mono mt-0.5">Synchronizing local career database</p>
          </div>
        </div>
      </div>
    );
  }

  // 3. Check if user already completed onboarding
  const userHasCompletedOnboarding = Boolean(
    currentUser?.onboardingCompleted ||
    profile.onboardingCompleted
  );

  // If new user (has NOT completed onboarding) or user requested setup, show Onboarding
  if (!userHasCompletedOnboarding || showOnboarding) {
    return (
      <Onboarding
        initialProfile={profile}
        currentUser={currentUser}
        onComplete={(completedProfile) => {
          setProfile({ ...completedProfile, onboardingCompleted: true });
          setShowOnboarding(false);
          const mode = completedProfile.workspaceMode || 'unified';
          setWorkspaceModeState(mode);
          try {
            prefs.setWorkspaceMode(mode);
            prefs.setLastCalibrated(new Date().toISOString().split('T')[0]);
            if (completedProfile.targetOpportunityType) {
              prefs.setOppType(completedProfile.targetOpportunityType);
            }
            if (currentUser) {
              const updated = { ...currentUser, onboardingCompleted: true };
              setCurrentUser(updated);
              prefs.setUser(updated);
            }
          } catch {}
          if (mode === 'seeker_only') {
            setActiveTrack('seeker');
            setActiveTab('feed');
          } else {
            setActiveTrack('learner');
            setActiveTab('learner-roadmaps');
          }
        }}
      />
    );
  }

  return (
    <AppShell
      className="h-screen"
      sidebarCollapsed={sidebarCollapsed}
      sidebar={
        <Sidebar
          activeTrack={activeTrack}
          activeTab={activeTab}
          onSelectTab={handleNavigate}
          currentUser={currentUser}
          onToggleCollapsed={toggleSidebar}
        />
      }
      topbar={
        <TopBar
          currentUser={currentUser}
          onLogout={handleLogout}
          onNavigate={handleNavigate}
          activeTrack={activeTrack}
          setTrack={handleTrackChange}
          workspaceMode={workspaceMode}
          onOpenUpgrade={() => handleOpenUpgrade()}
          onOpenCommandPalette={() => setShowCommandPalette(true)}
          onLog={addLog}
          theme={theme}
          onThemeChange={setTheme}
        />
      }
      mainClassName={
        activeTab === 'profile' || activeTab === 'settings' || Boolean(activeTab && activeTab.startsWith('admin'))
          ? 'overflow-hidden flex flex-col'
          : 'overflow-y-auto p-5 md:p-8'
      }
    >
      <>
        {/* Dynamic Sub-view Container */}
        <div key={activeTab} className={`w-full ${
            activeTab === 'profile' || activeTab === 'settings' || Boolean(activeTab && activeTab.startsWith('admin'))
              ? 'h-full flex-1 flex flex-col overflow-hidden'
              : 'max-w-6xl mx-auto animate-in fade-in duration-150 ease-out'
          }`}>
            {activeTab === 'learner-roadmaps' && (
              <LearnerView
                profile={profile}
                onUpdateProfile={(u) => setProfile({ ...profile, ...u })}
                onNavigateToSeeker={() => {
                  setActiveTrack('seeker');
                  setActiveTab('feed');
                }}
                onLog={addLog}
                currentUser={currentUser}
                onOpenUpgrade={handleOpenUpgrade}
              />
            )}

            {activeTab === 'learner-resources' && isTabEnabled('learner-resources') && (
              <ResourceVaultView
                currentUser={currentUser}
                onOpenUpgrade={handleOpenUpgrade}
                onLog={addLog}
              />
            )}

            {activeTab === 'learner-interview-prep' && (
              <InterviewPrepView
                profile={profile}
                onLog={addLog}
              />
            )}

            {activeTab === 'opportunities' && isTabEnabled('opportunities') && (
              <OpportunityBoardView
                profile={profile}
                onLog={addLog}
              />
            )}

            {activeTab === 'home' && (
              <HomeView
                profile={profile}
                onNavigate={setActiveTab}
                onLog={addLog}
              />
            )}

            {activeTab === 'feed' && (
              <FeedView
                profile={profile}
                onUpdateProfile={setProfile}
                onLog={addLog}
                onNavigateToOutreach={(company) => {
                  setOutreachTargetCompany(company);
                  setActiveTab('outreach');
                }}
                currentUser={currentUser}
                onOpenUpgrade={handleOpenUpgrade}
              />
            )}

            {activeTab === 'outreach' && isTabEnabled('outreach') && (
              <OutreachView
                profile={profile}
                onLog={addLog}
                initialSearchQuery={outreachTargetCompany}
                currentUser={currentUser}
                onOpenUpgrade={handleOpenUpgrade}
              />
            )}

            {activeTab === 'applications' && (
              <ApplicationsView onBrowseJobs={() => setActiveTab('feed')} />
            )}

            {activeTab === 'logs' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-extrabold text-slate-950 dark:text-white">Live Activity Stream</h2>
                    <p className="text-xs text-slate-500">Real-time automation logs and scraper activity.</p>
                  </div>
                  <button
                    onClick={() => setLogs([])}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                  >
                    Clear Logs
                  </button>
                </div>
                <div className="bg-slate-950 text-slate-300 font-mono text-xs p-4 rounded-2xl border border-slate-800 space-y-1.5 max-h-[600px] overflow-y-auto">
                  {logs.length === 0 ? (
                    <div className="text-slate-600">No activity logged yet. Start scraping or exploring roadmaps.</div>
                  ) : (
                    logs.map((lg, i) => (
                      <div key={i} className="leading-relaxed border-b border-slate-900 pb-1">
                        {lg}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {(activeTab === 'profile' || activeTab === 'settings') && (
              <ProfileView
                profile={profile}
                onSaveProfile={handleSaveProfile}
                saving={savingProfile}
                onLog={addLog}
                currentUser={currentUser}
                onNavigateTab={handleNavigate}
                onLogout={handleLogout}
                onRerunOnboarding={() => setShowOnboarding(true)}
                onOpenUpgrade={() => handleOpenUpgrade('')}
              />
            )}

            {Boolean(activeTab && activeTab.startsWith('admin')) && (
              <AdminView currentUser={currentUser} />
            )}

            {/* Safe Fallback: if activeTab does not match any known route, render FeedView */}
            {!['learner-roadmaps', 'learner-resources', 'learner-interview-prep', 'opportunities', 'home', 'feed', 'outreach', 'applications', 'logs', 'profile', 'settings'].includes(activeTab) && !Boolean(activeTab && activeTab.startsWith('admin')) && (
              <FeedView
                profile={profile}
                onUpdateProfile={setProfile}
                onLog={addLog}
                onNavigateToOutreach={(company) => {
                  setOutreachTargetCompany(company);
                  setActiveTab('outreach');
                }}
                currentUser={currentUser}
                onOpenUpgrade={handleOpenUpgrade}
              />
            )}
          </div>

        <UpgradeDialog
          open={showUpgradeModal}
          onOpenChange={setShowUpgradeModal}
          feature={upgradeFeature || undefined}
          email={currentUser?.email}
        />

        {showCommandPalette && (
          <CommandPalette
            isOpen={showCommandPalette}
            onClose={() => setShowCommandPalette(false)}
            onSelectTab={handleNavigate}
            activeTrack={activeTrack}
            onToggleTrack={handleTrackChange}
          />
        )}

        {/* ── Max-Exclusive Autonomous Assistant on Steroids (Bottom-Right) ── */}
        {FEATURES.assistant && (
          <NomadicAssistant
            currentUser={currentUser}
            onNavigateTab={handleNavigate}
            onTriggerAutoApply={(_urls) => handleNavigate('feed')}
            onOpenUpgrade={(feat) => handleOpenUpgrade(feat)}
            onLog={addLog}
          />
        )}
      </>
    </AppShell>
  );
}

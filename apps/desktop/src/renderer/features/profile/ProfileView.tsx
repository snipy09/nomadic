import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowDownToLine, BookOpen, CheckCircle2, Database, FileText, Globe, Save, Settings2, ShieldCheck, User } from 'lucide-react';
import { Badge, Button, NavItem, NavScope, NavSection, ProgressRing, useToast } from '@nomadic/ui';
import { prefs } from '../../store/preferences';
import type { AppUser, MasterProfile, TabType } from '../../types';
import { completeness, toForm, toMasterProfile, validate, type ProfileForm } from './profileForm';
import { useResumes } from './useResumes';
import { AccountSection, AnswersSection, PersonalSection, PortalsSection, PreferencesSection, ResumesSection, TargetingSection } from './sections';
import { DataSafetyPanel } from '../data-safety/DataSafetyPanel';
import { UpdateSettingsCard } from '../updates/UpdateSettingsCard';
import { CrashReportsCard } from '../help/CrashReportsCard';

type Section = 'profile' | 'preferences' | 'resumes' | 'answers' | 'portals' | 'account' | 'data' | 'updates';

/** macOS System Settings style: each section has a small coloured icon tile. */
const tile = (bg: string, icon: React.ReactNode) => (
  <span className={`flex size-6 items-center justify-center rounded-[7px] text-white shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.08)] [&_svg]:!size-3.5 ${bg}`}>{icon}</span>
);

const NAV: Array<{ id: Section; label: string; icon: React.ReactNode }> = [
  { id: 'profile', label: 'Profile', icon: tile('bg-accent', <User />) },
  { id: 'preferences', label: 'Workspace', icon: tile('bg-fg-subtle', <Settings2 />) },
  { id: 'resumes', label: 'Resumes', icon: tile('bg-warning', <FileText />) },
  { id: 'answers', label: 'Application answers', icon: tile('bg-success', <BookOpen />) },
  { id: 'portals', label: 'Portal sign-ins', icon: tile('bg-accent', <Globe />) },
  { id: 'account', label: 'Account', icon: tile('bg-fg-subtle', <ShieldCheck />) },
  { id: 'data', label: 'Data & privacy', icon: tile('bg-danger', <Database />) },
  { id: 'updates', label: 'Updates', icon: tile('bg-fg-subtle', <ArrowDownToLine />) },
];

interface ProfileViewProps {
  profile: MasterProfile | null;
  onSaveProfile?: (profile: MasterProfile) => Promise<boolean>;
  onLog?: (msg: string) => void;
  currentUser?: AppUser | null;
  onNavigateTab?: (tab: TabType) => void;
  onLogout?: () => void;
  onRerunOnboarding?: () => void;
  onOpenUpgrade?: () => void;
  saving?: boolean;
  /** Section to open first (e.g. 'resumes'). */
  initialSection?: string | null;
}

const fromSaved = () => ({ workspaceMode: prefs.getWorkspaceMode(), opportunityType: prefs.getOppType() });

export const ProfileView: React.FC<ProfileViewProps> = ({ profile, onSaveProfile, onLog, currentUser, onLogout, onRerunOnboarding, onOpenUpgrade, onNavigateTab, initialSection }) => {
  const { toast } = useToast();
  const [section, setSection] = useState<Section>(() => NAV.find((n) => n.id === initialSection)?.id ?? 'profile');
  const [form, setForm] = useState<ProfileForm>(() => toForm(profile, currentUser, fromSaved()));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const resumes = useResumes();

  // Take in outside changes (e.g. profile finished loading) unless the user is mid-edit.
  useEffect(() => {
    if (!dirty) setForm(toForm(profile, currentUser, fromSaved()));
  }, [profile, currentUser, dirty]);

  const errors = useMemo(() => validate(form), [form]);
  const { percent, missing } = useMemo(() => completeness(form), [form]);
  const hasErrors = Object.keys(errors).length > 0;

  const set: React.ComponentProps<typeof PersonalSection>['set'] = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  };

  const save = async () => {
    setShowErrors(true);
    if (hasErrors) {
      setSection('profile');
      toast({ title: 'Fix the highlighted fields', tone: 'warning' });
      return;
    }
    setSaving(true);
    try {
      const ok = onSaveProfile ? await onSaveProfile(toMasterProfile(form, profile)) : false;
      if (ok) {
        setDirty(false);
        onLog?.('[Settings] Profile saved');
        toast({ title: 'Profile saved', tone: 'success' });
      } else {
        toast({ title: 'Could not save your profile', description: 'Nothing was lost. Check your connection and try again.', tone: 'danger', action: { label: 'Retry', onClick: () => void save() } });
      }
    } finally {
      setSaving(false);
    }
  };

  const shown = showErrors ? errors : {};
  const props = { form, errors: shown, set };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-4 border-b border-line px-6 py-4">
        <ProgressRing value={percent} size={40} showValue label={`Profile ${percent}% complete`} />
        <div className="min-w-0 flex-1">
          <h1 className="text-headline font-bold text-fg">Profile &amp; settings</h1>
          <p className="truncate text-caption text-fg-subtle">
            {missing.length ? `Add ${missing.join(', ').toLowerCase()} to complete your profile.` : 'Your profile is complete.'}
          </p>
        </div>
        {dirty && <Badge tone="warning" dot>Unsaved changes</Badge>}
        {showErrors && hasErrors && <Badge tone="danger" icon={<AlertCircle />}>{Object.keys(errors).length} to fix</Badge>}
        <Button leftIcon={dirty ? <Save /> : <CheckCircle2 />} loading={saving} disabled={!dirty && !saving} onClick={() => void save()}>
          {dirty ? 'Save changes' : 'Saved'}
        </Button>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Settings sections" className="w-56 shrink-0 overflow-y-auto border-r border-line p-2">
          <NavScope>
            <NavSection>
              {NAV.map((n) => (
                <NavItem key={n.id} label={n.label} icon={n.icon} active={section === n.id} onClick={() => setSection(n.id)} />
              ))}
            </NavSection>
          </NavScope>
        </nav>
        <div className="min-w-0 flex-1 overflow-y-auto p-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {section === 'profile' && (<><PersonalSection {...props} /><TargetingSection {...props} /></>)}
            {section === 'preferences' && <PreferencesSection {...props} />}
            {section === 'resumes' && <ResumesSection state={resumes} targetRole={form.targetRole} />}
            {section === 'answers' && <AnswersSection {...props} onOpenAnswers={onNavigateTab ? () => onNavigateTab('answers') : undefined} />}
            {section === 'portals' && <PortalsSection />}
            {section === 'account' && <AccountSection user={currentUser} onLogout={onLogout} onRerunOnboarding={onRerunOnboarding} onOpenUpgrade={onOpenUpgrade} />}
            {section === 'data' && (<><CrashReportsCard /><DataSafetyPanel accountEmail={currentUser?.email} onAccountDeleted={() => onLogout?.()} /></>)}
            {section === 'updates' && <UpdateSettingsCard />}
          </div>
        </div>
      </div>
    </div>
  );
};

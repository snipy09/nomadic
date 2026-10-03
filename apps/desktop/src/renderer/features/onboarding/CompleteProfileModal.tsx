import React, { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button, Dialog, DialogContent, Field, Input } from '@nomadic/ui';
import type { MasterProfile } from '../../types';
import { toForm, type ProfileForm } from '../profile/profileForm';
import { useResumes } from '../profile/useResumes';
import { ResumesSection } from '../profile/sections';
import { applyReadinessErrors, buildOnboardingProfile } from './onboardingLogic';

export interface CompleteProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: MasterProfile;
  /** Persists the profile. Throw (or reject) to keep the dialog open with an error. */
  onSaveProfile: (updated: MasterProfile) => Promise<void>;
  /** Called after a successful save, before the dialog closes. */
  onProfileCompleted: () => void;
}

/** Asks for what an application needs (name, email, phone, a resume) before applying. Never fills in defaults. */
export const CompleteProfileModal: React.FC<CompleteProfileModalProps> = ({ isOpen, onClose, profile, onSaveProfile, onProfileCompleted }) => (
  <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
    {isOpen && <CompleteProfileBody profile={profile} onClose={onClose} onSaveProfile={onSaveProfile} onProfileCompleted={onProfileCompleted} />}
  </Dialog>
);

const CompleteProfileBody: React.FC<Omit<CompleteProfileModalProps, 'isOpen'>> = ({ profile, onClose, onSaveProfile, onProfileCompleted }) => {
  const [form, setForm] = useState<ProfileForm>(() => toForm(profile));
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const resumes = useResumes();

  useEffect(() => { setForm(toForm(profile)); }, [profile]);

  const hasResume = resumes.resumes.length > 0 || Boolean(profile.resumeFilePath?.trim());
  const errs = applyReadinessErrors(form, hasResume);
  const shown = showErrors ? errs : {};
  const set = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setShowErrors(true);
    if (Object.keys(errs).length) {
      const first = (['fullName', 'email', 'phone'] as const).find((k) => errs[k]);
      if (first) document.getElementById(`cpm-${first}`)?.focus();
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      // Keep the stored onboarding flag as it is: this dialog is not onboarding.
      const updated = { ...buildOnboardingProfile(form, profile, resumes.resumes), onboardingCompleted: profile.onboardingCompleted };
      await onSaveProfile(updated);
      onProfileCompleted();
      onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent
      title="Finish your profile to apply"
      description="Application forms need these. Nomadic uses only what you enter here."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" loading={saving} loadingText="Saving…" onClick={() => void save()}>Save and continue</Button>
        </>
      }
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => { e.preventDefault(); void save(); }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={shown.fullName} id="cpm-fullName" className="sm:col-span-2">
            <Input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} autoComplete="name" />
          </Field>
          <Field label="Email" required error={shown.email} id="cpm-email">
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" />
          </Field>
          <Field label="Phone" required error={shown.phone} id="cpm-phone">
            <Input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" />
          </Field>
          <Field label="Target role" className="sm:col-span-2" hint="Optional">
            <Input value={form.targetRole} onChange={(e) => set('targetRole', e.target.value)} />
          </Field>
        </div>
        <ResumesSection state={resumes} targetRole={form.targetRole} />
        {shown.resume && <p role="alert" className="text-label text-danger-fg">{shown.resume}</p>}
        {saveError && (
          <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-body text-danger-fg">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>Could not save your profile: {saveError}</span>
          </div>
        )}
        <button type="submit" hidden tabIndex={-1} />
      </form>
    </DialogContent>
  );
};

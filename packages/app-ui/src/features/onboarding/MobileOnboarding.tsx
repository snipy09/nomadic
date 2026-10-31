import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, BookOpen, Bookmark, Check, ChevronLeft, Laptop } from 'lucide-react';
import { Button, Field, Input, NomadicMark, cn } from '@nomadic/ui';
import { getApi, type AppUser, type MasterProfile } from '../../types';
import { prefs } from '../../store/preferences';
import { toForm, type ProfileForm } from '../profile/profileForm';
import { ROLE_OPTIONS, buildOnboardingProfile, stepErrors, suggestedSkills, toggleSkill } from './onboardingLogic';
import type { RoleRoadmapRequest } from '@job-automator/learning';
import { RoleFields } from '../learn/RoleSetup';
import { roleProblem } from '../learn/roleSetupLogic';

/**
 * Setup for the Android app: a welcome that says what the phone does (and what stays on the computer), then three
 * tap-first steps: about you, your goal, your roadmap. No resume, links, answers or workspace steps: those need files
 * or long typing and are done in the desktop app. Nothing is marked complete until every save succeeds.
 */

interface MobileOnboardingProps {
  initialProfile: MasterProfile;
  currentUser?: Pick<AppUser, 'email' | 'fullName'> | null;
  onComplete: (completedProfile: MasterProfile) => void;
}

export const MOBILE_STEPS = ['welcome', 'about', 'goal', 'roadmap'] as const;
export type MobileStep = (typeof MOBILE_STEPS)[number];

const LOOKING_FOR: Array<{ value: ProfileForm['targetOpportunityType']; label: string; hint: string }> = [
  { value: 'internship', label: 'Internships', hint: 'Summer, semester or remote internships' },
  { value: 'job', label: 'Full-time jobs', hint: 'Graduate and entry-level roles' },
  { value: 'both', label: 'Both', hint: 'Show me everything' },
];

const chip = (on: boolean) =>
  cn(
    'inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-body transition-colors duration-fast',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
    on ? 'border-accent bg-accent-subtle text-accent-subtle-fg' : 'border-line bg-surface text-fg active:bg-fg/[0.06]',
  );

const INTAKE_PROBLEMS = new Set(['Type the role you want to prepare for.', 'Keep the role under 80 characters.']);

export const MobileOnboarding: React.FC<MobileOnboardingProps> = ({ initialProfile, currentUser, onComplete }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState<ProfileForm>(() =>
    toForm(initialProfile, currentUser ?? null, { workspaceMode: prefs.getWorkspaceMode(), opportunityType: prefs.getOppType() }),
  );
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [roleReq, setRoleReq] = useState<RoleRoadmapRequest>({ role: '', level: 'beginner', note: '' });
  const roleTouched = useRef(false);
  const [customRole, setCustomRole] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const step: MobileStep = MOBILE_STEPS[stepIndex];
  const onLastPage = step === 'roadmap';
  const errors = showErrors && step === 'about' ? stepErrors('about', form) : {};
  const set = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    headingRef.current?.focus();
    const page = document.getElementById('main-onboarding');
    if (page) page.scrollTop = 0;
  }, [stepIndex]);

  // The roadmap starts from the role typed on the goal step, whatever it is.
  useEffect(() => {
    if (step !== 'roadmap' || roleTouched.current) return;
    setRoleReq((r) => ({ ...r, role: form.targetRole.trim().slice(0, 80) }));
  }, [step, form.targetRole]);

  const finish = async (withRoadmap: boolean) => {
    setSaving(true);
    setSaveError(null);
    try {
      const api = getApi();
      if (!api?.saveMasterProfile) throw new Error('Profile storage is not available.');
      if (withRoadmap && roleReq.role.trim()) {
        const built = await api.learnRoleRoadmapGenerate({ role: roleReq.role.trim(), level: roleReq.level, note: roleReq.note.trim() });
        if (!built?.success) throw new Error(built?.error || 'Your roadmap could not be built.');
      }
      const profile = buildOnboardingProfile(form, initialProfile, []);
      const res = await api.saveMasterProfile({ ...profile, customAnswersJson: JSON.stringify(profile.customAnswers || {}), onboarding_completed: 1 });
      if (!res || res.success === false) throw new Error(res?.error || 'Saving your profile failed.');
      onComplete({ ...profile, onboardingCompleted: true });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Saving your profile failed.');
    } finally {
      setSaving(false);
    }
  };

  const back = () => {
    setSaveError(null);
    setShowErrors(false);
    setStepIndex((i) => Math.max(0, i - 1));
  };

  const next = () => {
    if (step === 'about' && Object.keys(stepErrors('about', form)).length) {
      setShowErrors(true);
      document.getElementById(`monb-${Object.keys(stepErrors('about', form))[0]}`)?.focus();
      return;
    }
    if (step === 'roadmap') {
      const problem = roleReq.role.trim() ? roleProblem(roleReq.role) : null;
      if (problem) { setSaveError(problem); return; }
      void finish(true);
      return;
    }
    setShowErrors(false);
    setStepIndex((i) => i + 1);
  };

  const pickRole = (r: string) => {
    const on = form.targetRole.trim().toLowerCase() === r.toLowerCase();
    set('targetRole', on ? '' : r);
    setCustomRole('');
  };
  const suggestions = suggestedSkills(form.targetRole, 12);
  const inlineProblem = saveError && INTAKE_PROBLEMS.has(saveError);

  const primaryLabel = step === 'welcome' ? 'Get started' : onLastPage ? (saveError && !inlineProblem ? 'Try again' : 'Finish setup') : 'Continue';

  return (
    <div className="flex h-[100dvh] flex-col bg-canvas text-fg">
      {/* Top bar: back + progress (steps 1–3). */}
      <div className="flex shrink-0 items-center gap-2 px-2 pt-[calc(env(safe-area-inset-top)+8px)] pb-2">
        {step !== 'welcome' ? (
          <button type="button" onClick={back} disabled={saving} aria-label="Back" className="flex size-11 items-center justify-center rounded-full text-accent active:bg-fg/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
            <ChevronLeft className="size-6" aria-hidden="true" />
          </button>
        ) : (
          <span className="size-11" aria-hidden="true" />
        )}
        {step !== 'welcome' && (
          <div
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={1}
            aria-valuemax={3}
            aria-valuenow={stepIndex}
            aria-valuetext={`Step ${stepIndex} of 3`}
            className="flex flex-1 gap-1.5 pr-4"
          >
            {[1, 2, 3].map((i) => <span key={i} className={cn('h-1 flex-1 rounded-full', i <= stepIndex ? 'bg-accent' : 'bg-fg/[0.12]')} />)}
          </div>
        )}
      </div>

      <form
        noValidate
        id="main-onboarding"
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5"
        onSubmit={(e) => { e.preventDefault(); next(); }}
      >
        {step === 'welcome' && (
          <div className="flex flex-1 flex-col justify-center gap-8 py-6">
            <div className="flex flex-col items-start gap-4">
              <NomadicMark title={null} className="h-12" />
              <h1 ref={headingRef} tabIndex={-1} className="text-display font-bold leading-tight text-fg outline-none">Your placement prep, in your pocket</h1>
              <p className="text-body-lg text-fg-muted">Set up in about two minutes. Everything syncs with Nomadic on your computer.</p>
            </div>
            <ul className="flex flex-col gap-4">
              {[
                { icon: BookOpen, title: 'Learn for any role', text: 'A roadmap of topics for the role you want, each with YouTube and ChatGPT, ending in projects.' },
                { icon: Bookmark, title: 'Find and save jobs', text: 'Openings matched to your skills, news on who is hiring, hackathons.' },
                { icon: Laptop, title: 'Apply from your computer', text: 'Saved jobs wait in the desktop app, which fills each form for you to review.' },
              ].map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-accent text-white [&_svg]:size-5"><Icon aria-hidden="true" /></span>
                  <span>
                    <span className="block text-body font-strong text-fg">{title}</span>
                    <span className="block text-body text-fg-muted">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {step === 'about' && (
          <div className="flex flex-col gap-5 py-4">
            <Heading ref={headingRef} title="About you" text="Your name and contact go on applications. Only what you type is used." />
            <Field label="Full name" required error={errors.fullName} id="monb-fullName">
              <Input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} autoComplete="name" />
            </Field>
            <Field label="Email" required error={errors.email} id="monb-email">
              <Input type="email" inputMode="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" />
            </Field>
            <Field label="Phone" error={errors.phone} id="monb-phone" hint="Optional now. Forms ask for it when you apply.">
              <Input type="tel" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" />
            </Field>
          </div>
        )}

        {step === 'goal' && (
          <div className="flex flex-col gap-6 py-4">
            <Heading ref={headingRef} title="Your goal" text="Tap what fits. It shapes your matches and your roadmap; change it any time in Settings." />
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-body font-strong text-fg">Looking for</legend>
              <div className="overflow-hidden rounded-lg bg-surface shadow-e1">
                {LOOKING_FOR.map((o) => {
                  const on = form.targetOpportunityType === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => set('targetOpportunityType', o.value)}
                      className="flex min-h-14 w-full items-center gap-3 border-b border-line px-4 py-2.5 text-left last:border-b-0 active:bg-fg/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                    >
                      <span className="flex-1">
                        <span className="block text-body text-fg">{o.label}</span>
                        <span className="block text-caption text-fg-subtle">{o.hint}</span>
                      </span>
                      {on && <Check className="size-5 text-accent" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-body font-strong text-fg">Target role</legend>
              <div className="flex flex-wrap gap-2">
                {ROLE_OPTIONS.map((r) => {
                  const on = form.targetRole.trim().toLowerCase() === r.toLowerCase();
                  return <button key={r} type="button" aria-pressed={on} className={chip(on)} onClick={() => pickRole(r)}>{on && <Check className="size-4" aria-hidden="true" />}{r}</button>;
                })}
              </div>
              <Field label="Or type your own" id="monb-role">
                <Input
                  value={customRole}
                  onChange={(e) => { setCustomRole(e.target.value); set('targetRole', e.target.value); }}
                  placeholder="e.g. Data Analyst Intern"
                  enterKeyHint="done"
                />
              </Field>
            </fieldset>
            {suggestions.length > 0 && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-body font-strong text-fg">Skills you have</legend>
                <p className="mb-1 text-caption text-fg-subtle">Common for {form.targetRole.trim()}. Tap the ones you know.</p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s) => {
                    const on = form.skills.some((x) => x.toLowerCase() === s.toLowerCase());
                    return <button key={s} type="button" aria-pressed={on} className={chip(on)} onClick={() => set('skills', toggleSkill(form.skills, s))}>{on && <Check className="size-4" aria-hidden="true" />}{s}</button>;
                  })}
                </div>
              </fieldset>
            )}
          </div>
        )}

        {step === 'roadmap' && (
          <div className="flex flex-col gap-4 py-4">
            <Heading
              ref={headingRef}
              title="Your roadmap"
              text="Any role works. Nomadic splits it into subjects, modules and topics, each with YouTube and ChatGPT, and ends with five projects. Building it takes up to a minute."
            />
            <RoleFields
              value={roleReq}
              onChange={(v) => { roleTouched.current = true; setSaveError(null); setRoleReq(v); }}
              error={inlineProblem ? saveError : null}
            />
            {!roleReq.role.trim() && <p className="text-caption text-fg-subtle">Without a role, setup finishes without a roadmap; build it later in Learn.</p>}
          </div>
        )}

        {saveError && !inlineProblem && (
          <div role="alert" className="mb-3 flex items-start gap-2 rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-body text-danger-fg">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>We could not finish setup: {saveError} Nothing was marked complete. Try again.</span>
          </div>
        )}

        {/* Bottom actions stay in reach of the thumb. */}
        <div className="sticky bottom-0 -mx-5 mt-auto flex flex-col gap-1 border-t border-line bg-canvas px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
          <Button type="submit" size="lg" className="w-full" loading={saving} loadingText={step === 'roadmap' && roleReq.role.trim() ? 'Building your roadmap…' : 'Saving…'}>{primaryLabel}</Button>
          {step === 'roadmap' && (
            <Button type="button" variant="ghost" className="w-full" disabled={saving} onClick={() => void finish(false)}>Skip the roadmap for now</Button>
          )}
        </div>
      </form>
    </div>
  );
};

const Heading = React.forwardRef<HTMLHeadingElement, { title: string; text: string }>(function Heading({ title, text }, ref) {
  return (
    <div className="flex flex-col gap-1">
      <h1 ref={ref} tabIndex={-1} className="text-headline font-bold text-fg outline-none">{title}</h1>
      <p className="text-body text-fg-muted">{text}</p>
    </div>
  );
});

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Check, FileText, Github, Globe, Linkedin, RefreshCw, Sparkles, X } from 'lucide-react';
import { Badge, Button, Card, Field, Input, NomadicMark, RadioGroup, Spinner } from '@nomadic/ui';
import { getApi, type AppUser, type MasterProfile } from '../../types';
import { prefs } from '../../store/preferences';
import { toForm, type ProfileForm } from '../profile/profileForm';
import { useResumes } from '../profile/useResumes';
import { ResumesSection } from '../profile/sections';
import {
  ROLE_OPTIONS, SKIPPABLE, STEPS, applyResumeFacts, buildOnboardingProfile, stepErrors, suggestedSkills, toggleSkill, type StepId,
} from './onboardingLogic';
import { APP_ANSWERS, readAppAnswers, writeAppAnswers } from '@nomadic/app-core/shared/applicationAnswers';
import { AppAnswerFields } from '../answers/AppAnswerFields';
import { extractResumeFacts, mergeMissing } from '../answers/resumeFacts';
import { useAnswerDrafts, useDocumentReader } from '../answers/useAnswerDrafts';
import type { RoleRoadmapRequest } from '@job-automator/learning';
import { RoleFields } from '../learn/RoleSetup';
import { roleProblem } from '../learn/roleSetupLogic';

interface OnboardingProps {
  initialProfile: MasterProfile;
  currentUser?: Pick<AppUser, 'email' | 'fullName'> | null;
  /** Called only after the profile was saved with onboarding marked complete. */
  onComplete: (completedProfile: MasterProfile) => void;
}

const chipClass = (on: boolean) =>
  [
    'inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-label transition-colors duration-fast',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
    on ? 'border-accent bg-accent-subtle text-accent-subtle-fg' : 'border-line bg-surface text-fg-muted hover:border-line-strong hover:text-fg',
  ].join(' ');

/**
 * Five short steps from a new account to a usable profile and a learning roadmap.
 * The last step is a short roadmap intake; finishing builds the roadmap (AI with the standard
 * planner as fallback) and Learn opens on its review.
 * Nothing is marked complete until every save succeeds.
 */
export const Onboarding: React.FC<OnboardingProps> = ({ initialProfile, currentUser, onComplete }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState<ProfileForm>(() =>
    toForm(initialProfile, currentUser ?? null, { workspaceMode: prefs.getWorkspaceMode(), opportunityType: prefs.getOppType() }),
  );
  const [showErrors, setShowErrors] = useState(false);
  const [skillDraft, setSkillDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // The roadmap: any role (from the target role step, editable here), a level and an optional note.
  const [roleReq, setRoleReq] = useState<RoleRoadmapRequest>({ role: '', level: 'beginner', note: '' });
  const roleTouched = useRef(false);
  const resumes = useResumes();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  // Documents read on this computer: resume and an optional LinkedIn "Save to PDF" export.
  const [docs, setDocs] = useState<{ resume?: { text: string; name?: string; id: number }; linkedin?: { text: string; name?: string } }>({});
  const [found, setFound] = useState<string | null>(null);
  const [appValues, setAppValues] = useState<Record<string, string>>(() => readAppAnswers(initialProfile.customAnswers as Record<string, string>));
  const [drafted, setDrafted] = useState<Set<string>>(new Set());
  const draftedOnce = useRef(false);
  const reader = useDocumentReader();
  const drafts = useAnswerDrafts();

  const step: StepId = STEPS[stepIndex].id;
  const isLast = stepIndex === STEPS.length - 1;
  const errors = showErrors ? stepErrors(step, form) : {};
  const docText = [docs.resume?.text, docs.linkedin?.text].filter(Boolean).join('\n\n');
  const defaultResume = resumes.resumes.find((r) => r.isDefault) ?? resumes.resumes[0];

  const absorb = useCallback((text: string, source: string) => {
    const facts = extractResumeFacts(text);
    setForm((f) => applyResumeFacts(f, facts));
    const ids = Object.keys(facts.answers);
    setAppValues((v) => {
      const next = mergeMissing(v, facts.answers);
      setDrafted((d) => new Set([...d, ...ids.filter((id) => !v[id]?.trim())]));
      return next;
    });
    const bits = [
      [facts.linkedin, facts.github, facts.portfolio].filter(Boolean).length && `${[facts.linkedin, facts.github, facts.portfolio].filter(Boolean).length} link(s)`,
      facts.phone && 'your phone',
      facts.skills.length && `${facts.skills.length} skill(s)`,
      ids.length && `${ids.length} education or work detail(s)`,
    ].filter(Boolean);
    setFound(bits.length ? `From your ${source}: ${bits.join(', ')}. Check them on the next steps.` : `Read your ${source}. Nothing to fill in automatically; Nomadic AI will use it on the Answers step.`);
  }, []);

  const readResume = useCallback(async (id: number) => {
    const res = await reader.read(id);
    if (!res) return;
    setDocs((d) => ({ ...d, resume: { text: res.text, name: res.fileName, id } }));
    absorb(res.text, 'resume');
  }, [reader, absorb]);

  const readLinkedIn = async () => {
    const res = await reader.read();
    if (!res) return;
    setDocs((d) => ({ ...d, linkedin: { text: res.text, name: res.fileName } }));
    absorb(res.text, 'LinkedIn PDF');
  };

  // A newly added default resume is read straight away (on this computer, no AI).
  const defaultResumeId = defaultResume?.id;
  useEffect(() => {
    if (step !== 'resume' || defaultResumeId === undefined || docs.resume?.id === defaultResumeId) return;
    if (!getApi()?.readDocumentText) return;
    void readResume(defaultResumeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, defaultResumeId]);

  const runDrafts = useCallback(async () => {
    const ids = APP_ANSWERS.filter((d) => d.aiDraft && !appValues[d.id]?.trim()).map((d) => d.id);
    const got = await drafts.draft(ids, {
      name: form.fullName, desiredTitle: form.targetRole, skills: form.skills.join(', '), location: form.location, documentText: docText,
    });
    if (!got) return;
    setAppValues((v) => mergeMissing(v, got));
    setDrafted((d) => new Set([...d, ...Object.keys(got)]));
  }, [appValues, drafts, form.fullName, form.targetRole, form.skills, form.location, docText]);

  // Entering the Answers step with a document read: Nomadic AI drafts the empty answers once.
  useEffect(() => {
    if (step !== 'answers' || draftedOnce.current || !docText || !getApi()?.draftProfileAnswers) return;
    draftedOnce.current = true;
    void runDrafts();
  }, [step, docText, runDrafts]);

  const setAnswer = (id: string, value: string) => {
    setAppValues((v) => ({ ...v, [id]: value }));
    setDrafted((d) => { if (!d.has(id)) return d; const n = new Set(d); n.delete(id); return n; });
  };

  // Move focus to the new step's heading so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    headingRef.current?.focus();
  }, [stepIndex]);

  // Entering the roadmap step: start from the role typed on the "Role and skills" step, whatever it is.
  useEffect(() => {
    if (step !== 'roadmap' || roleTouched.current) return;
    setRoleReq((r) => ({ ...r, role: form.targetRole.trim().slice(0, 80) }));
  }, [step, form.targetRole]);

  const set = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const addDraftSkill = () => {
    const t = skillDraft.trim();
    if (t && !form.skills.some((s) => s.toLowerCase() === t.toLowerCase())) set('skills', [...form.skills, t]);
    setSkillDraft('');
  };

  const goTo = (i: number) => {
    setShowErrors(false);
    setSaveError(null);
    setStepIndex(Math.max(0, Math.min(STEPS.length - 1, i)));
  };

  const finish = async (withRoadmap: boolean) => {
    setSaving(true);
    setSaveError(null);
    try {
      const api = getApi();
      if (!api?.saveMasterProfile) throw new Error('Profile storage is not available.');
      // The roadmap for the typed role (AI; the reviewed library for built-in roles), opened in Learn.
      if (withRoadmap && roleReq.role.trim()) {
        const built = await api.learnRoleRoadmapGenerate({ role: roleReq.role.trim(), level: roleReq.level, note: roleReq.note.trim() });
        if (!built?.success) throw new Error(built?.error || 'Your roadmap could not be built.');
      }
      const base = docText ? { ...initialProfile, resumeText: docText.slice(0, 50_000) } : initialProfile;
      const profile = buildOnboardingProfile(form, base, resumes.resumes);
      const res = await api.saveMasterProfile({
        ...profile,
        customAnswersJson: JSON.stringify(profile.customAnswers || {}),
        onboarding_completed: 1,
      });
      if (!res || res.success === false) throw new Error(res?.error || 'Saving your profile failed.');
      onComplete({ ...profile, onboardingCompleted: true });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Saving your profile failed.');
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    const errs = stepErrors(step, form);
    if (Object.keys(errs).length) {
      setShowErrors(true);
      const first = Object.keys(errs)[0];
      document.getElementById(`onb-${first}`)?.focus();
      return;
    }
    // Answers are saved only when the user continues from the Answers step (skipping keeps them out).
    if (step === 'answers') set('answers', writeAppAnswers(form.answers, Object.fromEntries(APP_ANSWERS.map((d) => [d.id, appValues[d.id] ?? '']))));
    if (step === 'roadmap' && roleReq.role.trim() && roleProblem(roleReq.role)) {
      setSaveError(roleProblem(roleReq.role));
      return;
    }
    if (isLast) void finish(true);
    else goTo(stepIndex + 1);
  };

  const suggestions = suggestedSkills(form.targetRole);

  return (
    <main className="flex min-h-screen items-start justify-center overflow-y-auto bg-canvas p-4 text-fg sm:items-center">
      <Card variant="raised" className={`w-full ${step === 'answers' || step === 'roadmap' ? 'max-w-3xl' : 'max-w-xl'}`}>
        <header className="flex flex-col gap-3 border-b border-line px-6 pb-4 pt-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <NomadicMark title={null} />
              <span className="text-body font-strong text-fg">Set up Nomadic</span>
            </div>
            <span className="text-caption text-fg-subtle">Step {stepIndex + 1} of {STEPS.length}</span>
          </div>
          <div
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
            aria-valuenow={stepIndex + 1}
            aria-valuetext={`Step ${stepIndex + 1} of ${STEPS.length}: ${STEPS[stepIndex].label}`}
            className="h-1 overflow-hidden rounded-full bg-surface-active"
          >
            <div className="h-full rounded-full bg-accent transition-[width] duration-fast" style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} />
          </div>
          <ol className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Setup steps">
            {STEPS.map((s, i) => (
              <li
                key={s.id}
                aria-current={i === stepIndex ? 'step' : undefined}
                className={`flex items-center gap-1 text-caption ${i === stepIndex ? 'font-strong text-fg' : i < stepIndex ? 'text-fg-muted' : 'text-fg-subtle'}`}
              >
                {i < stepIndex && <Check className="size-3" aria-hidden="true" />}
                {s.label}
              </li>
            ))}
          </ol>
        </header>

        <form
          noValidate
          className="flex flex-col gap-5 px-6 py-5"
          onSubmit={(e) => { e.preventDefault(); next(); }}
        >
          {step === 'about' && (
            <>
              <StepHeading ref={headingRef} title="Tell us who you are" description="This fills the basics on every application. Only what you type here is used." />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" required error={errors.fullName} id="onb-fullName" className="sm:col-span-2">
                  <Input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} autoComplete="name" autoFocus />
                </Field>
                <Field label="Email" required error={errors.email} id="onb-email">
                  <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" />
                </Field>
                <Field label="Phone" error={errors.phone} id="onb-phone" hint="Optional now. Needed before you apply.">
                  <Input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" />
                </Field>
              </div>
            </>
          )}

          {step === 'links' && (
            <>
              <StepHeading
                ref={headingRef}
                title="Add your links"
                description="These links help improve your chances of getting hired: recruiters open them to see your work, and many forms ask for them. Nomadic adds them to every application."
              />
              <div className="flex flex-col gap-4">
                <Field label="LinkedIn profile" error={errors.linkedin} id="onb-linkedin" hint="Most recruiters check LinkedIn first.">
                  <Input value={form.linkedin} onChange={(e) => set('linkedin', e.target.value)} leftIcon={<Linkedin />} placeholder="linkedin.com/in/your-name" autoFocus />
                </Field>
                <Field label="GitHub" error={errors.github} id="onb-github" hint="Shows the code behind your projects.">
                  <Input value={form.github} onChange={(e) => set('github', e.target.value)} leftIcon={<Github />} placeholder="github.com/your-name" />
                </Field>
                <Field label="Portfolio or website" error={errors.portfolio} id="onb-portfolio" hint="Optional: a personal site, Behance, Kaggle or a project demo.">
                  <Input value={form.portfolio} onChange={(e) => set('portfolio', e.target.value)} leftIcon={<Globe />} placeholder="your-name.dev" />
                </Field>
              </div>
            </>
          )}

          {step === 'answers' && (
            <>
              <StepHeading
                ref={headingRef}
                title="Answers for applications"
                description="Most forms ask these. Answer once and Nomadic fills them on every application. Change them any time on the Answers page."
              />
              {drafts.busy ? (
                <div role="status" className="flex items-center gap-2 rounded-md border border-line bg-surface-sunken px-3 py-2 text-body text-fg-muted">
                  <Spinner size="sm" /> Nomadic AI is reading your resume and drafting answers…
                </div>
              ) : drafts.error ? (
                <div role="alert" className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-body text-warning-fg">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span className="flex-1">{drafts.error} You can type the answers yourself.</span>
                  {docText && <Button size="sm" variant="ghost" leftIcon={<RefreshCw />} onClick={() => void runDrafts()}>Try again</Button>}
                </div>
              ) : drafted.size > 0 ? (
                <p className="flex items-center gap-2 text-caption text-fg-muted">
                  <Sparkles className="size-3.5 text-accent" aria-hidden="true" />
                  Answers marked "Draft" came from your resume. Check each one; nothing is used until you continue.
                </p>
              ) : !docText ? (
                <p className="text-caption text-fg-muted">Add your resume on the Resume step and Nomadic AI drafts these for you.</p>
              ) : null}
              <AppAnswerFields values={appValues} onChange={setAnswer} drafted={drafted} idPrefix="onb-ans" />
              {docText && !drafts.busy && (
                <div>
                  <Button size="sm" variant="secondary" leftIcon={<Sparkles />} onClick={() => void runDrafts()}>Draft empty answers with AI</Button>
                </div>
              )}
            </>
          )}

          {step === 'target' && (
            <>
              <StepHeading ref={headingRef} title="What are you aiming for?" description="Used to match jobs and suggest what to learn next. You can change it later." />
              <Field label="Target role" id="onb-targetRole" hint="Pick one below or type your own.">
                <Input value={form.targetRole} onChange={(e) => set('targetRole', e.target.value)} placeholder="e.g. Software Engineer Intern" />
              </Field>
              <div role="group" aria-label="Common roles" className="-mt-2 flex flex-wrap gap-1.5">
                {ROLE_OPTIONS.map((r) => {
                  const on = form.targetRole.trim().toLowerCase() === r.toLowerCase();
                  return (
                    <button key={r} type="button" aria-pressed={on} className={chipClass(on)} onClick={() => set('targetRole', on ? '' : r)}>
                      {r}
                    </button>
                  );
                })}
              </div>
              <Field label="Looking for">
                <RadioGroup
                  variant="cards"
                  orientation="horizontal"
                  value={form.targetOpportunityType}
                  onValueChange={(v) => set('targetOpportunityType', v as ProfileForm['targetOpportunityType'])}
                  options={[
                    { value: 'internship', label: 'Internships' },
                    { value: 'job', label: 'Full-time jobs' },
                    { value: 'both', label: 'Both' },
                  ]}
                />
              </Field>
              <Field label="Your skills" id="onb-skill" hint="Press Enter to add a skill.">
                <Input
                  value={skillDraft}
                  onChange={(e) => setSkillDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDraftSkill(); } }}
                  placeholder="e.g. Python"
                />
              </Field>
              {suggestions.length > 0 && (
                <div className="-mt-2 flex flex-col gap-1.5">
                  <span className="text-caption text-fg-subtle">Common for {form.targetRole.trim()}</span>
                  <div role="group" aria-label="Suggested skills" className="flex flex-wrap gap-1.5">
                    {suggestions.map((s) => {
                      const on = form.skills.some((x) => x.toLowerCase() === s.toLowerCase());
                      return (
                        <button key={s} type="button" aria-pressed={on} className={chipClass(on)} onClick={() => set('skills', toggleSkill(form.skills, s))}>
                          {on && <Check className="size-3" aria-hidden="true" />}
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {form.skills.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label="Your skills">
                  {form.skills.map((s) => (
                    <li key={s}>
                      <Badge tone="neutral" className="gap-1 pr-1">
                        {s}
                        <button
                          type="button"
                          aria-label={`Remove ${s}`}
                          onClick={() => set('skills', form.skills.filter((x) => x !== s))}
                          className="rounded p-0.5 hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                        >
                          <X className="size-3" aria-hidden="true" />
                        </button>
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {step === 'resume' && (
            <>
              <StepHeading ref={headingRef} title="Add your resume" description="Nomadic attaches your default resume when you apply. You can skip this and add one later in Profile." />
              <ResumesSection state={resumes} targetRole={form.targetRole} />
              <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-sunken p-4">
                <div className="flex items-start gap-2">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                  <p className="text-body text-fg-muted">
                    Nomadic reads your resume and your LinkedIn PDF on this computer to fill your profile and draft answers. On LinkedIn, open your profile, choose More, then Save to PDF.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    leftIcon={<FileText />}
                    disabled={!defaultResume}
                    loading={reader.reading && !docs.linkedin}
                    onClick={() => defaultResume && void readResume(defaultResume.id)}
                  >
                    {docs.resume ? 'Read resume again' : 'Read my resume'}
                  </Button>
                  <Button size="sm" variant="secondary" leftIcon={<Linkedin />} onClick={() => void readLinkedIn()} disabled={reader.reading}>
                    {docs.linkedin ? 'Replace LinkedIn PDF' : 'Add LinkedIn PDF'}
                  </Button>
                </div>
                {(docs.resume || docs.linkedin) && (
                  <ul className="flex flex-wrap gap-1.5" aria-label="Documents read">
                    {docs.resume && <li><Badge tone="success" className="gap-1"><Check className="size-3" aria-hidden="true" />{docs.resume.name ?? 'Resume'}</Badge></li>}
                    {docs.linkedin && <li><Badge tone="success" className="gap-1"><Check className="size-3" aria-hidden="true" />{docs.linkedin.name ?? 'LinkedIn PDF'}</Badge></li>}
                  </ul>
                )}
                {found && <p role="status" className="text-caption text-fg-muted">{found}</p>}
                {reader.error && <p role="alert" className="text-caption text-danger-fg">{reader.error}</p>}
              </div>
            </>
          )}

          {step === 'workspace' && (
            <>
              <StepHeading ref={headingRef} title="Choose your workspace" description="Pick what you want to see first. You can switch any time in Settings." />
              <RadioGroup
                aria-label="Workspace"
                variant="cards"
                value={form.workspaceMode}
                onValueChange={(v) => set('workspaceMode', v as ProfileForm['workspaceMode'])}
                options={[
                  { value: 'unified', label: 'Learn and apply', description: 'Learning paths and the job feed together.' },
                  { value: 'learner_only', label: 'Learn', description: 'Learning paths, lessons and interview practice.' },
                  { value: 'seeker_only', label: 'Apply', description: 'Job and internship feed, applications and tracking.' },
                ]}
              />
            </>
          )}

          {step === 'roadmap' && (
            <>
              <StepHeading
                ref={headingRef}
                title="Your roadmap"
                description="Any role works. Nomadic splits it into subjects, modules and topics, each with its own YouTube and ChatGPT buttons, and ends with five projects. Building it takes up to a minute."
              />
              <RoleFields
                value={roleReq}
                onChange={(v) => { roleTouched.current = true; setSaveError(null); setRoleReq(v); }}
                error={saveError && stepProblemShown(saveError) ? saveError : null}
              />
              {!roleReq.role.trim() && (
                <p className="text-caption text-fg-subtle">Without a role, setup finishes without a roadmap; build it later in Learn.</p>
              )}
            </>
          )}

          {isLast && saveError && !stepProblemShown(saveError) && (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-body text-danger-fg">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>We could not finish setup: {saveError} Nothing was marked complete. Try again.</span>
            </div>
          )}

          <div className="flex items-center gap-2 border-t border-line pt-4">
            {stepIndex > 0 && (
              <Button
                variant="ghost"
                leftIcon={<ArrowLeft />}
                onClick={() => goTo(stepIndex - 1)}
                disabled={saving}
              >
                Back
              </Button>
            )}
            <div className="flex-1" />
            {SKIPPABLE.has(step) && (
              <Button variant="ghost" disabled={saving} onClick={() => (isLast ? void finish(false) : goTo(stepIndex + 1))}>Skip for now</Button>
            )}
            <Button
              type="submit"
              variant="primary"
              rightIcon={isLast ? undefined : <ArrowRight />}
              loading={saving}
              loadingText={step === 'roadmap' && roleReq.role.trim() ? 'Building your roadmap…' : 'Saving…'}
            >
              {isLast ? (saveError && !stepProblemShown(saveError) ? 'Try again' : 'Finish setup') : 'Continue'}
            </Button>
          </div>
        </form>
      </Card>
    </main>
  );
};

/** Role problems are shown inline, not as a failed save. */
const INTAKE_PROBLEMS = new Set(['Type the role you want to prepare for.', 'Keep the role under 80 characters.']);
const stepProblemShown = (msg: string) => INTAKE_PROBLEMS.has(msg);

const StepHeading = React.forwardRef<HTMLHeadingElement, { title: string; description: string }>(function StepHeading(
  { title, description },
  ref,
) {
  return (
    <div className="flex flex-col gap-1">
      <h1 ref={ref} tabIndex={-1} className="text-title font-strong text-fg outline-none">{title}</h1>
      <p className="text-body text-fg-muted">{description}</p>
    </div>
  );
});

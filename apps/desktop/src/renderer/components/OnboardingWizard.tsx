import React, { useMemo, useState } from 'react';
import { ArrowRight, ArrowLeft, Check, FileText, Loader2, Plus, Upload } from 'lucide-react';
import { MasterProfile, getApi, OpportunityType } from '../types';
import { searchRoleTitles } from '../data/roleSearch';

interface OnboardingWizardProps {
  initialProfile: MasterProfile;
  currentUser?: { email?: string; fullName?: string } | null;
  onComplete: (completedProfile: MasterProfile) => void;
  onSwitchToLogin?: () => void;
}

const EXPERIENCE_LEVELS = [
  { id: 'entry', label: 'Entry level', desc: '0-2 years' },
  { id: 'mid', label: 'Mid level', desc: '2-5 years' },
  { id: 'senior', label: 'Senior', desc: '5+ years' },
] as const;

const OPPORTUNITY_TYPES: Array<{ id: OpportunityType; label: string }> = [
  { id: 'job', label: 'Full-time jobs' },
  { id: 'internship', label: 'Internships' },
  { id: 'both', label: 'Both' },
];

const ROLE_SUGGESTIONS = [
  'Software Engineer', 'Frontend Engineer', 'Backend Engineer', 'Full Stack Engineer',
  'Data Analyst', 'Product Manager', 'UI/UX Designer', 'DevOps Engineer',
  'AI / ML Engineer', 'Marketing Associate',
];

const SKILL_SUGGESTIONS = [
  'TypeScript', 'React', 'Node.js', 'Python', 'SQL', 'Java', 'Next.js', 'Docker',
  'AWS', 'Figma', 'Data Analysis', 'Product Strategy', 'Communication', 'Project Management',
];

const inputClass =
  'w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/20 dark:focus:ring-white/20 focus:border-slate-900 dark:focus:border-white transition';

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block space-y-1.5">
    <span className="block text-[13px] font-semibold text-slate-700 dark:text-slate-300">
      {label} {hint && <span className="font-normal text-slate-400">{hint}</span>}
    </span>
    {children}
  </label>
);

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ initialProfile, currentUser, onComplete }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const userEmail = currentUser?.email || initialProfile.email || '';
  const [firstName, setFirstName] = useState(initialProfile.firstName || (currentUser?.fullName ? currentUser.fullName.split(' ')[0] : ''));
  const [lastName, setLastName] = useState(initialProfile.lastName || (currentUser?.fullName ? currentUser.fullName.split(' ').slice(1).join(' ') : ''));
  const [phone, setPhone] = useState(initialProfile.phone || '');
  const [linkedin, setLinkedin] = useState(initialProfile.linkedin || '');
  const [github, setGithub] = useState(initialProfile.github || '');

  const [role, setRole] = useState(initialProfile.desiredTitle || '');
  const [experience, setExperience] = useState<'entry' | 'mid' | 'senior'>(initialProfile.experienceLevel || 'entry');
  const [opportunity, setOpportunity] = useState<OpportunityType>(initialProfile.targetOpportunityType || 'both');
  const [skills, setSkills] = useState<string[]>(
    initialProfile.techStack ? initialProfile.techStack.split(',').map((s) => s.trim()).filter(Boolean) : [],
  );
  const [skillInput, setSkillInput] = useState('');

  const [resumePath, setResumePath] = useState(initialProfile.resumeFilePath || '');
  const [resumeName, setResumeName] = useState(initialProfile.resumeFilePath ? initialProfile.resumeFilePath.split(/[/\\]/).pop() || '' : '');
  const [picking, setPicking] = useState(false);
  const [needsSponsorship, setNeedsSponsorship] = useState(initialProfile.sponsorship === 'Yes');
  const [noticePeriod, setNoticePeriod] = useState(initialProfile.noticePeriod || '');
  const [salary, setSalary] = useState(initialProfile.desiredSalary || '');
  const [saving, setSaving] = useState(false);

  const suggestions = useMemo(() => (role.trim().length >= 2 ? searchRoleTitles(role, 5) : []), [role]);
  const showSuggestions = suggestions.length > 0 && !suggestions.some((s) => s.toLowerCase() === role.trim().toLowerCase());

  const addSkill = (raw: string) => {
    const s = raw.trim();
    if (!s || skills.some((x) => x.toLowerCase() === s.toLowerCase())) return;
    setSkills([...skills, s]);
    setSkillInput('');
  };
  const toggleSkill = (s: string) =>
    setSkills((prev) => (prev.some((x) => x.toLowerCase() === s.toLowerCase()) ? prev.filter((x) => x.toLowerCase() !== s.toLowerCase()) : [...prev, s]));

  const canContinue =
    step === 1 ? firstName.trim().length > 0 && phone.trim().length >= 7 : step === 2 ? role.trim().length > 1 : !!resumePath;

  const pickResume = async () => {
    const api = getApi();
    if (!api?.pickResumeFile) return;
    setPicking(true);
    try {
      const res = await api.pickResumeFile();
      if (res.canceled || !res.filePath) return;
      const name = res.fileName || res.filePath.split(/[/\\]/).pop() || 'Resume.pdf';
      setResumePath(res.filePath);
      setResumeName(name);
      await api.saveResume?.({ name, targetRole: role || 'General', filePath: res.filePath, isDefault: true });
    } catch (err: any) {
      console.warn('[Onboarding] Resume picker error:', err?.message);
    } finally {
      setPicking(false);
    }
  };

  const finish = async () => {
    setSaving(true);
    const finalProfile: MasterProfile = {
      ...initialProfile,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: userEmail,
      phone: phone.trim(),
      linkedin: linkedin.trim(),
      github: github.trim(),
      desiredTitle: role.trim(),
      experienceLevel: experience,
      targetOpportunityType: opportunity,
      techStack: skills.join(', '),
      resumeFilePath: resumePath,
      sponsorship: needsSponsorship ? 'Yes' : 'No',
      noticePeriod: noticePeriod.trim() || initialProfile.noticePeriod || '2 weeks',
      desiredSalary: salary.trim(),
      workspaceMode: 'seeker_only',
      onboardingCompleted: true,
    };
    // The parent persists the profile (local DB + cache) and routes to the Jobs tab.
    onComplete(finalProfile);
    setSaving(false);
  };

  const chip = (active: boolean) =>
    `inline-flex items-center gap-1 px-3 h-8 rounded-full border text-[13px] font-medium transition ${
      active
        ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
        : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
    }`;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 sm:p-6 select-none">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-2.5 mb-6 justify-center">
          <img src="./assets/logo-icon.png" alt="" className="w-8 h-8 rounded-lg object-contain" />
          <span className="font-extrabold text-lg tracking-tight text-slate-900 dark:text-white">Nomadic</span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>Step {step} of 3</span>
              <span>{step === 1 ? 'About you' : step === 2 ? 'Your search' : 'Resume & basics'}</span>
            </div>
            <div className="flex gap-1.5" aria-hidden>
              {[1, 2, 3].map((n) => (
                <div key={n} className={`h-1.5 flex-1 rounded-full transition-colors ${n <= step ? 'bg-slate-900 dark:bg-white' : 'bg-slate-200 dark:bg-slate-800'}`} />
              ))}
            </div>
          </div>

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Let&apos;s set up your profile</h1>
                <p className="text-sm text-slate-500 mt-1">Nomadic uses this to fill application forms for you. Takes about a minute.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="First name"><input className={inputClass} value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus autoComplete="given-name" /></Field>
                <Field label="Last name"><input className={inputClass} value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" /></Field>
              </div>
              <Field label="Phone" hint="with country code"><input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" inputMode="tel" autoComplete="tel" /></Field>
              <Field label="LinkedIn" hint="optional"><input className={inputClass} value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="https://linkedin.com/in/you" /></Field>
              <Field label="GitHub or portfolio" hint="optional"><input className={inputClass} value={github} onChange={(e) => setGithub(e.target.value)} placeholder="https://github.com/you" /></Field>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">What are you looking for?</h1>
                <p className="text-sm text-slate-500 mt-1">We&apos;ll rank openings by how well they match.</p>
              </div>
              <div className="space-y-2 relative">
                <Field label="Target role">
                  <input className={inputClass} value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Frontend Engineer" autoFocus />
                </Field>
                {showSuggestions && (
                  <div className="absolute z-10 left-0 right-0 top-[70px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg overflow-hidden">
                    {suggestions.map((s) => (
                      <button key={s} type="button" onClick={() => setRole(s)} className="block w-full text-left px-3.5 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">{s}</button>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {ROLE_SUGGESTIONS.map((r) => (
                    <button key={r} type="button" onClick={() => setRole(r)} className={chip(role === r)}>{r}</button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="block text-[13px] font-semibold text-slate-700 dark:text-slate-300">Experience</span>
                <div className="grid grid-cols-3 gap-2">
                  {EXPERIENCE_LEVELS.map((l) => (
                    <button key={l.id} type="button" onClick={() => setExperience(l.id)}
                      className={`rounded-xl border p-2.5 text-center transition ${experience === l.id ? 'border-slate-900 dark:border-white bg-slate-50 dark:bg-slate-800' : 'border-slate-200 dark:border-slate-700 hover:border-slate-400'}`}>
                      <div className="text-[13px] font-semibold text-slate-900 dark:text-white">{l.label}</div>
                      <div className="text-[11px] text-slate-500">{l.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="block text-[13px] font-semibold text-slate-700 dark:text-slate-300">Show me</span>
                <div className="flex gap-2">
                  {OPPORTUNITY_TYPES.map((o) => (
                    <button key={o.id} type="button" onClick={() => setOpportunity(o.id)} className={chip(opportunity === o.id)}>{o.label}</button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <span className="block text-[13px] font-semibold text-slate-700 dark:text-slate-300">Key skills <span className="font-normal text-slate-400">({skills.length} selected)</span></span>
                <form onSubmit={(e) => { e.preventDefault(); addSkill(skillInput); }} className="flex gap-2">
                  <input className={inputClass} value={skillInput} onChange={(e) => setSkillInput(e.target.value)} placeholder="Add a skill and press Enter" />
                  <button type="submit" disabled={!skillInput.trim()} className="h-11 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-semibold disabled:opacity-40">Add</button>
                </form>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                  {Array.from(new Set([...skills, ...SKILL_SUGGESTIONS])).map((s) => {
                    const active = skills.some((x) => x.toLowerCase() === s.toLowerCase());
                    return (
                      <button key={s} type="button" onClick={() => toggleSkill(s)} className={chip(active)}>
                        {active ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3 text-slate-400" />}{s}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Resume &amp; quick answers</h1>
                <p className="text-sm text-slate-500 mt-1">Applications need a resume. The answers below are reused on every form.</p>
              </div>

              <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0"><FileText className="w-5 h-5 text-slate-600 dark:text-slate-300" /></div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{resumeName || 'No resume attached'}</div>
                    <div className="text-xs text-slate-500">PDF or Word document</div>
                  </div>
                </div>
                <button type="button" onClick={pickResume} disabled={picking}
                  className="h-10 px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold flex items-center gap-2 disabled:opacity-60 shrink-0">
                  {picking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}{resumeName ? 'Replace' : 'Choose file'}
                </button>
              </div>

              <div className="space-y-1.5">
                <span className="block text-[13px] font-semibold text-slate-700 dark:text-slate-300">Will you need visa sponsorship?</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setNeedsSponsorship(false)} className={chip(!needsSponsorship)}>No</button>
                  <button type="button" onClick={() => setNeedsSponsorship(true)} className={chip(needsSponsorship)}>Yes</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Notice period" hint="optional"><input className={inputClass} value={noticePeriod} onChange={(e) => setNoticePeriod(e.target.value)} placeholder="e.g. 30 days" /></Field>
                <Field label="Expected salary" hint="optional"><input className={inputClass} value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="e.g. 12 LPA" /></Field>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            {step > 1 ? (
              <button type="button" onClick={() => setStep((step - 1) as 1 | 2)} className="h-11 px-4 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            ) : <span />}
            {step < 3 ? (
              <button type="button" disabled={!canContinue} onClick={() => setStep((step + 1) as 2 | 3)}
                className="h-11 px-6 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold flex items-center gap-2 disabled:opacity-40">
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button type="button" disabled={!canContinue || saving} onClick={finish}
                className="h-11 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-40">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Finish setup
              </button>
            )}
          </div>
          {step === 3 && !resumePath && <p className="text-xs text-slate-500 text-center -mt-2">Attach a resume to finish. Auto-apply can&apos;t submit without one.</p>}
        </div>
      </div>
    </div>
  );
};

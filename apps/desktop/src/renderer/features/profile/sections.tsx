import React, { useState } from 'react';
import { ExternalLink, FileText, Trash2, Upload, X } from 'lucide-react';
import {
  Badge, Button, Card, CardContent, CardHeader, EmptyState, Field, IconButton, Input, RadioGroup, Skeleton, Switch, VStack,
} from '@nomadic/ui';
import { getApi, type AppUser } from '../../types';
import { PlanStatus } from '../billing/PlanStatus';
import { EmailVerificationNotice } from '../auth/EmailVerificationNotice';
import type { FieldErrors, ProfileForm } from './profileForm';
import type { ResumesState } from './useResumes';

interface FormProps {
  form: ProfileForm;
  errors: FieldErrors;
  set: <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) => void;
}

export const PersonalSection: React.FC<FormProps> = ({ form, errors, set }) => (
  <Card>
    <CardHeader title="Personal details" description="Used to fill application forms. Only what you enter here is ever submitted." />
    <CardContent>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required error={errors.fullName}>
          <Input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} autoComplete="name" />
        </Field>
        <Field label="Email" required error={errors.email}>
          <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" />
        </Field>
        <Field label="Phone" error={errors.phone}>
          <Input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" />
        </Field>
        <Field label="Location" hint="City, state">
          <Input value={form.location} onChange={(e) => set('location', e.target.value)} />
        </Field>
        <Field label="LinkedIn" error={errors.linkedin}>
          <Input value={form.linkedin} onChange={(e) => set('linkedin', e.target.value)} placeholder="linkedin.com/in/…" />
        </Field>
        <Field label="GitHub" error={errors.github}>
          <Input value={form.github} onChange={(e) => set('github', e.target.value)} placeholder="github.com/…" />
        </Field>
        <Field label="Portfolio" error={errors.portfolio}>
          <Input value={form.portfolio} onChange={(e) => set('portfolio', e.target.value)} />
        </Field>
      </div>
    </CardContent>
  </Card>
);

export const TargetingSection: React.FC<FormProps> = ({ form, errors, set }) => {
  const [draft, setDraft] = useState('');
  const add = () => {
    const t = draft.trim();
    if (t && !form.skills.some((s) => s.toLowerCase() === t.toLowerCase())) set('skills', [...form.skills, t]);
    setDraft('');
  };
  return (
    <Card>
      <CardHeader title="What you are looking for" description="Drives job matching and what the apply flow tells employers." />
      <CardContent>
        <VStack gap={4}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Target role" hint="For example: Software Engineer Intern">
              <Input value={form.targetRole} onChange={(e) => set('targetRole', e.target.value)} />
            </Field>
            <Field label="Years of experience" error={errors.yearsOfExperience} hint="Leave empty if you are a fresher">
              <Input
                type="number" min={0} max={60}
                value={form.yearsOfExperience ?? ''}
                onChange={(e) => set('yearsOfExperience', e.target.value === '' ? null : Number(e.target.value))}
              />
            </Field>
            <Field label="Expected salary" hint="Shared only if a form asks. Optional.">
              <Input value={form.expectedSalary} onChange={(e) => set('expectedSalary', e.target.value)} placeholder="e.g. ₹6 LPA" />
            </Field>
            <Field label="Notice period" hint="Optional">
              <Input value={form.noticePeriod} onChange={(e) => set('noticePeriod', e.target.value)} placeholder="e.g. Immediate" />
            </Field>
          </div>
          <Field label="Skills" hint="Press Enter to add">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
              onBlur={add}
              placeholder="Add a skill"
            />
          </Field>
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
        </VStack>
      </CardContent>
    </Card>
  );
};

export const PreferencesSection: React.FC<FormProps> = ({ form, set }) => (
  <Card>
    <CardHeader title="Workspace" description="Choose what Nomadic shows you." />
    <CardContent>
      <VStack gap={4}>
        <Field label="Focus">
          <RadioGroup
            variant="cards" orientation="horizontal" value={form.workspaceMode}
            onValueChange={(v) => set('workspaceMode', v as ProfileForm['workspaceMode'])}
            options={[
              { value: 'unified', label: 'Learn and Seek', description: 'Both workspaces' },
              { value: 'learner_only', label: 'Learn only', description: 'Roadmaps and practice' },
              { value: 'seeker_only', label: 'Seek only', description: 'Jobs and applications' },
            ]}
          />
        </Field>
        <Field label="Opportunity type">
          <RadioGroup
            variant="cards" orientation="horizontal" value={form.targetOpportunityType}
            onValueChange={(v) => set('targetOpportunityType', v as ProfileForm['targetOpportunityType'])}
            options={[
              { value: 'both', label: 'Jobs and internships' },
              { value: 'job', label: 'Full-time jobs' },
              { value: 'internship', label: 'Internships' },
            ]}
          />
        </Field>
      </VStack>
    </CardContent>
  </Card>
);

export const AnswersSection: React.FC<FormProps> = ({ form, set }) => (
  <Card>
    <CardHeader title="Application answers" description="Answers to questions almost every application asks." />
    <CardContent>
      <VStack gap={4}>
        <Switch
          label="I am legally authorized to work in the country I apply in"
          checked={form.workAuthorized}
          onCheckedChange={(v) => set('workAuthorized', v)}
        />
        <Switch
          label="I will need visa sponsorship"
          checked={form.requiresSponsorship}
          onCheckedChange={(v) => set('requiresSponsorship', v)}
        />
        <p className="text-caption text-fg-subtle">
          Nomadic always shows you the filled form and waits for your confirmation before anything is submitted.
        </p>
      </VStack>
    </CardContent>
  </Card>
);

export const ResumesSection: React.FC<{ state: ResumesState; targetRole: string }> = ({ state, targetRole }) => {
  const { resumes, loading, busy, error } = state;
  return (
    <Card>
      <CardHeader
        title="Resumes"
        description="Attach PDF resumes. The default one is used when you apply."
        actions={<Button size="sm" leftIcon={<Upload />} loading={busy} onClick={() => state.upload(targetRole)}>Upload resume</Button>}
      />
      <CardContent>
        {error && (
          <EmptyState
            size="sm" tone="danger" title="Something went wrong" description={error}
            actions={<Button size="sm" variant="secondary" onClick={() => state.reload()}>Try again</Button>}
          />
        )}
        {loading ? (
          <VStack gap={2} aria-busy="true" aria-label="Loading resumes"><Skeleton height={44} /><Skeleton height={44} /></VStack>
        ) : resumes.length === 0 && !error ? (
          <EmptyState bordered size="sm" icon={<FileText />} title="No resumes yet" description="Upload a PDF to apply with one click." />
        ) : (
          <ul className="flex flex-col gap-2">
            {resumes.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
                <FileText className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-body font-strong text-fg">{r.name}</span>
                    {r.isDefault && <Badge tone="success" size="sm">Default</Badge>}
                  </div>
                  <div className="truncate text-caption text-fg-subtle">{r.targetRole}</div>
                </div>
                {!r.isDefault && <Button size="sm" variant="ghost" disabled={busy} onClick={() => state.makeDefault(r.id)}>Make default</Button>}
                <IconButton label={`Delete ${r.name}`} icon={<Trash2 />} variant="ghost" size="sm" disabled={busy} onClick={() => state.remove(r.id)} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

const PORTALS = [
  { name: 'Internshala', note: 'Internships and fresher roles in India', login: 'https://internshala.com/login/user', register: 'https://internshala.com/registration/student' },
  { name: 'Naukri', note: 'Jobs across India', login: 'https://www.naukri.com/nlogin/login', register: 'https://www.naukri.com/registration/createAccount' },
  { name: 'LinkedIn', note: 'Easy Apply and company pages', login: 'https://www.linkedin.com/login', register: 'https://www.linkedin.com/signup' },
  { name: 'Google', note: 'Needed for Google sign-in on some portals', login: 'https://accounts.google.com/', register: 'https://accounts.google.com/signup' },
];

const openUrl = (url: string) => {
  const api = getApi();
  if (api?.openExternalUrl) void api.openExternalUrl(url);
  else window.open(url, '_blank', 'noopener');
};

export const PortalsSection: React.FC = () => (
  <Card>
    <CardHeader title="Job portal sign-ins" description="Sign in once in Chrome with “Remember me” so applications do not stop at a login page." />
    <CardContent>
      <ul className="grid gap-3 sm:grid-cols-2">
        {PORTALS.map((p) => (
          <li key={p.name} className="flex flex-col gap-2 rounded-lg border border-line p-3">
            <div>
              <div className="text-body font-strong text-fg">{p.name}</div>
              <div className="text-caption text-fg-subtle">{p.note}</div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" rightIcon={<ExternalLink />} onClick={() => openUrl(p.login)}>Sign in</Button>
              <Button size="sm" variant="ghost" onClick={() => openUrl(p.register)}>Register</Button>
            </div>
          </li>
        ))}
      </ul>
    </CardContent>
  </Card>
);

export const AccountSection: React.FC<{ user?: AppUser | null; onLogout?: () => void; onRerunOnboarding?: () => void; onOpenUpgrade?: () => void }> = ({ user, onLogout, onRerunOnboarding, onOpenUpgrade }) => (
  <Card>
    <CardHeader title="Account" description="Your plan, sign-in and data." />
    <CardContent>
      <VStack gap={4}>
        <dl className="grid gap-3">
          <div>
            <dt className="text-caption text-fg-subtle">Email</dt>
            <dd className="flex flex-col items-start gap-2 text-body text-fg">
              <span>{user?.email ?? '—'}</span>
              {user && <EmailVerificationNotice email={user.email} />}
            </dd>
          </div>
          <div><dt className="mb-1 text-caption text-fg-subtle">Plan</dt><dd><PlanStatus onUpgrade={onOpenUpgrade} /></dd></div>
        </dl>
        <p className="text-caption text-fg-subtle">
          Your profile and resumes are stored on this computer and synced to your Nomadic account so they follow you to a new install.
        </p>
        <div className="flex flex-wrap gap-2">
          {onRerunOnboarding && <Button variant="secondary" size="sm" onClick={onRerunOnboarding}>Redo setup</Button>}
          {onLogout && <Button variant="danger" size="sm" onClick={onLogout}>Sign out</Button>}
        </div>
      </VStack>
    </CardContent>
  </Card>
);

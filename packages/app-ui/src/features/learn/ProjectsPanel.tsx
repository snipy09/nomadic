import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, MessageCircleQuestion, Sparkles } from 'lucide-react';
import { Badge, Button, Card, Checkbox, Field, Textarea, cn, useToast } from '@nomadic/ui';
import {
  capstoneStepKey,
  projectReadiness,
  type CapstoneMilestone,
  type CapstoneStep,
  type RoleProgress,
  type RoleProject,
  type RoleRoadmap,
} from '@job-automator/learning';
import type { LearnCapstoneHelpRequest, LearnProjectHelpResult } from '../../types';
import { LearnButtons } from './LearnButtons';
import { stepPrompt } from './learnLinks';

type Result = Promise<{ ok: boolean; error?: string }>;

export interface ProjectsPanelProps {
  roadmap: RoleRoadmap;
  progress: RoleProgress;
  done: Set<string>;
  /** Builds the guided plan for a project and makes it the capstone. */
  onPickCapstone: (projectId: string) => Result;
  onToggleStep: (projectId: string, step: CapstoneStep, done: boolean) => Result;
  onAskStep: (req: LearnCapstoneHelpRequest) => Promise<LearnProjectHelpResult>;
  onOpenUpgrade?: (feature?: string) => void;
}

const LEVEL_LABEL: Record<RoleProject['level'], string> = { starter: 'Starter', intermediate: 'Intermediate', stretch: 'Stretch' };

/** The roadmap's last node: five projects for the role, one of them the student's fully assisted capstone. */
export function ProjectsPanel(props: ProjectsPanelProps) {
  const { roadmap, progress } = props;
  const [showAll, setShowAll] = useState(!roadmap.capstone);
  const [building, setBuilding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const capstoneProject = roadmap.capstone ? roadmap.projects.find((p) => p.id === roadmap.capstone!.project_id) ?? null : null;

  if (roadmap.capstone && capstoneProject && !showAll) {
    return <CapstoneView {...props} project={capstoneProject} onShowAll={() => setShowAll(true)} />;
  }

  const pick = async (id: string) => {
    setBuilding(id);
    setError(null);
    const res = await props.onPickCapstone(id);
    setBuilding(null);
    if (res.ok) setShowAll(false);
    else setError(res.error ?? 'The capstone plan could not be built.');
  };

  if (!roadmap.projects.length) {
    return <Card padding="lg" className="text-body text-fg-muted">No projects came with this roadmap. Build it again with "Change role" to get five.</Card>;
  }

  return (
    <section aria-label="Projects" className="flex flex-col gap-3">
      <p className="text-body text-fg-muted">
        {roadmap.projects.length} projects picked for a {roadmap.role.toLowerCase()}. Make one your capstone: Nomadic breaks it into milestones and steps, each with YouTube, ChatGPT and Ask Nomadic AI. A project is best started once the modules it uses are mostly done.
      </p>
      {error && <p role="alert" className="text-body text-danger-fg">{error}</p>}
      <ul className="grid gap-3 md:grid-cols-2">
        {roadmap.projects.map((p) => {
          const ready = projectReadiness(p, progress);
          const isCap = roadmap.capstone?.project_id === p.id;
          const uses = roadmap.subjects.flatMap((s) => s.modules).filter((m) => p.uses.includes(m.id)).map((m) => m.title);
          return (
            <li key={p.id}>
              <Card padding="md" className={cn('flex h-full flex-col gap-3', isCap && 'border-accent')}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge size="sm" tone={p.level === 'starter' ? 'success' : p.level === 'intermediate' ? 'accent' : 'warning'}>{LEVEL_LABEL[p.level]}</Badge>
                  <span className="text-caption text-fg-subtle">about {p.hours} h</span>
                  {p.source === 'curated' && <span className="text-caption text-fg-subtle">· curated</span>}
                  {isCap && <Badge size="sm" tone="accent">Your capstone</Badge>}
                </div>
                <h3 className="text-heading font-strong text-fg">{p.title}</h3>
                {p.brief && <p className="text-body text-fg-muted">{p.brief}</p>}
                <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-body">
                  {p.deliverable && (<><dt className="text-fg-subtle">You end with</dt><dd className="text-fg">{p.deliverable}</dd></>)}
                  {uses.length > 0 && (<><dt className="text-fg-subtle">Uses</dt><dd className="text-fg">{uses.join(', ')}</dd></>)}
                </dl>
                <div className="mt-auto flex items-center gap-2 text-caption text-fg-subtle">
                  <span>Ready</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
                    <span className="block h-full rounded-full bg-success" style={{ width: `${ready}%` }} />
                  </span>
                  <span className="tabular-nums">{ready}%</span>
                </div>
                <div>
                  {isCap ? (
                    <Button variant="primary" rightIcon={<ArrowRight />} onClick={() => setShowAll(false)}>Open my capstone</Button>
                  ) : (
                    <Button
                      variant={roadmap.capstone ? 'secondary' : 'primary'}
                      leftIcon={<Sparkles />}
                      loading={building === p.id}
                      loadingText="Building the plan…"
                      disabled={!!building && building !== p.id}
                      onClick={() => void pick(p.id)}
                    >
                      {roadmap.capstone ? 'Switch to this one' : 'Make this my capstone'}
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CapstoneView({
  roadmap,
  done,
  project,
  progress,
  onShowAll,
  onToggleStep,
  onAskStep,
  onOpenUpgrade,
}: ProjectsPanelProps & { project: RoleProject; onShowAll: () => void }) {
  const cap = roadmap.capstone!;
  const total = progress.capstone?.total ?? 0;
  const doneCount = progress.capstone?.done ?? 0;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  return (
    <section aria-label={`Capstone: ${project.title}`} className="flex flex-col gap-4">
      <Card padding="lg" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption font-strong uppercase tracking-wider text-accent">Your capstone · {LEVEL_LABEL[project.level]}</span>
          <Button className="ml-auto" size="sm" variant="ghost" leftIcon={<ArrowLeft />} onClick={onShowAll}>All projects</Button>
        </div>
        <h2 className="text-title font-strong text-fg">{project.title}</h2>
        {project.brief && <p className="text-body text-fg-muted">{project.brief}</p>}
        <div className="h-2.5 overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Capstone progress">
          <div className="h-full rounded-full bg-success transition-[width] duration-slow" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-caption tabular-nums text-fg-subtle">
          {doneCount} of {total} steps done{project.deliverable ? ` · you end with ${project.deliverable.charAt(0).toLowerCase()}${project.deliverable.slice(1)}` : ''}
        </p>
      </Card>
      <ol className="flex flex-col gap-3">
        {cap.milestones.map((m, i) => (
          <MilestoneCard
            key={m.id}
            index={i}
            milestone={m}
            roadmap={roadmap}
            project={project}
            done={done}
            onToggleStep={onToggleStep}
            onAskStep={onAskStep}
            onOpenUpgrade={onOpenUpgrade}
          />
        ))}
      </ol>
    </section>
  );
}

function MilestoneCard({
  index,
  milestone,
  roadmap,
  project,
  done,
  onToggleStep,
  onAskStep,
  onOpenUpgrade,
}: {
  index: number;
  milestone: CapstoneMilestone;
  roadmap: RoleRoadmap;
  project: RoleProject;
  done: Set<string>;
  onToggleStep: ProjectsPanelProps['onToggleStep'];
  onAskStep: ProjectsPanelProps['onAskStep'];
  onOpenUpgrade?: (feature?: string) => void;
}) {
  const stepsDone = milestone.steps.filter((s) => done.has(capstoneStepKey(project.id, s.id))).length;
  return (
    <li className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex items-center gap-3 border-b border-line bg-surface-sunken/60 px-4 py-2.5">
        <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface text-label font-bold text-fg-muted">{index + 1}</span>
        <h3 className="mr-auto text-body-lg font-strong text-fg">{milestone.title}</h3>
        <span className="text-caption tabular-nums text-fg-subtle">{stepsDone}/{milestone.steps.length}</span>
      </div>
      <ul className="divide-y divide-line">
        {milestone.steps.map((s) => (
          <StepRow
            key={s.id}
            step={s}
            milestone={milestone}
            roadmap={roadmap}
            project={project}
            done={done.has(capstoneStepKey(project.id, s.id))}
            onToggle={onToggleStep}
            onAsk={onAskStep}
            onOpenUpgrade={onOpenUpgrade}
          />
        ))}
      </ul>
    </li>
  );
}

function StepRow({
  step,
  milestone,
  roadmap,
  project,
  done,
  onToggle,
  onAsk,
  onOpenUpgrade,
}: {
  step: CapstoneStep;
  milestone: CapstoneMilestone;
  roadmap: RoleRoadmap;
  project: RoleProject;
  done: boolean;
  onToggle: ProjectsPanelProps['onToggleStep'];
  onAsk: ProjectsPanelProps['onAskStep'];
  onOpenUpgrade?: (feature?: string) => void;
}) {
  const { toast } = useToast();
  const [asking, setAsking] = useState(false);
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 px-4 py-3">
      <Checkbox
        className="mt-0.5"
        checked={done}
        aria-label={`${done ? 'Mark as not done' : 'Mark as done'}: ${step.title}`}
        onCheckedChange={async (c) => {
          const res = await onToggle(project.id, step, c === true);
          if (!res.ok) toast({ title: 'Not saved', description: res.error, tone: 'danger' });
        }}
      />
      <div className="min-w-0">
        <div className={cn('text-body-lg', done ? 'text-fg-subtle line-through' : 'font-strong text-fg')}>{step.title}</div>
        {step.detail && <p className="text-body text-fg-muted">{step.detail}</p>}
        {step.done_when && (
          <p className="mt-1 flex items-start gap-1.5 text-caption text-success-fg">
            <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> Done when: {step.done_when}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <LearnButtons name={step.title} search={step.search} prompt={stepPrompt({ role: roadmap.role, project: project.title, milestone: milestone.title, step })} />
          <Button size="sm" variant="subtle" leftIcon={<MessageCircleQuestion />} aria-expanded={asking} onClick={() => setAsking((a) => !a)}>
            Ask Nomadic AI
          </Button>
        </div>
        {asking && <AskPanel stepId={step.id} onAsk={onAsk} onOpenUpgrade={onOpenUpgrade} />}
      </div>
    </li>
  );
}

function AskPanel({ stepId, onAsk, onOpenUpgrade }: { stepId: string; onAsk: ProjectsPanelProps['onAskStep']; onOpenUpgrade?: (feature?: string) => void }) {
  const [question, setQuestion] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Extract<LearnProjectHelpResult, { success: true }> | null>(null);
  const [error, setError] = useState<{ text: string; limited: boolean } | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (question.trim().length < 3) {
      setError({ text: 'Write your question first.', limited: false });
      return;
    }
    setBusy(true);
    setError(null);
    const res = await onAsk({ stepId, question: question.trim(), code: code.trim() || undefined });
    setBusy(false);
    if (res.success) setAnswer(res);
    else setError({ text: res.error, limited: res.code === 'quota_exceeded' || res.code === 'plan_required' });
  };
  return (
    <form noValidate onSubmit={submit} className="mt-3 flex flex-col gap-2 rounded-lg border border-line bg-surface-sunken/50 p-3">
      <Field label="Your question about this step">
        <Textarea rows={2} maxLength={1000} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What are you stuck on?" />
      </Field>
      <Field label="Error or work to look at (optional)">
        <Textarea rows={2} maxLength={6000} value={code} onChange={(e) => setCode(e.target.value)} />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" loading={busy} loadingText="Asking…">Ask</Button>
        {error && <span role="alert" className="text-caption text-danger-fg">{error.text}</span>}
        {error?.limited && onOpenUpgrade && <Button size="sm" variant="subtle" onClick={() => onOpenUpgrade('Project help')}>Upgrade</Button>}
      </div>
      {answer && (
        <div className="flex flex-col gap-2 rounded-md bg-surface p-3 text-body text-fg" aria-live="polite">
          <p className="whitespace-pre-wrap">{answer.answer}</p>
          {answer.nextSteps.length > 0 && (
            <ol className="list-decimal pl-5 text-fg-muted">
              {answer.nextSteps.map((s) => <li key={s}>{s}</li>)}
            </ol>
          )}
          {answer.code && <pre className="overflow-x-auto rounded-md bg-surface-sunken p-2 font-mono text-caption">{answer.code}</pre>}
        </div>
      )}
    </form>
  );
}

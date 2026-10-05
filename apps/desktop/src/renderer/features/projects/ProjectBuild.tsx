import React, { useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Circle, Copy, ExternalLink, GitBranch, Lightbulb } from 'lucide-react';
import { Badge, Button, Card, Checkbox, Field, Input, Textarea, cn, useToast } from '@nomadic/ui';
import {
  RESUME_INPUTS,
  completeStage,
  criterionKey,
  finishKit,
  orderedStages,
  projectProgress,
  setCriterionDone,
  setStepDone,
  showNextHint,
  stageMinutes,
  stageProgress,
  startUserProject,
  stepKey,
  type Project,
  type UserProject,
} from '@job-automator/learning';
import { getApi, type LearningEventInput, type LearnRepoCheckRequest, type LearnRepoCheckResult } from '../../types';
import { moduleById, topicById } from '../learn/catalog';
import { formatMinutes } from '../learn/learnModel';
import { projectHours, stageDoneEvent } from './projectsLogic';

interface ProjectBuildProps {
  project: Project;
  mine: UserProject | null;
  /** Catalogue modules the student has finished (prerequisite ticks). */
  doneModules: Set<string>;
  trackId: string | null;
  beginnerOnly: boolean;
  onBack: () => void;
  /** Text of the back button (default "All projects"). */
  backLabel?: string;
  onSave: (p: UserProject) => Promise<{ ok: boolean; error?: string; limited?: boolean }>;
  onRecord: (events: LearningEventInput[]) => Promise<{ ok: boolean; error?: string }>;
  onCheckRepo: (req: LearnRepoCheckRequest) => Promise<LearnRepoCheckResult>;
  onOpenTopic: (topicId: string) => void;
  onOpenUpgrade?: (feature?: string) => void;
}

/** Project page and guided build: stages, steps, hints, acceptance, repo check and the finish kit. */
export function ProjectBuild(props: ProjectBuildProps) {
  const { project, mine, doneModules, trackId, beginnerOnly, onBack, onSave, onRecord, onCheckRepo, onOpenTopic, backLabel = 'All projects' } = props;
  const { toast } = useToast();
  const stages = orderedStages(project);
  const progress = projectProgress(project, mine);
  const [stageId, setStageId] = useState<string>(progress.current_stage_id ?? stages[stages.length - 1].id);
  const [repoUrl, setRepoUrl] = useState(mine?.repo_url ?? '');
  const [repo, setRepo] = useState<LearnRepoCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const stage = stages.find((s) => s.id === stageId) ?? stages[0];
  const sp = useMemo(() => stageProgress(project, mine).find((s) => s.stage_id === stage.id)!, [project, mine, stage.id]);
  const locked = beginnerOnly && project.level !== 'beginner';

  const save = async (next: UserProject) => {
    setSaving(true);
    const res = await onSave(next);
    setSaving(false);
    if (!res.ok) toast({ title: res.limited ? 'Plan limit' : 'Not saved', description: res.error, tone: res.limited ? 'warning' : 'danger' });
    return res;
  };

  const start = async () => {
    const res = await save(startUserProject(project.id, new Date(), stages[0].id));
    if (res.ok) setStageId(stages[0].id);
  };

  const markStage = async () => {
    if (!mine) return;
    const r = completeStage(project, mine, stage.id, new Date());
    if (r.error) {
      toast({ title: r.error, tone: 'warning' });
      return;
    }
    const res = await save(r.project);
    if (res.ok) {
      await onRecord([stageDoneEvent(project, stage.id, trackId, new Date())]);
      const next = r.project.stages_done.length < stages.length ? stages.find((s) => !r.project.stages_done.includes(s.id)) : null;
      if (next) setStageId(next.id);
      toast({ title: r.finished ? 'Project finished. Your finish kit is ready.' : 'Stage done', tone: 'success' });
    }
  };

  const check = async () => {
    setChecking(true);
    const res = await onCheckRepo({ projectId: project.id, stageId: stage.id, repoUrl: repoUrl.trim() });
    setChecking(false);
    setRepo(res);
  };

  if (!mine || mine.status === 'abandoned') {
    return (
      <article className="flex flex-col gap-4" aria-labelledby="project-title">
        <div><Button variant="ghost" size="sm" leftIcon={<ArrowLeft />} onClick={onBack}>{backLabel}</Button></div>
        <header className="flex flex-col gap-1">
          <h2 id="project-title" className="text-title font-strong text-fg">{project.title}</h2>
          <div className="flex flex-wrap gap-2 text-caption text-fg-subtle">
            <Badge size="sm">{project.level}</Badge>
            <span>{projectHours(project)} h · {project.stages.length} stages · {project.stacks.join(', ')}</span>
            {project.ai_drafted && project.status !== 'published' && <Badge size="sm" tone="warning">AI-drafted, under review</Badge>}
          </div>
        </header>
        <Card padding="md" className="flex flex-col gap-3">
          <p className="text-body-lg text-fg">{project.pitch}</p>
          <p className="text-body text-fg-muted"><span className="font-strong text-fg">What you end up with: </span>{project.outcome}</p>
          <div className="text-body text-fg-muted"><span className="font-strong text-fg">Skills: </span>{project.skill_ids.join(', ')}</div>
          {project.prerequisite_modules.length > 0 && (
            <ul className="flex flex-col gap-1">
              {project.prerequisite_modules.map((m) => (
                <li key={m} className="flex items-center gap-2 text-body text-fg-muted">
                  {doneModules.has(m) ? <CheckCircle2 className="size-4 text-success" aria-label="Done" /> : <Circle className="size-4 text-fg-subtle" aria-label="Not done" />}
                  {moduleById(m)?.title ?? m}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <section aria-labelledby="project-stages" className="flex flex-col gap-2">
          <h3 id="project-stages" className="text-heading font-strong text-fg">Stages</h3>
          <ol className="flex flex-col gap-1.5">
            {stages.map((s, i) => (
              <li key={s.id} className="rounded border border-line px-3 py-2 text-body text-fg">
                {i + 1}. {s.title} <span className="text-caption text-fg-subtle">· {formatMinutes(stageMinutes(s))} · {s.goal}</span>
              </li>
            ))}
          </ol>
        </section>
        <div className="flex flex-wrap gap-2">
          {locked ? (
            <>
              <Button onClick={() => props.onOpenUpgrade?.('All projects')}>Upgrade to start</Button>
              <span className="self-center text-caption text-fg-subtle">The free plan includes beginner projects.</span>
            </>
          ) : (
            <Button onClick={start} loading={saving}>Start project</Button>
          )}
        </div>
      </article>
    );
  }

  const done = new Set(mine.stages_done);
  const kit = progress.stages_done === progress.stages_total ? finishKit(project, mine) : null;
  const hintsShown = mine.hints_shown[stage.id] ?? 0;

  return (
    <article className="flex flex-col gap-4" aria-labelledby="project-title">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" leftIcon={<ArrowLeft />} onClick={onBack}>{backLabel}</Button>
        <span className="ml-auto text-caption text-fg-subtle">{progress.percent}% built · {formatMinutes(progress.minutes_left)} left</span>
        {mine.status === 'active' && (
          <Button size="sm" variant="ghost" onClick={() => void save({ ...mine, status: 'abandoned', updated_at: new Date().toISOString() })}>Stop project</Button>
        )}
      </div>
      <h2 id="project-title" className="text-title font-strong text-fg">{project.title}</h2>

      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <nav aria-label="Stages">
          <ol className="flex flex-col gap-1">
            {stages.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  aria-current={s.id === stage.id ? 'step' : undefined}
                  onClick={() => setStageId(s.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                    s.id === stage.id ? 'bg-accent-subtle text-accent-subtle-fg' : 'text-fg hover:bg-surface-active'
                  )}
                >
                  {done.has(s.id) ? <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="Done" /> : <Circle className="size-4 shrink-0 text-fg-subtle" aria-label="Not done" />}
                  <span>{i + 1}. {s.title}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="flex flex-col gap-4">
          <Card padding="md" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="mr-auto text-heading font-strong text-fg">{stage.title}</h3>
              <span className="text-caption text-fg-subtle">{formatMinutes(stageMinutes(stage))}</span>
              {done.has(stage.id) && <Badge size="sm" tone="success">Done</Badge>}
            </div>
            <p className="text-body text-fg"><span className="font-strong">Goal: </span>{stage.goal}</p>
            {stage.topic_ids.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-caption text-fg-subtle">
                Concepts:
                {stage.topic_ids.map((t) => (
                  <Button key={t} size="sm" variant="ghost" onClick={() => onOpenTopic(t)}>{topicById(t)?.title ?? t}</Button>
                ))}
              </div>
            )}
            <ol className="flex flex-col gap-2">
              {stage.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Checkbox
                    checked={mine.steps_done.includes(stepKey(stage.id, i))}
                    onCheckedChange={(c) => void save(setStepDone(mine, stage.id, i, c === true, new Date()))}
                    aria-label={`Step ${i + 1}: ${step.title}`}
                  />
                  <div>
                    <div className="text-body font-strong text-fg">{i + 1}. {step.title} <span className="text-caption font-normal text-fg-subtle">· {step.minutes} min</span></div>
                    <p className="text-body text-fg-muted">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="flex flex-col gap-1">
              {stage.hints.slice(0, hintsShown).map((h, i) => (
                <p key={i} className="flex items-start gap-2 rounded bg-surface-sunken px-2 py-1 text-body text-fg-muted">
                  <Lightbulb className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />Hint {i + 1}: {h}
                </p>
              ))}
              {hintsShown < stage.hints.length && (
                <div><Button size="sm" variant="ghost" onClick={() => void save(showNextHint(mine, stage, new Date()))}>Show hint {hintsShown + 1}</Button></div>
              )}
            </div>
          </Card>

          <Card padding="md" className="flex flex-col gap-2">
            <h4 className="text-body font-strong text-fg">Acceptance checklist</h4>
            {stage.acceptance.map((a) => (
              <Checkbox
                key={a.id}
                checked={mine.criteria_done.includes(criterionKey(stage.id, a.id))}
                onCheckedChange={(c) => void save(setCriterionDone(mine, stage.id, a.id, c === true, new Date()))}
                label={a.text}
              />
            ))}
            <div className="text-caption text-fg-subtle">Commit message idea: <code>{stage.commit_suggestion}</code></div>
          </Card>

          {stage.repo_rules && (
            <Card padding="md" className="flex flex-col gap-2">
              <h4 className="text-body font-strong text-fg">Repository check (optional)</h4>
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Public GitHub repository" className="min-w-[18rem] flex-1">
                  <Input leftIcon={<GitBranch />} value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/you/project" />
                </Field>
                <Button variant="secondary" onClick={check} loading={checking} disabled={repoUrl.trim().length < 10}>Check repo</Button>
              </div>
              {repo && !repo.success && <p role="alert" className="text-body text-danger-fg">{repo.error}</p>}
              {repo?.success && (
                <ul className="flex flex-col gap-1" aria-label="Repository checks">
                  {(repo.checks ?? []).map((c) => (
                    <li key={c.label} className="flex items-center gap-2 text-body text-fg">
                      {c.ok ? <CheckCircle2 className="size-4 text-success" aria-label="Passed" /> : <Circle className="size-4 text-danger" aria-label="Missing" />}
                      {c.label}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card padding="md" className="flex flex-col gap-2">
            <h4 className="text-body font-strong text-fg">Explain it (interview practice)</h4>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-fg-muted">
              {stage.self_check.map((q) => <li key={q}>{q}</li>)}
            </ul>
          </Card>

          {!done.has(stage.id) && (
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={markStage} loading={saving} disabled={!sp.ready}>Mark stage done</Button>
              {!sp.ready && <span className="text-caption text-fg-subtle">Tick every acceptance check first ({sp.criteria_done}/{sp.criteria_total}).</span>}
            </div>
          )}

          {kit && <FinishKit project={project} mine={mine} kit={kit} onSave={save} />}
        </div>
      </div>
    </article>
  );
}

function FinishKit({ project, mine, kit, onSave }: { project: Project; mine: UserProject; kit: ReturnType<typeof finishKit>; onSave: (p: UserProject) => Promise<unknown> }) {
  const { toast } = useToast();
  const [inputs, setInputs] = useState<Record<string, string>>(mine.resume_inputs);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copied', tone: 'success' });
    } catch {
      toast({ title: 'Could not copy', tone: 'danger' });
    }
  };
  return (
    <Card padding="md" className="flex flex-col gap-3 border-success/40">
      <h3 className="text-heading font-strong text-fg">Finish kit</h3>
      <section className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h4 className="mr-auto text-body font-strong text-fg">README</h4>
          <Button size="sm" variant="ghost" leftIcon={<Copy />} onClick={() => void copy(kit.readme)}>Copy</Button>
        </div>
        <Textarea readOnly rows={8} value={kit.readme} aria-label={`README for ${project.title}`} />
      </section>
      <section className="flex flex-col gap-1">
        <h4 className="text-body font-strong text-fg">Deploy</h4>
        <ol className="flex list-decimal flex-col gap-0.5 pl-5 text-body text-fg-muted">{kit.deploy_steps.map((s) => <li key={s}>{s}</li>)}</ol>
      </section>
      <section className="flex flex-col gap-2">
        <h4 className="text-body font-strong text-fg">Resume bullets</h4>
        <p className="text-caption text-fg-subtle">Numbers appear only if you type them here; nothing is made up.</p>
        {RESUME_INPUTS.map((r) => (
          <Field key={r.key} label={r.label}>
            <Input
              value={inputs[r.key] ?? ''}
              maxLength={200}
              onChange={(e) => setInputs((x) => ({ ...x, [r.key]: e.target.value }))}
              onBlur={() => void onSave({ ...mine, resume_inputs: inputs, updated_at: new Date().toISOString() })}
            />
          </Field>
        ))}
        <ul className="flex flex-col gap-1">
          {kit.resume_bullets.map((b) => (
            <li key={b} className="flex items-center gap-2 text-body text-fg">
              <span className="mr-auto">• {b}</span>
              <Button size="sm" variant="ghost" leftIcon={<Copy />} onClick={() => void copy(b)} aria-label={`Copy: ${b}`}>Copy</Button>
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-1">
        <h4 className="text-body font-strong text-fg">Interview questions about this project</h4>
        <ul className="flex list-disc flex-col gap-0.5 pl-5 text-body text-fg-muted">{kit.interview_questions.map((q) => <li key={q}>{q}</li>)}</ul>
      </section>
      {mine.repo_url && (
        <div><Button size="sm" variant="secondary" rightIcon={<ExternalLink />} onClick={() => void getApi().openExternalUrl(mine.repo_url!)}>Open repository</Button></div>
      )}
    </Card>
  );
}

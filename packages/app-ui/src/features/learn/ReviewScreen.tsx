import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Badge, Button, Card, EmptyState, IconButton, Select, Textarea, useToast } from '@nomadic/ui';
import {
  applyRoadmapDiff,
  buildPath,
  daysBetween,
  expandRoadmap,
  fitRoadmap,
  formatDay,
  moduleMinutes,
  totalMinutes,
  customModuleTasks,
  type Roadmap,
  type RoadmapDiffInput,
  type Schedule,
} from '@job-automator/learning';
import type { LearnAdjustProposal, LearnDraft } from '../../types';
import { learnIndex, moduleById, projectById, allProjects } from './catalog';
import { formatMinutes, streamLabel } from './learnModel';

const EMPHASIS_OPTIONS = [
  { value: 'light', label: 'Light: core topics' },
  { value: 'standard', label: 'Standard: core + standard' },
  { value: 'deep', label: 'Deep: everything' },
];

function moduleHours(rm: Roadmap['modules'][number]): number {
  if (rm.custom) return totalMinutes(customModuleTasks(rm));
  return moduleMinutes(learnIndex(), rm.module_id)[rm.emphasis];
}

/** Week numbers each module's work is scheduled in ("Weeks 2–5"). */
function moduleWeeks(schedule: Schedule): Map<string, [number, number]> {
  const tasks = new Map<string, string>();
  const out = new Map<string, [number, number]>();
  for (const d of schedule.days) for (const e of d.tasks) tasks.set(`${e.task_id}|${d.date}`, d.date);
  const moduleOf = (taskId: string) => {
    if (taskId.startsWith('proj/')) return `project.${taskId.split('/')[1]}`;
    if (taskId.startsWith('mock/') && !taskId.startsWith('mock/oa/')) return taskId.slice(5);
    const id = taskId.split('/')[0];
    const t = learnIndex().topics.get(id);
    return t ? t.module_id : id.split('.').slice(0, 2).join('.');
  };
  for (const d of schedule.days) {
    const w = Math.floor(daysBetween(schedule.start_date, d.date) / 7) + 1;
    for (const e of d.tasks) {
      const m = moduleOf(e.task_id);
      const cur = out.get(m);
      out.set(m, cur ? [Math.min(cur[0], w), Math.max(cur[1], w)] : [w, w]);
    }
  }
  return out;
}

interface ReviewScreenProps {
  draft: LearnDraft;
  busy?: boolean;
  /** Projects allowed on this plan (free: beginner only). */
  beginnerOnly: boolean;
  onAccept: (roadmap: Roadmap, schedule: Schedule) => Promise<{ ok: boolean; error?: string }>;
  onRegenerate: (note: string) => void;
  onEditIntake: () => void;
  onDiscard?: () => void;
}

/** Review a generated roadmap: modules, hours and why, what was left out, projects; edit, regenerate or accept. */
export function ReviewScreen({ draft, busy, beginnerOnly, onAccept, onRegenerate, onEditIntake, onDiscard }: ReviewScreenProps) {
  const { toast } = useToast();
  const [roadmap, setRoadmap] = useState(draft.roadmap);
  const [schedule, setSchedule] = useState(draft.schedule);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [accepting, setAccepting] = useState(false);

  const edit = (diff: RoadmapDiffInput) => {
    const res = applyRoadmapDiff(roadmap, diff, learnIndex());
    const fit = fitRoadmap(res.roadmap, learnIndex(), { pace: schedule.pace_factor });
    setRoadmap(fit.roadmap);
    setSchedule(fit.schedule);
    setWarnings(res.warnings);
  };

  const weeks = useMemo(() => moduleWeeks(schedule), [schedule]);
  const preview = useMemo(
    () =>
      buildPath({
        schedule,
        roadmap,
        tasks: new Map(expandRoadmap(roadmap, learnIndex()).map((t) => [t.id, t])),
        index: learnIndex(),
        done: new Set(),
        today: schedule.start_date,
      }),
    [roadmap, schedule]
  );
  const leftOut = schedule.left_out;
  const noTime = leftOut.filter((l) => l.reason === 'no_time');
  const lastDay = [...schedule.days].reverse().find((d) => d.tasks.length);
  const projectChoices = allProjects().filter(
    (p) => p.role_families.includes(roadmap.track_id) && !roadmap.projects.some((x) => x.project_id === p.id) && (!beginnerOnly || p.level === 'beginner')
  );

  const accept = async () => {
    setAccepting(true);
    const res = await onAccept(roadmap, schedule);
    setAccepting(false);
    if (!res.ok) toast({ title: 'Roadmap not saved', description: res.error, tone: 'danger' });
  };

  return (
    <div className="flex flex-col gap-4">
      <Card padding="md" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-title font-strong text-fg">Review your roadmap</h2>
          <Badge tone={roadmap.source === 'ai' ? 'accent' : 'neutral'} icon={roadmap.source === 'ai' ? <Sparkles /> : undefined}>
            {roadmap.source === 'ai' ? 'AI plan from the reviewed catalogue' : 'Standard planner'}
          </Badge>
        </div>
        <p className="text-body text-fg">{roadmap.summary}</p>
        {draft.notice && <p className="text-caption text-fg-subtle">{draft.notice}</p>}
        <div className="flex flex-wrap gap-2 text-caption text-fg-subtle">
          <span>{formatDay(schedule.start_date)} to {formatDay(schedule.end_date)}</span>
          {lastDay && <span>· planned work ends {formatDay(lastDay.date)}</span>}
          <span>· {Object.entries(roadmap.streams).map(([s, p]) => `${streamLabel(s as never)} ${p}%`).join(', ')}</span>
        </div>
        {[...roadmap.warnings, ...warnings].length > 0 && (
          <ul className="flex flex-col gap-1">
            {[...new Set([...roadmap.warnings, ...warnings])].map((w) => (
              <li key={w} className="flex items-start gap-2 text-body text-warning-fg">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {w}
              </li>
            ))}
          </ul>
        )}
        <p className="text-caption text-fg-subtle">AI-drafted lessons and projects are under review; links come only from checked resources and LeetCode.</p>
      </Card>

      <section aria-labelledby="review-weeks" className="flex flex-col gap-2">
        <h3 id="review-weeks" className="text-heading font-strong text-fg">Week by week ({preview.weeks.filter((w) => w.days.length).length} weeks)</h3>
        <ol className="flex flex-col gap-1.5">
          {preview.weeks.filter((w) => w.days.length).map((w) => (
            <li key={w.number}>
              <details className="group rounded-lg border border-line bg-surface">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                  <span className="w-16 shrink-0 text-caption font-strong uppercase tracking-wide text-accent">Week {w.number}</span>
                  <span className="min-w-0 flex-1 truncate text-body font-strong text-fg">{w.title}</span>
                  <span className="shrink-0 text-caption text-fg-subtle">{w.days.length} days · {formatMinutes(w.minutes)}</span>
                  <ChevronDown className="size-4 shrink-0 text-fg-subtle transition-transform duration-fast group-open:rotate-180" aria-hidden="true" />
                </summary>
                <ol className="flex flex-col gap-1 border-t border-line px-3 py-2">
                  {w.days.map((d) => (
                    <li key={d.date} className="flex gap-3 text-body">
                      <span className="w-16 shrink-0 text-fg-subtle">Day {d.day}</span>
                      <span className="min-w-0 flex-1 text-fg">
                        {d.title}
                        {d.subtitle && <span className="text-fg-subtle"> · {d.subtitle}</span>}
                      </span>
                      <span className="shrink-0 text-caption text-fg-subtle">{formatDay(d.date)}</span>
                    </li>
                  ))}
                </ol>
              </details>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="review-modules" className="flex flex-col gap-2">
        <h3 id="review-modules" className="text-heading font-strong text-fg">Modules ({roadmap.modules.length})</h3>
        <ol className="flex flex-col gap-2">
          {roadmap.modules.map((rm, i) => {
            const mod = moduleById(rm.module_id);
            const title = rm.custom ? rm.custom.title : mod?.title ?? rm.module_id;
            const w = weeks.get(rm.module_id);
            return (
              <li key={rm.module_id}>
                <Card padding="sm" className="grid grid-cols-1 items-center gap-3 text-left md:grid-cols-[minmax(0,1fr)_14rem_auto]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-body font-strong text-fg">{title}</span>
                      <Badge size="sm">{streamLabel(rm.custom ? rm.custom.stream : mod?.stream ?? 'dev')}</Badge>
                      {rm.custom && <Badge size="sm" tone="warning">AI-generated, not reviewed</Badge>}
                      {rm.added_for && <Badge size="sm" tone="neutral">Needed for {rm.added_for}</Badge>}
                    </div>
                    <div className="text-caption text-fg-subtle">
                      {formatMinutes(moduleHours(rm))}{w ? ` · week ${w[0]}${w[1] !== w[0] ? `–${w[1]}` : ''}` : ' · not scheduled (no time)'}
                      {rm.why ? ` · ${rm.why}` : ''}
                    </div>
                  </div>
                  {rm.custom ? <span /> : (
                    <Select
                      size="sm"
                      value={rm.emphasis}
                      onValueChange={(v) => edit({ emphasis: [{ module_id: rm.module_id, emphasis: v as never }] })}
                      options={EMPHASIS_OPTIONS}
                      aria-label={`Depth for ${title}`}
                    />
                  )}
                  <div className="flex gap-1">
                    <IconButton size="sm" label={`Move ${title} up`} icon={<ArrowUp />} disabled={i === 0}
                      onClick={() => edit({ order: roadmap.modules.map((m) => m.module_id).map((id, j, arr) => (j === i - 1 ? arr[i] : j === i ? arr[i - 1] : id)) })} />
                    <IconButton size="sm" label={`Move ${title} down`} icon={<ArrowDown />} disabled={i === roadmap.modules.length - 1}
                      onClick={() => edit({ order: roadmap.modules.map((m) => m.module_id).map((id, j, arr) => (j === i + 1 ? arr[i] : j === i ? arr[i + 1] : id)) })} />
                    <IconButton size="sm" variant="ghost" label={`Remove ${title}`} icon={<Trash2 />} disabled={roadmap.modules.length <= 1}
                      onClick={() => edit({ remove: [rm.module_id] })} />
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="review-projects" className="flex flex-col gap-2">
        <h3 id="review-projects" className="text-heading font-strong text-fg">Projects</h3>
        {roadmap.projects.length === 0 ? (
          <p className="text-body text-fg-muted">No project in this roadmap yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {roadmap.projects.map((p) => {
              const project = projectById(p.project_id);
              return (
                <li key={p.project_id}>
                  <Card padding="sm" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-left">
                    <div className="min-w-0">
                      <div className="text-body font-strong text-fg">{project?.title ?? p.project_id}</div>
                      <div className="text-caption text-fg-subtle">
                        {project ? `${project.level} · ${project.stacks.join(', ')}` : ''}
                        {p.after_module ? ` · after ${moduleById(p.after_module)?.title ?? p.after_module}` : ' · at the end'}
                      </div>
                    </div>
                    <IconButton size="sm" variant="ghost" label={`Remove ${project?.title ?? p.project_id}`} icon={<Trash2 />} onClick={() => edit({ project_remove: [p.project_id] })} />
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
        {projectChoices.length > 0 && roadmap.projects.length < 3 && (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              size="sm"
              className="w-80"
              placeholder="Add a project"
              options={projectChoices.map((p) => ({ value: p.id, label: `${p.title} (${p.level})` }))}
              onValueChange={(v) => edit({ project_add: [v] })}
              aria-label="Add a project"
            />
            <Plus className="size-4 text-fg-subtle" aria-hidden="true" />
          </div>
        )}
      </section>

      <section aria-labelledby="review-left-out" className="flex flex-col gap-2">
        <h3 id="review-left-out" className="text-heading font-strong text-fg">Left out because of time</h3>
        {leftOut.length === 0 ? (
          <p className="text-body text-fg-muted">Everything fits.</p>
        ) : (
          <Card variant="sunken" padding="sm" className="flex flex-col gap-1 text-body text-fg-muted">
            <span>{leftOut.filter((l) => l.reason === 'optional').length} optional tasks (stretch problems and extras)</span>
            <span>{leftOut.filter((l) => l.reason === 'emphasis').length} tasks from depth lowered to fit</span>
            <span>{noTime.length} tasks that do not fit at all ({formatMinutes(noTime.reduce((n, l) => n + l.minutes, 0))})</span>
            <span className="text-caption">Add time, pick a later end date or remove modules to fit more.</span>
          </Card>
        )}
      </section>

      <Card padding="md" className="flex flex-col gap-3">
        <label htmlFor="review-note" className="text-body font-strong text-fg">Regenerate with a note</label>
        <Textarea id="review-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder='For example: "more DP, less aptitude"' />
        <div className="flex flex-wrap gap-2">
          <Button onClick={accept} loading={accepting} disabled={busy}>Accept roadmap</Button>
          <Button variant="secondary" onClick={() => onRegenerate(note)} disabled={busy || accepting}>Regenerate</Button>
          <Button variant="ghost" onClick={onEditIntake} disabled={busy || accepting}>Change plan details</Button>
          {onDiscard && <Button variant="ghost" onClick={onDiscard} disabled={busy || accepting}>Cancel</Button>}
        </div>
      </Card>
    </div>
  );
}

interface AdjustPanelProps {
  onPropose: (instruction: string) => Promise<{ proposal?: LearnAdjustProposal; error?: string }>;
  onAccept: (p: LearnAdjustProposal) => Promise<{ ok: boolean; error?: string }>;
  current: Roadmap;
}

/** "Adjust": free text → the AI's change as a before/after → accept or discard. */
export function AdjustPanel({ onPropose, onAccept, current }: AdjustPanelProps) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<LearnAdjustProposal | null>(null);

  const propose = async () => {
    setBusy(true);
    setError(null);
    const res = await onPropose(text.trim());
    setBusy(false);
    if (res.proposal) setProposal(res.proposal);
    else setError(res.error ?? 'The change could not be prepared.');
  };
  const before = new Map(current.modules.map((m) => [m.module_id, m.emphasis]));
  const after = proposal ? new Map(proposal.roadmap.modules.map((m) => [m.module_id, m.emphasis])) : null;
  const title = (id: string) => moduleById(id)?.title ?? id;

  return (
    <Card padding="md" className="flex flex-col gap-3">
      <h3 className="text-heading font-strong text-fg">Adjust your roadmap</h3>
      <Textarea
        rows={2}
        maxLength={500}
        value={text}
        onChange={(e) => { setText(e.target.value); setProposal(null); }}
        placeholder='For example: "I have exams 10 to 17 Nov", "more DP" or "switch to 15 hours a week"'
        aria-label="What should change"
      />
      <div className="flex gap-2">
        <Button onClick={propose} loading={busy} disabled={text.trim().length < 3}>Preview the change</Button>
      </div>
      {error && <p role="alert" className="text-body text-danger-fg">{error}</p>}
      {proposal && after && (
        <div className="flex flex-col gap-2 rounded border border-line p-3">
          <p className="text-body text-fg">{proposal.summary || 'Proposed change'}</p>
          <ul className="flex list-disc flex-col gap-0.5 pl-5 text-body text-fg-muted">
            {[...after.keys()].filter((id) => !before.has(id)).map((id) => <li key={`a-${id}`}>Add {title(id)}</li>)}
            {[...before.keys()].filter((id) => !after.has(id)).map((id) => <li key={`r-${id}`}>Remove {title(id)}</li>)}
            {[...after].filter(([id, e]) => before.has(id) && before.get(id) !== e).map(([id, e]) => <li key={`e-${id}`}>{title(id)}: {before.get(id)} → {e}</li>)}
            {proposal.roadmap.intake.end_date !== current.intake.end_date && <li>End date {formatDay(current.intake.end_date)} → {formatDay(proposal.roadmap.intake.end_date)}</li>}
            {proposal.roadmap.intake.blackouts.length !== current.intake.blackouts.length && (
              <li>{proposal.roadmap.intake.blackouts.length - current.intake.blackouts.length} days off added</li>
            )}
            {proposal.roadmap.intake.weekday_minutes !== current.intake.weekday_minutes && <li>Weekdays: {formatMinutes(current.intake.weekday_minutes)} → {formatMinutes(proposal.roadmap.intake.weekday_minutes)}</li>}
            {proposal.roadmap.intake.weekend_minutes !== current.intake.weekend_minutes && <li>Weekends: {formatMinutes(current.intake.weekend_minutes)} → {formatMinutes(proposal.roadmap.intake.weekend_minutes)}</li>}
            <li>{proposal.moved} tasks move to new days</li>
          </ul>
          {proposal.warnings.map((w) => <p key={w} className="text-caption text-warning-fg">{w}</p>)}
          {proposal.shortfall && <p className="text-caption text-warning-fg">{proposal.shortfall.task_ids.length} tasks will not fit.</p>}
          <div className="flex gap-2">
            <Button onClick={async () => { const r = await onAccept(proposal); if (r.ok) { setProposal(null); setText(''); } else setError(r.error ?? 'Not saved.'); }}>Accept change</Button>
            <Button variant="ghost" onClick={() => setProposal(null)}>Discard</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export function GeneratingState({ onCancel }: { onCancel: () => void }) {
  return (
    <EmptyState
      bordered
      icon={<Sparkles />}
      title="Building your roadmap"
      description="Choosing modules from the reviewed catalogue and fitting them into your days. This takes about 10 seconds."
      actions={<Button variant="ghost" onClick={onCancel}>Cancel</Button>}
    />
  );
}

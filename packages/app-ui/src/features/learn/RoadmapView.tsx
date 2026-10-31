import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, FolderKanban, Pencil, Plus, RefreshCw, Undo2, X } from 'lucide-react';
import { Button, Card, Checkbox, Input, cn, useToast } from '@nomadic/ui';
import {
  addTopic,
  setModuleRemoved,
  setTopicRemoved,
  topicKey,
  type RoleModule,
  type RoleProgress,
  type RoleRoadmap,
  type RoleSubject,
  type RoleTopic,
  type TopicRef,
} from '@job-automator/learning';
import { LearnButtons } from './LearnButtons';
import { topicPrompt } from './learnLinks';
import { ProjectsPanel, type ProjectsPanelProps } from './ProjectsPanel';

type Result = Promise<{ ok: boolean; error?: string }>;

export interface RoadmapViewProps extends Omit<ProjectsPanelProps, 'roadmap' | 'progress' | 'done'> {
  roadmap: RoleRoadmap;
  progress: RoleProgress;
  done: Set<string>;
  notice?: string | null;
  /** Open on the Projects tab (from the Projects page or Home). */
  startOnProjects?: boolean;
  onToggleTopic: (ref: { moduleId: string; topicId: string; title: string }, done: boolean) => Result;
  onSave: (next: RoleRoadmap) => Result;
  onChangeRole: () => void;
  onDismissNotice?: () => void;
}

const PROJECTS = 'projects';

/** Learn: the roadmap for one role. Subjects as tabs, modules that open into topics, a Projects tab at the end. */
export function RoadmapView(props: RoadmapViewProps) {
  const { roadmap, progress, done } = props;
  const { toast } = useToast();
  const [tab, setTab] = useState<string>(() => (props.startOnProjects ? PROJECTS : progress.next?.subject.id ?? roadmap.subjects[0].id));
  const [editing, setEditing] = useState(false);
  const subject = roadmap.subjects.find((s) => s.id === tab) ?? null;

  const save = async (next: RoleRoadmap, ok?: string) => {
    const res = await props.onSave(next);
    if (!res.ok) toast({ title: 'Not saved', description: res.error, tone: 'danger' });
    else if (ok) toast({ title: ok, tone: 'success' });
  };

  const modules = roadmap.subjects.reduce((n, s) => n + s.modules.filter((m) => !m.removed).length, 0);
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="mr-auto min-w-0">
          <span className="text-caption font-strong uppercase tracking-wider text-accent">Your roadmap</span>
          <h1 className="text-headline font-bold text-fg">{roadmap.role}</h1>
          <p className="text-caption text-fg-subtle">
            {roadmap.subjects.length} subjects · {modules} modules · {progress.total} topics · {roadmap.projects.length} projects
          </p>
        </div>
        <Button variant={editing ? 'primary' : 'ghost'} leftIcon={editing ? <Check /> : <Pencil />} aria-pressed={editing} onClick={() => setEditing((e) => !e)}>
          {editing ? 'Done editing' : 'Edit roadmap'}
        </Button>
        <Button variant="ghost" leftIcon={<RefreshCw />} onClick={props.onChangeRole}>Change role</Button>
      </header>

      <div className="flex flex-col gap-1.5">
        <div className="h-2.5 overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Roadmap progress">
          <div className="h-full rounded-full bg-success transition-[width] duration-slow" style={{ width: `${progress.percent}%` }} />
        </div>
        <span className="text-caption tabular-nums text-fg-subtle">{progress.done} of {progress.total} topics done · {progress.percent}%</span>
      </div>

      {props.notice && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-sunken px-4 py-3 text-body text-fg-muted">
          <span className="mr-auto min-w-0">{props.notice}</span>
          {props.onDismissNotice && <Button size="sm" variant="ghost" onClick={props.onDismissNotice}>Dismiss</Button>}
        </div>
      )}

      {tab !== PROJECTS && <ContinueCard roadmap={roadmap} next={progress.next} hasDone={progress.done > 0} onDone={props.onToggleTopic} onProjects={() => setTab(PROJECTS)} />}

      <div role="tablist" aria-label="Subjects" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {roadmap.subjects.map((s) => {
          const c = progress.bySubject.get(s.id) ?? { done: 0, total: 0 };
          return (
            <SubjectTab key={s.id} selected={tab === s.id} onSelect={() => setTab(s.id)} title={s.title} detail={`${c.done} of ${c.total} topics`} percent={c.total ? (c.done / c.total) * 100 : 0} />
          );
        })}
        <SubjectTab
          selected={tab === PROJECTS}
          onSelect={() => setTab(PROJECTS)}
          title="Projects"
          icon={<FolderKanban className="size-4" aria-hidden="true" />}
          detail={roadmap.capstone ? `Capstone: ${progress.capstone?.done ?? 0} of ${progress.capstone?.total ?? 0} steps` : `${roadmap.projects.length} picked for this role`}
          percent={progress.capstone?.total ? (progress.capstone.done / progress.capstone.total) * 100 : 0}
        />
      </div>

      {tab === PROJECTS ? (
        <ProjectsPanel {...props} />
      ) : subject ? (
        <SubjectPanel
          key={subject.id}
          roadmap={roadmap}
          subject={subject}
          progress={progress}
          done={done}
          editing={editing}
          onToggleTopic={props.onToggleTopic}
          onRemoveTopic={(m, t, removed) => void save(setTopicRemoved(roadmap, m.id, t.id, removed), removed ? 'Topic removed' : 'Topic back')}
          onRemoveModule={(m, removed) => void save(setModuleRemoved(roadmap, m.id, removed), removed ? 'Module removed' : 'Module back')}
          onAddTopic={async (m, title) => {
            const next = addTopic(roadmap, m.id, title);
            if (!next) {
              toast({ title: 'Not added', description: 'Type a topic that is not already in this module.', tone: 'neutral' });
              return false;
            }
            await save(next, 'Topic added');
            return true;
          }}
        />
      ) : null}
    </div>
  );
}

function SubjectTab({ selected, onSelect, title, detail, percent, icon }: { selected: boolean; onSelect: () => void; title: string; detail: string; percent: number; icon?: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        'flex min-w-[10.5rem] shrink-0 flex-col gap-1.5 rounded-lg border bg-surface px-3.5 py-2.5 text-left transition-colors duration-fast',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
        selected ? 'border-accent ring-1 ring-inset ring-accent' : 'border-line hover:border-line-strong'
      )}
    >
      <span className={cn('flex items-center gap-1.5 text-body font-strong', selected ? 'text-accent-subtle-fg' : 'text-fg')}>{icon}{title}</span>
      <span className="text-caption tabular-nums text-fg-subtle">{detail}</span>
      <span className="h-1 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
        <span className="block h-full rounded-full bg-success" style={{ width: `${percent}%` }} />
      </span>
    </button>
  );
}

function ContinueCard({
  roadmap,
  next,
  hasDone,
  onDone,
  onProjects,
}: {
  roadmap: RoleRoadmap;
  next: TopicRef | null;
  hasDone: boolean;
  onDone: RoadmapViewProps['onToggleTopic'];
  onProjects: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  if (!next) {
    return (
      <Card padding="lg" className="flex flex-wrap items-center gap-3 border-success/40">
        <div className="mr-auto">
          <span className="text-caption font-strong uppercase tracking-wider text-success-fg">All topics done</span>
          <h2 className="text-title font-strong text-fg">You have covered the whole roadmap</h2>
          <p className="text-body text-fg-muted">Show what you learned with a capstone project.</p>
        </div>
        <Button variant="primary" onClick={onProjects}>See the projects</Button>
      </Card>
    );
  }
  const { subject, module, topic } = next;
  return (
    <Card padding="lg" className="grid gap-4 border-accent/40 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <span className="text-caption font-strong uppercase tracking-wider text-accent">{hasDone ? 'Continue' : 'Start here'}</span>
        <h2 className="text-title font-strong text-fg">{topic.title}</h2>
        <p className="text-caption text-fg-subtle">{subject.title} · {module.title}</p>
        {topic.covers && <p className="mt-1.5 text-body text-fg-muted">{topic.covers}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <LearnButtons name={topic.title} search={topic.search} prompt={topicPrompt({ role: roadmap.role, level: roadmap.level, subject: subject.title, module: module.title, topic })} size="md" />
        <Button
          size="md"
          leftIcon={<Check />}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            const res = await onDone({ moduleId: module.id, topicId: topic.id, title: topic.title }, true);
            setBusy(false);
            if (!res.ok) toast({ title: 'Not saved', description: res.error, tone: 'danger' });
          }}
        >
          Mark done
        </Button>
      </div>
    </Card>
  );
}

function SubjectPanel({
  roadmap,
  subject,
  progress,
  done,
  editing,
  onToggleTopic,
  onRemoveTopic,
  onRemoveModule,
  onAddTopic,
}: {
  roadmap: RoleRoadmap;
  subject: RoleSubject;
  progress: RoleProgress;
  done: Set<string>;
  editing: boolean;
  onToggleTopic: RoadmapViewProps['onToggleTopic'];
  onRemoveTopic: (m: RoleModule, t: RoleTopic, removed: boolean) => void;
  onRemoveModule: (m: RoleModule, removed: boolean) => void;
  onAddTopic: (m: RoleModule, title: string) => Promise<boolean>;
}) {
  const firstOpen = useMemo(() => {
    const m = subject.modules.find((x) => {
      if (x.removed) return false;
      const c = progress.byModule.get(x.id);
      return c && c.done < c.total;
    });
    return m?.id ?? subject.modules[0]?.id;
  }, [subject]); // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = useState<Set<string>>(() => new Set(firstOpen ? [firstOpen] : []));
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const shown = subject.modules.filter((m) => editing || !m.removed);
  return (
    <section aria-label={subject.title} className="flex flex-col gap-3">
      {subject.why && <p className="text-body text-fg-muted">{subject.why}</p>}
      <ol className="flex flex-col gap-2.5">
        {shown.map((m, i) => {
          const c = progress.byModule.get(m.id) ?? { done: 0, total: 0 };
          const complete = c.total > 0 && c.done === c.total;
          const isOpen = open.has(m.id);
          const panelId = `module-${m.id}`;
          return (
            <li key={m.id} className={cn('overflow-hidden rounded-lg border bg-surface', m.removed ? 'border-dashed border-line opacity-70' : 'border-line')}>
              <div className="flex items-center gap-2 pr-2">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => toggle(m.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-lg text-body font-bold',
                      complete ? 'bg-success-subtle text-success-fg' : 'bg-surface-sunken text-fg-muted'
                    )}
                  >
                    {complete ? <Check className="size-4" strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-lg font-strong text-fg">{m.title}</span>
                    {m.summary && <span className="block truncate text-caption text-fg-subtle">{m.summary}</span>}
                  </span>
                  <span className="shrink-0 text-caption tabular-nums text-fg-subtle">{m.removed ? 'Removed' : `${c.done}/${c.total}`}</span>
                  <ChevronDown className={cn('size-4 shrink-0 text-fg-subtle transition-transform duration-fast', isOpen && 'rotate-180')} aria-hidden="true" />
                </button>
                {editing && (
                  <Button size="sm" variant="ghost" leftIcon={m.removed ? <Undo2 /> : <X />} onClick={() => onRemoveModule(m, !m.removed)} aria-label={`${m.removed ? 'Bring back' : 'Remove'} the module ${m.title}`}>
                    {m.removed ? 'Bring back' : 'Remove'}
                  </Button>
                )}
              </div>
              {isOpen && (
                <ul id={panelId} className="divide-y divide-line border-t border-line">
                  {m.topics.filter((t) => editing || !t.removed).map((t) => (
                    <TopicRow
                      key={t.id}
                      roadmap={roadmap}
                      subject={subject}
                      module={m}
                      topic={t}
                      done={done.has(topicKey(m.id, t.id))}
                      editing={editing}
                      onToggle={onToggleTopic}
                      onRemove={(removed) => onRemoveTopic(m, t, removed)}
                    />
                  ))}
                  {editing && !m.removed && <AddTopic onAdd={(title) => onAddTopic(m, title)} moduleTitle={m.title} />}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function TopicRow({
  roadmap,
  subject,
  module,
  topic,
  done,
  editing,
  onToggle,
  onRemove,
}: {
  roadmap: RoleRoadmap;
  subject: RoleSubject;
  module: RoleModule;
  topic: RoleTopic;
  done: boolean;
  editing: boolean;
  onToggle: RoadmapViewProps['onToggleTopic'];
  onRemove: (removed: boolean) => void;
}) {
  const { toast } = useToast();
  return (
    <li className={cn('grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 px-4 py-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center', topic.removed && 'opacity-60')}>
      <Checkbox
        className="mt-0.5 md:mt-0"
        checked={done}
        disabled={topic.removed}
        aria-label={`${done ? 'Mark as not done' : 'Mark as done'}: ${topic.title}`}
        onCheckedChange={async (c) => {
          const res = await onToggle({ moduleId: module.id, topicId: topic.id, title: topic.title }, c === true);
          if (!res.ok) toast({ title: 'Not saved', description: res.error, tone: 'danger' });
        }}
      />
      <div className="min-w-0">
        <div className={cn('text-body-lg', done ? 'text-fg-subtle line-through' : 'font-strong text-fg')}>
          {topic.title}
          {topic.custom && <span className="ml-2 text-caption font-regular text-fg-subtle">added by you</span>}
        </div>
        {topic.covers && <div className="text-caption text-fg-subtle">{topic.covers}</div>}
      </div>
      <div className="col-start-2 md:col-start-auto">
        {editing ? (
          <Button size="sm" variant="ghost" leftIcon={topic.removed ? <Undo2 /> : <X />} onClick={() => onRemove(!topic.removed)} aria-label={`${topic.removed ? 'Bring back' : 'Remove'} ${topic.title}`}>
            {topic.removed ? 'Bring back' : 'Remove'}
          </Button>
        ) : (
          <LearnButtons name={topic.title} search={topic.search} prompt={topicPrompt({ role: roadmap.role, level: roadmap.level, subject: subject.title, module: module.title, topic })} />
        )}
      </div>
    </li>
  );
}

function AddTopic({ onAdd, moduleTitle }: { onAdd: (title: string) => Promise<boolean>; moduleTitle: string }) {
  const [title, setTitle] = useState('');
  return (
    <li className="px-4 py-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await onAdd(title)) setTitle('');
        }}
      >
        <Input size="sm" className="min-w-[14rem] flex-1" value={title} maxLength={120} placeholder="Add your own topic" aria-label={`New topic in ${moduleTitle}`} onChange={(e) => setTitle(e.target.value)} />
        <Button size="sm" type="submit" leftIcon={<Plus />} disabled={!title.trim()}>Add topic</Button>
      </form>
    </li>
  );
}

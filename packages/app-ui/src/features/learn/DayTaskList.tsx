import React, { useState } from 'react';
import {
  BookOpen,
  Brain,
  ChevronDown,
  Code2,
  ExternalLink,
  FileText,
  Hammer,
  ListChecks,
  Repeat,
  Timer,
  Wrench,
} from 'lucide-react';
import { Badge, Button, Checkbox, Select, cn } from '@nomadic/ui';
import { partSlice, type PlanTask, type TaskKind } from '@job-automator/learning';
import { moduleById, problemByRef, projectById, topicById } from './catalog';
import { LessonLinks, type LessonLinksProps } from './LessonLinks';
import { InlineText } from './InlineText';
import { KIND_LABEL, formatMinutes, streamLabel, type EntryView } from './learnModel';
import { IS_MOBILE } from '../../platform';

export const KIND_ICON: Record<TaskKind, React.ReactNode> = {
  learn: <BookOpen />,
  read: <FileText />,
  solve: <Code2 />,
  quiz: <Brain />,
  build: <Hammer />,
  practice: <Wrench />,
  revise: <Repeat />,
  mock: <Timer />,
};

interface Group {
  key: string;
  title: string;
  subtitle: string;
  views: EntryView[];
}

/** Entries grouped by what they are about: a topic, a project or a test. */
export function groupEntries(views: EntryView[]): Group[] {
  const groups = new Map<string, Group>();
  for (const v of views) {
    const t = v.task;
    let key: string;
    let title: string;
    let subtitle: string;
    if (t.topic_id) {
      key = `t:${t.topic_id}`;
      title = topicById(t.topic_id)?.title ?? t.title.replace(/: quiz$/, '');
      subtitle = `${moduleById(t.module_id)?.title ?? t.module_id} · ${streamLabel(t.stream)}`;
    } else if (t.project_id) {
      key = `p:${t.project_id}`;
      title = projectById(t.project_id)?.title ?? 'Project';
      subtitle = 'Project build';
    } else {
      key = `s:${t.id}`;
      title = t.kind === 'revise' ? 'Weekly revision' : t.kind === 'mock' ? t.title : t.title;
      subtitle = t.kind === 'mock' ? 'Timed test' : t.kind === 'revise' ? 'Look back over the week' : streamLabel(t.stream);
    }
    const g = groups.get(key) ?? { key, title, subtitle, views: [] };
    g.views.push(v);
    groups.set(key, g);
  }
  return [...groups.values()];
}

/** What the task's row says under its title. */
function taskHint(t: PlanTask): string | null {
  switch (t.kind) {
    case 'learn':
    case 'read':
      return 'Study the points below until you could explain each one without notes.';
    case 'solve':
      return 'Try it yourself for 20 minutes before looking at hints. Write the complexity down.';
    case 'quiz':
      return 'Short check on this topic. 80% to pass; misses come back as reviews.';
    case 'mock':
      return t.id.startsWith('mock/oa/')
        ? `A full online-assessment style test: open Practice${IS_MOBILE ? ' in the desktop app' : ''}, start mock mode with a 90-minute timer, then tick it here.`
        : `Timed check: solve 3 problems from this module in 45 minutes in Practice mock mode${IS_MOBILE ? ' (desktop app)' : ''}, then tick it here.`;
    case 'revise':
      return 'Re-solve two problems you found hard this week and re-read the "What to learn" lists of its topics.';
    case 'build':
      return t.project_id ? 'Follow the guided steps of this stage in the project.' : null;
    default:
      return null;
  }
}

interface Props {
  views: EntryView[];
  /** Today or a past/future date: changes the button wording only. */
  readOnly?: boolean;
  onToggle: (v: EntryView, done: boolean) => void;
  onOpen: (v: EntryView) => void;
  /** Dates an entry may move to (Day view). */
  moveTargets?: Array<{ value: string; label: string }>;
  onMove?: (v: EntryView, toDate: string) => void;
  /** The student's intake, for the YouTube and ChatGPT links on lessons. */
  intake?: LessonLinksProps['intake'];
}

/** A day's tasks, grouped by topic, each learn task with its exact "what to learn" list. */
export function DayTaskList({ views, readOnly, onToggle, onOpen, moveTargets, onMove, intake }: Props) {
  const groups = groupEntries(views);
  return (
    <ol className="flex flex-col gap-3">
      {groups.map((g) => {
        const done = g.views.filter((v) => v.done).length;
        return (
          <li key={g.key} className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="flex items-center gap-3 border-b border-line bg-surface-sunken/60 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <h4 className="truncate text-body-lg font-strong text-fg">{g.title}</h4>
                <p className="truncate text-caption text-fg-subtle">{g.subtitle}</p>
              </div>
              <span className={cn('text-caption font-strong', done === g.views.length ? 'text-success-fg' : 'text-fg-subtle')}>
                {done}/{g.views.length} done
              </span>
            </div>
            <ul className="divide-y divide-line">
              {g.views.map((v) => (
                <TaskRow key={v.key} view={v} readOnly={readOnly} onToggle={onToggle} onOpen={onOpen} moveTargets={moveTargets} onMove={onMove} intake={intake} />
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

function TaskRow({ view: v, readOnly, onToggle, onOpen, moveTargets, onMove, intake }: { view: EntryView } & Omit<Props, 'views'>) {
  const t = v.task;
  const topic = t.topic_id ? topicById(t.topic_id) : undefined;
  const isLearn = (t.kind === 'learn' || t.kind === 'read') && !!topic;
  const items = isLearn && topic ? partSlice(topic.learn_items.length ? topic.learn_items : topic.key_points, v.entry.part, v.entry.parts) : [];
  const [open, setOpen] = useState(isLearn && !v.done);
  const problem = t.problem_ref ? problemByRef(t.problem_ref) : undefined;
  const hint = taskHint(t);
  const action =
    t.kind === 'solve' && problem
      ? { label: 'Solve', icon: <ExternalLink /> }
      : t.project_id
        ? { label: 'Open project', icon: undefined }
        : t.kind === 'quiz'
          ? { label: 'Take quiz', icon: undefined }
          : t.topic_id && topic
            ? { label: isLearn ? 'Open lesson' : 'Open topic', icon: undefined }
            : null;
  const title =
    t.kind === 'learn' || t.kind === 'read'
      ? `${KIND_LABEL[t.kind]}: ${topic?.title ?? t.title}`
      : t.kind === 'quiz'
        ? 'Topic quiz'
        : t.title;

  return (
    <li className={cn('flex flex-col gap-2 px-4 py-3', v.done && 'bg-success-subtle/30')}>
      <div className="flex items-start gap-3">
        <Checkbox
          className="mt-0.5"
          checked={v.done}
          onCheckedChange={(c) => onToggle(v, c === true)}
          aria-label={`${v.done ? 'Untick' : 'Tick'} ${t.title}`}
        />
        <span
          aria-hidden="true"
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4',
            v.done ? 'bg-success-subtle text-success-fg' : 'bg-accent-subtle text-accent-subtle-fg'
          )}
        >
          {KIND_ICON[t.kind]}
        </span>
        <div className="min-w-0 flex-1">
          <div className={cn('text-body-lg', v.done ? 'text-fg-subtle line-through' : 'font-strong text-fg')}>
            {title}
            {v.entry.parts > 1 && <span className="font-regular text-fg-subtle"> · part {v.entry.part} of {v.entry.parts}</span>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-subtle">
            <span>{formatMinutes(v.entry.minutes)}</span>
            {problem && (
              <Badge size="sm" tone={problem.difficulty === 'easy' ? 'success' : problem.difficulty === 'medium' ? 'warning' : 'danger'}>
                {problem.difficulty[0].toUpperCase() + problem.difficulty.slice(1)}
              </Badge>
            )}
            {t.note && <Badge size="sm">{t.note}</Badge>}
            {t.optional && <span>optional</span>}
          </div>
          {hint && !v.done && <p className="mt-1 text-body text-fg-muted">{hint}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isLearn && items.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              aria-expanded={open}
              aria-label={open ? 'Hide what to learn' : 'Show what to learn'}
              onClick={() => setOpen((o) => !o)}
              rightIcon={<ChevronDown className={cn('transition-transform duration-fast', open && 'rotate-180')} />}
            >
              {open ? 'Hide' : 'What to learn'}
            </Button>
          )}
          {action && (
            <Button size="sm" variant={v.done ? 'ghost' : 'secondary'} rightIcon={action.icon} onClick={() => onOpen(v)}>
              {readOnly && action.label === 'Solve' ? 'Open' : action.label}
            </Button>
          )}
        </div>
      </div>
      {isLearn && open && items.length > 0 && (
        <div className="ml-[3.75rem] rounded-lg border border-line bg-canvas/60 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-caption font-strong uppercase tracking-wide text-accent">
            <ListChecks className="size-3.5" aria-hidden="true" />
            What to learn{v.entry.parts > 1 ? ` in this part` : ''}
          </div>
          <ol className="flex flex-col gap-1.5">
            {items.map((item, i) => (
              <li key={item} className="flex gap-2 text-body text-fg">
                <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-caption font-strong text-accent-subtle-fg">
                  {i + 1}
                </span>
                <LearnItem text={item} />
              </li>
            ))}
          </ol>
          {topic && (
            <div className="mt-3 border-t border-line pt-3">
              <LessonLinks topic={topic} intake={intake} />
            </div>
          )}
        </div>
      )}
      {moveTargets && onMove && !v.done && moveTargets.length > 0 && (
        <div className="ml-[3.75rem] w-56">
          <Select size="sm" placeholder="Move to another day…" options={moveTargets} onValueChange={(to) => onMove(v, to)} aria-label={`Move ${t.title} to another day`} />
        </div>
      )}
    </li>
  );
}

/** "Name: what to know" with the name in bold (when the name is short enough to be one). */
export function LearnItem({ text }: { text: string }) {
  const m = /^([^:]{2,60}):\s+(.+)$/.exec(text);
  if (!m) return <span><InlineText text={text} /></span>;
  return (
    <span>
      <span className="font-strong">{m[1]}:</span> <InlineText text={m[2]} />
    </span>
  );
}


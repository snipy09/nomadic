import React, { useDeferredValue, useMemo, useState } from 'react';
import { BarChart3, BrainCircuit, Cloud, FolderKanban, Layers, Monitor, Search, Server, Smartphone, Sparkles, Terminal } from 'lucide-react';
import { Badge, Button, EmptyState, FilterBar, Input, PageHeader, Select, cn } from '@nomadic/ui';
import { projectProgress, type RoleFamilyId, type StackKind, type UserProject } from '@job-automator/learning';
import { allProjects, resolveProject } from '../learn/catalog';
import { ROLES } from '../learn/content';
import {
  DEFAULT_FILTERS,
  HOURS_OPTIONS,
  KIND_LABEL,
  cardHours,
  filterCards,
  kindCounts,
  libraryCards,
  sortCards,
  type LibraryCard,
  type ProjectFilters,
} from './projectsLogic';

export const KIND_ICON: Record<StackKind, React.ReactNode> = {
  frontend: <Monitor />,
  backend: <Server />,
  fullstack: <Layers />,
  mobile: <Smartphone />,
  cli: <Terminal />,
  data: <BarChart3 />,
  ml: <BrainCircuit />,
  devops: <Cloud />,
};

const LEVEL_TONE = { beginner: 'success', intermediate: 'accent', advanced: 'warning' } as const;
const PAGE = 24;

interface ProjectLibraryProps {
  mine: UserProject[];
  role: RoleFamilyId | null;
  beginnerOnly: boolean;
  onOpen: (projectId: string) => void;
}

/** The Project Library: thousands of guided projects with search and filters; my projects first. */
export function ProjectLibrary({ mine, role, beginnerOnly, onOpen }: ProjectLibraryProps) {
  const [filters, setFilters] = useState<ProjectFilters>({ ...DEFAULT_FILTERS, role: role ?? 'all', level: beginnerOnly ? 'beginner' : 'all' });
  const [shown, setShown] = useState(PAGE);
  const query = useDeferredValue(filters.query);
  const all = useMemo(() => libraryCards(allProjects()), []);
  const matches = useMemo(() => sortCards(filterCards(all, { ...filters, query }), role), [all, filters, query, role]);
  const counts = useMemo(() => kindCounts(filterCards(all, { ...filters, query, kind: 'all' })), [all, filters, query]);
  const set = <K extends keyof ProjectFilters>(k: K, v: ProjectFilters[K]) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setShown(PAGE);
  };
  const started = mine.filter((p) => p.status !== 'abandoned');
  const kinds = (Object.keys(KIND_LABEL) as StackKind[]).filter((k) => all.some((c) => c.kind === k));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Projects"
        description={`${all.length.toLocaleString('en-IN')} guided projects, each with stages, starter code, hints, checks and a finish kit for your resume.`}
      />

      {started.length > 0 && (
        <section aria-labelledby="my-projects" className="flex flex-col gap-3">
          <h2 id="my-projects" className="text-heading font-strong text-fg">Continue building</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {started.map((up) => {
              const p = resolveProject(up.project_id);
              if (!p) return null;
              const prog = projectProgress(p, up);
              return (
                <li key={up.project_id}>
                  <button
                    type="button"
                    onClick={() => onOpen(p.id)}
                    className="flex h-full w-full flex-col gap-2 rounded-lg border border-line bg-surface p-4 text-left transition-[box-shadow,border-color] duration-fast hover:border-line-strong hover:shadow-e2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    aria-label={`Continue ${p.title}`}
                  >
                    <span className="text-body-lg font-strong text-fg">{p.title}</span>
                    <span className="text-caption text-fg-subtle">
                      {up.status === 'done' ? 'Finished' : `Stage ${Math.min(prog.stages_done + 1, prog.stages_total)} of ${prog.stages_total}`}
                    </span>
                    <span className="mt-auto h-2 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
                      <span className={cn('block h-full rounded-full', up.status === 'done' ? 'bg-success' : 'bg-accent')} style={{ width: `${prog.percent}%` }} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="library" className="flex flex-col gap-4">
        <h2 id="library" className="sr-only">All projects</h2>
        <div className="flex flex-col gap-3">
          <FilterBar aria-label="Filter projects">
            <Input
              wrapperClassName="min-w-[240px] flex-1"
              leftIcon={<Search />}
              placeholder="Search by idea, stack or skill"
              value={filters.query}
              onChange={(e) => set('query', e.target.value)}
              aria-label="Search projects"
            />
            <Select
              value={filters.level}
              onValueChange={(v) => set('level', v as ProjectFilters['level'])}
              aria-label="Level"
              options={[{ value: 'all', label: 'All levels' }, { value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'advanced', label: 'Advanced' }]}
            />
            <Select
              value={filters.role}
              onValueChange={(v) => set('role', v as ProjectFilters['role'])}
              aria-label="Role"
              options={[{ value: 'all', label: 'All roles' }, ...ROLES.map((r) => ({ value: r.id, label: r.name }))]}
            />
            <Select value={filters.hours} onValueChange={(v) => set('hours', v as ProjectFilters['hours'])} aria-label="Length" options={[...HOURS_OPTIONS]} />
          </FilterBar>
          <div role="group" aria-label="Project type" className="flex flex-wrap gap-1.5">
            {(['all', ...kinds] as const).map((k) => {
              const on = filters.kind === k;
              const n = k === 'all' ? [...counts.values()].reduce((a, b) => a + b, 0) : counts.get(k) ?? 0;
              // Types with nothing under the current filters are noise; keep the selected one so it can be cleared.
              if (k !== 'all' && n === 0 && !on) return null;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set('kind', k)}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-label transition-colors duration-fast [&_svg]:size-3.5',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                    on ? 'bg-accent-subtle font-strong text-accent-subtle-fg' : 'text-fg-muted hover:bg-surface-hover hover:text-fg'
                  )}
                >
                  {k !== 'all' && KIND_ICON[k]}
                  {k === 'all' ? 'All types' : KIND_LABEL[k]}
                  <span className={cn('tabular-nums', on ? 'text-accent-subtle-fg' : 'text-fg-subtle')}>{n.toLocaleString('en-IN')}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-caption text-fg-subtle" role="status" aria-live="polite">
          <span>{matches.length.toLocaleString('en-IN')} {matches.length === 1 ? 'project' : 'projects'}</span>
          {beginnerOnly && <span>· The free plan includes beginner projects, one at a time. Pro unlocks every project.</span>}
        </div>

        {matches.length === 0 ? (
          <EmptyState
            bordered
            size="sm"
            icon={<FolderKanban />}
            title="No projects match"
            description="Try a shorter search or clear a filter."
            actions={<Button variant="secondary" onClick={() => { setFilters({ ...DEFAULT_FILTERS }); setShown(PAGE); }}>Clear filters</Button>}
          />
        ) : (
          <>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {matches.slice(0, shown).map((c) => (
                <li key={c.id}>
                  <ProjectCard card={c} locked={beginnerOnly && c.level !== 'beginner'} progress={mine.find((m) => m.project_id === c.id) ?? null} onOpen={onOpen} />
                </li>
              ))}
            </ul>
            {shown < matches.length && (
              <div className="flex justify-center">
                <Button variant="secondary" onClick={() => setShown((n) => n + PAGE)}>
                  Show more ({(matches.length - shown).toLocaleString('en-IN')} left)
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function ProjectCard({ card: c, locked, progress, onOpen }: { card: LibraryCard; locked: boolean; progress: UserProject | null; onOpen: (id: string) => void }) {
  const kind = c.kind === 'curated' ? 'frontend' : c.kind;
  return (
    <button
      type="button"
      onClick={() => onOpen(c.id)}
      aria-label={`Open ${c.title}`}
      className="group flex h-full w-full flex-col gap-3 rounded-lg border border-line bg-surface p-4 text-left transition-[box-shadow,border-color] duration-fast hover:border-line-strong hover:shadow-e2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-accent-subtle-fg [&_svg]:size-5" aria-hidden="true">
          {KIND_ICON[kind]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-body-lg font-strong text-fg">{c.title}</div>
          <div className="text-caption text-fg-subtle">{KIND_LABEL[kind]} · {cardHours(c)} h · {c.stages} stages</div>
        </div>
      </div>
      <p className="line-clamp-2 text-body text-fg-muted">{c.pitch}</p>
      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        <Badge size="sm" tone={LEVEL_TONE[c.level]}>{c.level[0].toUpperCase() + c.level.slice(1)}</Badge>
        {c.tech.slice(0, 3).map((t) => <Badge key={t} size="sm" tone="neutral">{t}</Badge>)}
        {c.curated && <Badge size="sm" tone="accent" icon={<Sparkles />}>In roadmaps</Badge>}
        {progress && <Badge size="sm" tone={progress.status === 'done' ? 'success' : 'accent'}>{progress.status === 'done' ? 'Done' : 'In progress'}</Badge>}
        {locked && <Badge size="sm">Pro</Badge>}
      </div>
    </button>
  );
}

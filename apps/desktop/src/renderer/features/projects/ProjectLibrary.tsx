import React, { useMemo, useState } from 'react';
import { FolderKanban, Search } from 'lucide-react';
import { Badge, Card, EmptyState, Input, Select } from '@nomadic/ui';
import { projectProgress, type Project, type RoleFamilyId, type UserProject } from '@job-automator/learning';
import { ROLES } from '../learn/content';
import { DEFAULT_FILTERS, HOURS_OPTIONS, filterProjects, projectHours, sortForRole, type ProjectFilters } from './projectsLogic';

interface ProjectLibraryProps {
  projects: Project[];
  mine: UserProject[];
  role: RoleFamilyId | null;
  beginnerOnly: boolean;
  onOpen: (projectId: string) => void;
}

/** Project Library: filters, search and cards; my projects first. */
export function ProjectLibrary({ projects, mine, role, beginnerOnly, onOpen }: ProjectLibraryProps) {
  const [filters, setFilters] = useState<ProjectFilters>({ ...DEFAULT_FILTERS, role: role ?? 'all' });
  const set = <K extends keyof ProjectFilters>(k: K, v: ProjectFilters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const shown = useMemo(() => sortForRole(filterProjects(projects, filters), role), [projects, filters, role]);
  const mineById = new Map(mine.map((p) => [p.project_id, p]));
  const started = projects.filter((p) => mineById.has(p.id) && mineById.get(p.id)!.status !== 'abandoned');

  const card = (p: Project) => {
    const up = mineById.get(p.id);
    const prog = up ? projectProgress(p, up) : null;
    const locked = beginnerOnly && p.level !== 'beginner';
    return (
      <li key={p.id}>
        <Card padding="md" interactive className="flex h-full flex-col gap-2" asChild>
          <button type="button" onClick={() => onOpen(p.id)} className="text-left" aria-label={`Open ${p.title}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-auto text-body font-strong text-fg">{p.title}</span>
              <Badge size="sm" tone={p.level === 'beginner' ? 'success' : p.level === 'intermediate' ? 'accent' : 'warning'}>{p.level}</Badge>
            </div>
            <p className="line-clamp-3 text-caption text-fg-muted">{p.pitch}</p>
            <div className="mt-auto flex flex-wrap gap-1 text-caption text-fg-subtle">
              <span>{projectHours(p)} h · {p.stages.length} stages · {p.stacks.join(', ')}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {prog && <Badge size="sm" tone={up?.status === 'done' ? 'success' : 'accent'}>{up?.status === 'done' ? 'Done' : `${prog.percent}% built`}</Badge>}
              {locked && <Badge size="sm">Pro</Badge>}
              {p.ai_drafted && p.status !== 'published' && <Badge size="sm" tone="warning">Under review</Badge>}
            </div>
          </button>
        </Card>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {started.length > 0 && (
        <section aria-labelledby="my-projects" className="flex flex-col gap-2">
          <h3 id="my-projects" className="text-heading font-strong text-fg">My projects</h3>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{started.map(card)}</ul>
        </section>
      )}
      <section aria-labelledby="library" className="flex flex-col gap-3">
        <h3 id="library" className="text-heading font-strong text-fg">Project Library</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Input leftIcon={<Search />} placeholder="Search projects, stacks, skills" value={filters.query} onChange={(e) => set('query', e.target.value)} aria-label="Search projects" />
          <Select value={filters.role} onValueChange={(v) => set('role', v as ProjectFilters['role'])} options={[{ value: 'all', label: 'All roles' }, ...ROLES.map((r) => ({ value: r.id, label: r.name }))]} />
          <Select
            value={filters.level}
            onValueChange={(v) => set('level', v as ProjectFilters['level'])}
            options={[{ value: 'all', label: 'All levels' }, { value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'advanced', label: 'Advanced' }]}
          />
          <Select value={filters.hours} onValueChange={(v) => set('hours', v as ProjectFilters['hours'])} options={[...HOURS_OPTIONS]} />
        </div>
        {beginnerOnly && <p className="text-caption text-fg-subtle">The free plan includes beginner projects, one at a time. Pro unlocks every project.</p>}
        {shown.length === 0 ? (
          <EmptyState bordered size="sm" icon={<FolderKanban />} title="No projects match" description="Clear a filter to see more projects." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{shown.map(card)}</ul>
        )}
      </section>
    </div>
  );
}

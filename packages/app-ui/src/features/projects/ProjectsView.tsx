import React, { useMemo } from 'react';
import { ArrowRight, FolderKanban } from 'lucide-react';
import { Button, Card, EmptyState, Skeleton } from '@nomadic/ui';
import { doneEntries, roleProgress, type LearningEvent } from '@job-automator/learning';
import { useLearning } from '../learn/useLearning';

interface ProjectsViewProps {
  /** Opens Learn on the roadmap's Projects tab. */
  onOpenRoadmapProjects: () => void;
}

/**
 * The Projects page while curated projects are being prepared: it points to the
 * student's capstone, or to the five projects at the end of their roadmap.
 */
export function ProjectsView({ onOpenRoadmapProjects }: ProjectsViewProps) {
  const data = useLearning();
  const roadmap = data.roleRoadmap;
  const events = data.events as unknown as LearningEvent[];
  const progress = useMemo(() => (roadmap ? roleProgress(roadmap, doneEntries(events)) : null), [roadmap, events]);

  if (data.status === 'loading') {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3" aria-busy="true" aria-label="Loading projects">
        <Skeleton height={140} radius="lg" />
      </div>
    );
  }

  const capstone = roadmap?.capstone ? roadmap.projects.find((p) => p.id === roadmap.capstone!.project_id) ?? null : null;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 pb-16">
      <header>
        <h1 className="text-headline font-bold text-fg">Projects</h1>
        <p className="text-body text-fg-muted">Carefully curated projects for every role are on their way.</p>
      </header>

      {capstone && progress?.capstone && (
        <Card padding="lg" className="flex flex-wrap items-center gap-4">
          <div className="mr-auto min-w-0">
            <span className="text-caption font-strong uppercase tracking-wider text-accent">Your capstone</span>
            <h2 className="text-title font-strong text-fg">{capstone.title}</h2>
            <p className="text-caption tabular-nums text-fg-subtle">{progress.capstone.done} of {progress.capstone.total} steps done</p>
          </div>
          <Button variant="primary" rightIcon={<ArrowRight />} onClick={onOpenRoadmapProjects}>Open my capstone</Button>
        </Card>
      )}

      <EmptyState
        bordered
        icon={<FolderKanban />}
        title="Curated projects are coming"
        description={
          roadmap
            ? `Until then, your ${roadmap.role} roadmap in Learn ends with ${roadmap.projects.length} projects picked for the role. Make one your capstone and Nomadic guides you step by step.`
            : 'Until then, build your roadmap in Learn: it ends with five projects picked for your role, and one becomes a guided capstone.'
        }
        actions={<Button onClick={onOpenRoadmapProjects}>{roadmap ? 'See my roadmap projects' : 'Build my roadmap'}</Button>}
      />
    </div>
  );
}

import React, { useMemo, useState } from 'react';
import { Button, EmptyState, Skeleton } from '@nomadic/ui';
import { learnTierFor, type LearningEvent, type RoleFamilyId } from '@job-automator/learning';
import type { AppUser } from '../../types';
import { learnIndex, resolveProject } from '../learn/catalog';
import { isRoleId } from '../learn/content';
import { progressOf } from '../learn/learnModel';
import { TopicScreen } from '../learn/TopicScreen';
import { practiceLeft } from '../learn/quizLogic';
import { useLearning } from '../learn/useLearning';
import { ProjectBuild } from './ProjectBuild';
import { ProjectLibrary } from './ProjectLibrary';

interface ProjectsViewProps {
  currentUser?: Pick<AppUser, 'tier'> | null;
  /** Role family from the profile, used to sort the library when there is no roadmap. */
  suggestedRole?: string;
  onOpenUpgrade?: (feature?: string) => void;
}

type Screen = { name: 'library' } | { name: 'project'; id: string } | { name: 'topic'; topicId: string; projectId: string };

/** The Projects page: the library, then a fully guided build for the chosen project. */
export function ProjectsView({ currentUser, suggestedRole, onOpenUpgrade }: ProjectsViewProps) {
  const data = useLearning();
  const [screen, setScreen] = useState<Screen>({ name: 'library' });
  const tier = learnTierFor(currentUser?.tier);
  const isFree = tier === 'free';
  const index = learnIndex();
  const events = data.events as unknown as LearningEvent[];
  const role: RoleFamilyId | null = data.roadmap?.track_id ?? (suggestedRole && isRoleId(suggestedRole) ? suggestedRole : null);
  const progress = useMemo(() => (data.roadmap ? progressOf(data.roadmap, data.schedule, events, index) : null), [data.roadmap, data.schedule, events, index]);
  const doneModules = useMemo(() => {
    if (!data.roadmap || !progress) return new Set<string>();
    return new Set(
      data.roadmap.modules
        .map((m) => m.module_id)
        .filter((id) => {
          const tasks = progress.tasks.filter((t) => t.module_id === id);
          return tasks.length > 0 && tasks.every((t) => progress.doneTasks.has(t.id));
        })
    );
  }, [data.roadmap, progress]);

  if (data.status === 'loading') {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading projects">
        <Skeleton height={140} radius="lg" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height={170} radius="lg" />)}</div>
      </div>
    );
  }
  if (data.status === 'error') {
    return (
      <EmptyState
        tone="danger"
        bordered
        title="Could not load your projects"
        description={data.error ?? 'Something went wrong reading your progress.'}
        actions={<Button onClick={data.reload}>Try again</Button>}
      />
    );
  }

  if (screen.name === 'topic') {
    return (
      <div className="mx-auto w-full max-w-5xl pb-16">
        <TopicScreen
          topicId={screen.topicId}
          roadmap={data.roadmap}
          progress={progress}
          notes={data.notes}
          trackId={role ?? 'fullstack'}
          practiceRemaining={practiceLeft(events, tier, new Date()).remaining}
          isFree={isFree}
          onBack={() => setScreen({ name: 'project', id: screen.projectId })}
          onRecord={data.record}
          onSaveNote={data.saveNote}
          onOpenUpgrade={onOpenUpgrade}
        />
      </div>
    );
  }

  if (screen.name === 'project') {
    const project = resolveProject(screen.id);
    return (
      <div className="mx-auto w-full max-w-6xl pb-16">
        {project ? (
          <ProjectBuild
            key={project.id}
            project={project}
            mine={data.projects.find((p) => p.project_id === project.id) ?? null}
            doneModules={doneModules}
            trackId={role}
            beginnerOnly={isFree}
            onBack={() => setScreen({ name: 'library' })}
            onSave={data.saveProject}
            onRecord={data.record}
            onCheckRepo={data.checkRepo}
            onOpenTopic={(topicId) => setScreen({ name: 'topic', topicId, projectId: project.id })}
            onOpenUpgrade={onOpenUpgrade}
          />
        ) : (
          <EmptyState bordered title="Project not found" description="It may have been removed from the library." actions={<Button onClick={() => setScreen({ name: 'library' })}>All projects</Button>} />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl pb-16">
      <ProjectLibrary mine={data.projects} role={role} beginnerOnly={isFree} onOpen={(id) => setScreen({ name: 'project', id })} />
    </div>
  );
}

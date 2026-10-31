import React, { useMemo, useState } from 'react';
import { Button, EmptyState, Skeleton, useToast } from '@nomadic/ui';
import {
  capstoneStepKey,
  doneEntries,
  randomUuid,
  roleProgress,
  topicKey,
  type LearningEvent,
  type RoleRoadmapRequest,
} from '@job-automator/learning';
import type { AppUser, LearningEventInput } from '../../types';
import { roleById } from './content';
import { RoadmapView } from './RoadmapView';
import { BuildingRoadmap, RoleSetup } from './RoleSetup';
import { useLearning } from './useLearning';

interface LearnViewProps {
  currentUser?: Pick<AppUser, 'tier'> | null;
  /** The target role the student typed in their profile (any text), used to start the setup. */
  suggestedRole?: string;
  onOpenUpgrade?: (feature?: string) => void;
  onLog?: (msg: string) => void;
  /** 'projects' opens the roadmap on its Projects tab. */
  initialTab?: string | null;
}

/** Ticks or unticks one topic or capstone step (`task_done`; the latest event per item wins). */
function doneEvent(itemId: string, done: boolean, payload: Record<string, unknown>): LearningEventInput {
  return {
    id: randomUuid(),
    type: 'task_done',
    skill_id: null,
    item_id: itemId,
    payload: done ? payload : { ...payload, undone: true },
    duration_s: 0,
    created_at: new Date().toISOString(),
  };
}

/**
 * Learn: a roadmap for any role. Setup (role, level, note) → the AI builds
 * subjects → modules → topics and five projects → one page where every topic
 * has its own YouTube, ChatGPT and Done, and the Projects tab holds the capstone.
 */
export function LearnView({ suggestedRole, onOpenUpgrade, onLog, initialTab }: LearnViewProps) {
  const data = useLearning();
  const { toast } = useToast();
  const [mode, setMode] = useState<'roadmap' | 'setup' | 'building'>('roadmap');
  const [building, setBuilding] = useState<RoleRoadmapRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const events = data.events as unknown as LearningEvent[];
  const done = useMemo(() => doneEntries(events), [events]);
  const roadmap = data.roleRoadmap;
  const progress = useMemo(() => (roadmap ? roleProgress(roadmap, done) : null), [roadmap, done]);

  if (data.status === 'loading') {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3" aria-busy="true" aria-label="Loading your roadmap">
        <Skeleton height={32} width={260} />
        <Skeleton height={10} />
        <Skeleton height={120} radius="lg" />
        <Skeleton height={64} radius="lg" />
        <Skeleton height={64} radius="lg" />
      </div>
    );
  }
  if (data.status === 'error') {
    return (
      <EmptyState
        tone="danger"
        bordered
        title="Could not load your roadmap"
        description={data.error ?? 'Something went wrong reading your progress.'}
        actions={<Button onClick={data.reload}>Try again</Button>}
      />
    );
  }

  const build = async (req: RoleRoadmapRequest) => {
    setBuilding(req);
    setMode('building');
    setError(null);
    const res = await data.buildRole(req);
    if (res.ok) {
      onLog?.(`[Learn] Roadmap built for "${res.roadmap.role}" (${res.roadmap.source}).`);
      setNotice(res.notice);
      setMode('roadmap');
    } else {
      setError(res.error);
      setMode('setup');
    }
  };

  const record = async (ev: LearningEventInput) => {
    const res = await data.record([ev]);
    if (!res.ok) onLog?.(`[Learn] Progress not saved: ${res.error}`);
    return res;
  };

  // Setup: no v3 roadmap yet, or the student asked for a new one.
  if (mode === 'building' && building) return <BuildingRoadmap role={building.role} />;
  if (!roadmap || !progress || mode === 'setup') {
    const v2Role = data.roadmap ? roleById(data.roadmap.track_id)?.name ?? null : null;
    const initial: RoleRoadmapRequest = building ?? {
      role: roadmap?.role ?? v2Role ?? suggestedRole?.trim() ?? '',
      level: roadmap?.level ?? 'beginner',
      note: '',
    };
    return (
      <RoleSetup
        key={`${initial.role}|${error ?? ''}`}
        initial={initial}
        replacing={roadmap?.role ?? null}
        error={error}
        banner={
          !roadmap && v2Role ? (
            <div role="status" className="rounded-lg border border-accent/40 bg-accent-subtle px-4 py-3 text-body text-fg">
              <strong>Learn has a new layout.</strong> Build your {v2Role} roadmap again: every topic now has its own YouTube and ChatGPT buttons, and the roadmap ends with projects.
            </div>
          ) : null
        }
        onBuild={(req) => void build(req)}
        onCancel={roadmap ? () => { setError(null); setMode('roadmap'); } : undefined}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 pb-16">
      {data.pendingSync > 0 && <p className="text-caption text-fg-subtle">Saved on this device; syncs when you are online.</p>}
      <RoadmapView
        key={roadmap.id}
        roadmap={roadmap}
        progress={progress}
        done={done}
        notice={notice}
        startOnProjects={initialTab === 'projects'}
        onDismissNotice={() => setNotice(null)}
        onToggleTopic={(ref, isDone) => record(doneEvent(topicKey(ref.moduleId, ref.topicId), isDone, { role: roadmap.role, topic: ref.title.slice(0, 120) }))}
        onSave={(next) => data.saveRole(next)}
        onChangeRole={() => { setBuilding(null); setError(null); setMode('setup'); }}
        onPickCapstone={async (projectId) => {
          const res = await data.buildCapstone(projectId);
          if (res.ok) toast({ title: 'Capstone ready', description: 'Work through the steps in order; each has its own help.', tone: 'success' });
          return res;
        }}
        onToggleStep={(projectId, step, isDone) => record(doneEvent(capstoneStepKey(projectId, step.id), isDone, { role: roadmap.role, step: step.title.slice(0, 120) }))}
        onAskStep={data.askCapstone}
        onOpenUpgrade={onOpenUpgrade}
      />
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { IntakeInput, ProblemNote, Roadmap, Schedule, UserProject } from '@job-automator/learning';
import {
  getApi,
  type LearnAdjustResult,
  type LearnDraft,
  type LearningEventInput,
  type LearningEventRecord,
  type LearnRepoCheckRequest,
  type LearnRepoCheckResult,
} from '../../types';

type Result<T = object> = Promise<({ ok: true } & T) | { ok: false; error: string; limited?: boolean }>;

export interface LearningData {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  events: LearningEventRecord[];
  roadmap: Roadmap | null;
  schedule: Schedule | null;
  projects: UserProject[];
  notes: ProblemNote[];
  draft: LearnDraft | null;
  /** Events and documents saved on this device that the server has not accepted yet. */
  pendingSync: number;
  reload: () => void;
  /** Appends events; state updates only after the main process stored them. */
  record: (events: LearningEventInput[]) => Result;
  generate: (intake: IntakeInput) => Result<{ draft: LearnDraft }>;
  adjust: (instruction: string) => Promise<LearnAdjustResult>;
  accept: (roadmap: Roadmap, schedule: Schedule) => Result;
  saveSchedule: (schedule: Schedule) => Result;
  saveProject: (project: UserProject) => Result;
  saveNote: (note: ProblemNote) => Result;
  checkRepo: (req: LearnRepoCheckRequest) => Promise<LearnRepoCheckResult>;
  discardDraft: () => void;
}

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** Learn state from the desktop API: event log, roadmap, schedule, projects, notes and a draft. Syncs once on mount. */
export function useLearning(): LearningData {
  const [status, setStatus] = useState<LearningData['status']>('loading');
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<LearningEventRecord[]>([]);
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [projects, setProjects] = useState<UserProject[]>([]);
  const [notes, setNotes] = useState<ProblemNote[]>([]);
  const [draft, setDraft] = useState<LearnDraft | null>(null);
  const [pendingSync, setPendingSync] = useState(0);
  const [nonce, setNonce] = useState(0);
  const reqId = useRef(0);
  const synced = useRef(false);

  useEffect(() => {
    const id = ++reqId.current;
    setStatus((s) => (s === 'ready' ? s : 'loading'));
    (async () => {
      try {
        const state = await getApi().learningGetState();
        if (id !== reqId.current) return;
        setEvents(Array.isArray(state.events) ? state.events : []);
        setRoadmap(state.roadmap ?? null);
        setSchedule(state.schedule ?? null);
        setProjects(Array.isArray(state.projects) ? state.projects : []);
        setNotes(Array.isArray(state.notes) ? state.notes : []);
        setDraft(state.draft ?? null);
        setPendingSync(state.pendingSync ?? 0);
        setError(null);
        setStatus('ready');
      } catch (e) {
        if (id !== reqId.current) return;
        setError(errMsg(e, 'Your learning progress could not be loaded.'));
        setStatus('error');
      }
    })();
  }, [nonce]);

  // Pull progress from other devices once; reload only when something new arrived.
  useEffect(() => {
    if (synced.current) return;
    synced.current = true;
    getApi().learningSync?.()
      .then((r) => { if (r && (r.pulled > 0 || r.pushed > 0)) setNonce((n) => n + 1); })
      .catch(() => {});
  }, []);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const record = useCallback(async (input: LearningEventInput[]) => {
    if (!input.length) return { ok: true as const };
    try {
      const res = await getApi().learningRecordEvents(input);
      if (!res?.success) throw new Error(res?.error || 'Your progress was not saved.');
      const stored = res.events ?? [];
      setEvents((prev) => {
        const known = new Set(prev.map((e) => e.id));
        return [...prev, ...stored.filter((e) => !known.has(e.id))];
      });
      setPendingSync((n) => n + stored.length);
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: errMsg(e, 'Your progress was not saved.') };
    }
  }, []);

  const generate = useCallback(async (intake: IntakeInput) => {
    try {
      const res = await getApi().learnRoadmapGenerate(intake);
      if (!res?.success || !res.draft) throw new Error(res?.error || 'The roadmap could not be built.');
      setDraft(res.draft);
      return { ok: true as const, draft: res.draft };
    } catch (e) {
      return { ok: false as const, error: errMsg(e, 'The roadmap could not be built.') };
    }
  }, []);

  const adjust = useCallback(async (instruction: string) => {
    try {
      return await getApi().learnRoadmapAdjust(instruction);
    } catch (e) {
      return { success: false, error: errMsg(e, 'The change could not be prepared.') };
    }
  }, []);

  const accept = useCallback(async (r: Roadmap, s: Schedule) => {
    try {
      const res = await getApi().learnRoadmapAccept(r, s);
      if (!res?.success || !res.roadmap || !res.schedule) throw new Error(res?.error || 'Your roadmap was not saved.');
      setRoadmap(res.roadmap);
      setSchedule(res.schedule);
      setDraft(null);
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: errMsg(e, 'Your roadmap was not saved.') };
    }
  }, []);

  const saveSchedule = useCallback(async (s: Schedule) => {
    const prev = schedule;
    setSchedule(s);
    try {
      const res = await getApi().learnScheduleSave(s);
      if (!res?.success) throw new Error(res?.error || 'Your schedule was not saved.');
      return { ok: true as const };
    } catch (e) {
      setSchedule(prev);
      return { ok: false as const, error: errMsg(e, 'Your schedule was not saved.') };
    }
  }, [schedule]);

  const saveProject = useCallback(async (p: UserProject) => {
    try {
      const res = await getApi().learnProjectSave(p);
      if (!res?.success || !res.projects) return { ok: false as const, error: res?.error || 'Your project was not saved.', limited: res?.limited };
      setProjects(res.projects);
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: errMsg(e, 'Your project was not saved.') };
    }
  }, []);

  const saveNote = useCallback(async (n: ProblemNote) => {
    try {
      const res = await getApi().learnProblemNoteSave(n);
      if (!res?.success || !res.notes) throw new Error(res?.error || 'Your note was not saved.');
      setNotes(res.notes);
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: errMsg(e, 'Your note was not saved.') };
    }
  }, []);

  const checkRepo = useCallback(async (req: LearnRepoCheckRequest) => {
    try {
      return await getApi().learnProjectCheckRepo(req);
    } catch (e) {
      return { success: false, error: errMsg(e, 'The repository could not be checked.') };
    }
  }, []);

  const discardDraft = useCallback(() => setDraft(null), []);

  return {
    status, error, events, roadmap, schedule, projects, notes, draft, pendingSync,
    reload, record, generate, adjust, accept, saveSchedule, saveProject, saveNote, checkRepo, discardDraft,
  };
}

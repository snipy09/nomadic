import { useCallback, useRef, useState } from 'react';
import { getApi } from '../../types';
import type { DraftAnswersInput } from '../../../shared/ipc';

export type DraftCandidate = DraftAnswersInput['candidate'];

/**
 * Asks Nomadic AI to draft answers from the resume. Drafts are returned to the caller,
 * never saved: the user edits and confirms them. Uses the daily AI form quota.
 */
export function useAnswerDrafts() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const draft = useCallback(async (ids: string[], candidate: DraftCandidate): Promise<Record<string, string> | null> => {
    const api = getApi();
    if (!ids.length) return {};
    if (!api?.draftProfileAnswers) {
      setError('AI drafts are not available here.');
      return null;
    }
    const mine = ++seq.current;
    setBusy(true);
    setError(null);
    try {
      const res = await api.draftProfileAnswers({ ids: ids.slice(0, 30), candidate });
      if (mine !== seq.current) return null;
      if (!res.success) {
        setError(res.error || 'Nomadic AI could not draft answers. Try again.');
        return null;
      }
      return res.answers ?? {};
    } catch (e) {
      if (mine === seq.current) setError(e instanceof Error ? e.message : 'Nomadic AI could not draft answers.');
      return null;
    } finally {
      if (mine === seq.current) setBusy(false);
    }
  }, []);

  return { draft, busy, error, clearError: () => setError(null) };
}

/** Reads a saved resume (by id) or a PDF/TXT the user picks. Returns the text, or null. */
export function useDocumentReader() {
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const read = useCallback(async (resumeId?: number): Promise<{ text: string; fileName?: string } | null> => {
    const api = getApi();
    if (!api?.readDocumentText) {
      setError('Reading documents works in the desktop app only.');
      return null;
    }
    setReading(true);
    setError(null);
    try {
      const res = await api.readDocumentText(resumeId === undefined ? {} : { resumeId });
      if (res.canceled) return null;
      if (!res.success || !res.text) {
        setError(res.error || 'Nomadic could not read this file.');
        return null;
      }
      return { text: res.text, fileName: res.fileName };
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nomadic could not read this file.');
      return null;
    } finally {
      setReading(false);
    }
  }, []);

  return { read, reading, error };
}

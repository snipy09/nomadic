import { useEffect, useState } from 'react';
import { deriveMastery, masteryFromProgress, mergeMastery, type LearningEvent, type MasteryMap } from '@job-automator/learning';
import { learnIndex } from '../learn/catalog';
import { getApi } from '../../types';

/**
 * Skill mastery from the Learn event log, for the feed match: the higher of v1 mastery (quizzes,
 * placement) and Learn v2 progress (completed topics, finished projects). Loaded once per mount; no
 * progress or a failure is an empty map (the match then uses profile skills only, never a guessed value).
 */
export function useLearnedMastery(): MasteryMap {
  const [mastery, setMastery] = useState<MasteryMap>({});
  useEffect(() => {
    let live = true;
    const api = getApi();
    if (!api.learningGetState) return;
    api.learningGetState()
      .then((state) => {
        // Events are validated by the main process on the way in.
        if (!live || !Array.isArray(state?.events)) return;
        const events = state.events as unknown as LearningEvent[];
        setMastery(mergeMastery(deriveMastery(events), masteryFromProgress(learnIndex(), events)));
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  return mastery;
}

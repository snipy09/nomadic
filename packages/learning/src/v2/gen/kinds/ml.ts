/** ml projects (to be written). */
import type { DataCtx, KindPlan, StackDef } from '../types';

export const ML = {
  stacks: [] as StackDef[],
  plan: { kind: 'ml', stages: () => [], outcome: () => '', readme: () => [], deploy: () => [], verbs: [] } satisfies KindPlan<DataCtx>,
};

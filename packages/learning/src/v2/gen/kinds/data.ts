/** data projects (to be written). */
import type { DataCtx, KindPlan, StackDef } from '../types';

export const DATA = {
  stacks: [] as StackDef[],
  plan: { kind: 'data', stages: () => [], outcome: () => '', readme: () => [], deploy: () => [], verbs: [] } satisfies KindPlan<DataCtx>,
};

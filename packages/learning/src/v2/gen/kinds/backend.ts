/** backend projects (to be written). */
import type { Ctx, KindPlan, StackDef } from '../types';

export const BACKEND = {
  stacks: [] as StackDef[],
  plan: { kind: 'backend', stages: () => [], outcome: () => '', readme: () => [], deploy: () => [], verbs: [] } satisfies KindPlan<Ctx>,
};

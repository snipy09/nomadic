/** fullstack projects (to be written). */
import type { Ctx, KindPlan, StackDef } from '../types';

export const FULLSTACK = {
  stacks: [] as StackDef[],
  plan: { kind: 'fullstack', stages: () => [], outcome: () => '', readme: () => [], deploy: () => [], verbs: [] } satisfies KindPlan<Ctx>,
};

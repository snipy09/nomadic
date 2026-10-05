/** cli projects (to be written). */
import type { Ctx, KindPlan, StackDef } from '../types';

export const CLI = {
  stacks: [] as StackDef[],
  plan: { kind: 'cli', stages: () => [], outcome: () => '', readme: () => [], deploy: () => [], verbs: [] } satisfies KindPlan<Ctx>,
};

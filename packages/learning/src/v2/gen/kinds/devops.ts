/** devops projects (to be written). */
import type { Ctx, KindPlan, StackDef } from '../types';

export const DEVOPS = {
  stacks: [] as StackDef[],
  plan: { kind: 'devops', stages: () => [], outcome: () => '', readme: () => [], deploy: () => [], verbs: [] } satisfies KindPlan<Ctx>,
};

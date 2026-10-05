/** mobile projects (to be written). */
import type { Ctx, KindPlan, StackDef } from '../types';

export const MOBILE = {
  stacks: [] as StackDef[],
  plan: { kind: 'mobile', stages: () => [], outcome: () => '', readme: () => [], deploy: () => [], verbs: [] } satisfies KindPlan<Ctx>,
};

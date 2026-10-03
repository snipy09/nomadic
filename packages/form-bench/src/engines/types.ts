import type { Page } from 'playwright';
import type { MasterProfile } from '../../../form-engine/src/profile.ts';
import type { AnswerKey } from '../fixtures/kit.ts';
import type { EngineFieldRef } from '../score.ts';

export interface EngineRunInfo {
  /** Fields the engine's reader detected (enables the "found" metric). */
  fields?: EngineFieldRef[];
  needsUser?: number;
  walls?: string[];
  llmCalls?: number;
  notes?: string[];
}

export interface BenchEngine {
  name: string;
  run(page: Page, profile: MasterProfile, key: AnswerKey): Promise<EngineRunInfo>;
}

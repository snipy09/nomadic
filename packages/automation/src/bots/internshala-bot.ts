import type { Page } from 'playwright';
import type { MasterProfile } from '../../../form-engine/src/profile.js';
import { applyWithAdapter, internshalaAdapter, type BotApplyOptions, type SpecializedBotResult } from './portal-adapter.js';

export type { SpecializedBotResult };

/**
 * Thin adapter: open the Internshala application modal (internshalaAdapter.prepare),
 * then let FormEngine fill it. Submits only when `opts.submit` is true and the engine
 * reports every required field resolved.
 */
export class InternshalaBot {
  static async apply(
    page: Page,
    profile: MasterProfile,
    logger?: { info: (m: string) => void; warn: (m: string) => void },
    opts: BotApplyOptions = {}
  ): Promise<SpecializedBotResult> {
    logger?.info('[InternshalaBot] FormEngine adapter');
    return applyWithAdapter(page, profile, internshalaAdapter, opts);
  }
}

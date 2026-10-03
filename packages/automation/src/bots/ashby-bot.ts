import type { Page } from 'playwright';
import type { MasterProfile } from '../../../form-engine/src/profile.js';
import { applyWithAdapter, ashbyAdapter, type BotApplyOptions, type SpecializedBotResult } from './portal-adapter.js';

/**
 * Thin adapter: bring the Ashby form on screen (ashbyAdapter.prepare), then let FormEngine fill it.
 * Submits only when `opts.submit` is true and the engine reports every required field resolved.
 */
export class AshbyBot {
  static async apply(page: Page, profile: MasterProfile, opts: BotApplyOptions = {}): Promise<SpecializedBotResult> {
    return applyWithAdapter(page, profile, ashbyAdapter, opts);
  }
}

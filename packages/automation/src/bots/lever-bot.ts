import type { Page } from 'playwright';
import type { MasterProfile } from '../../../form-engine/src/profile.js';
import { applyWithAdapter, leverAdapter, type BotApplyOptions, type SpecializedBotResult } from './portal-adapter.js';

/**
 * Thin adapter: open the Lever /apply page (leverAdapter.prepare), then let FormEngine fill it.
 * Submits only when `opts.submit` is true and the engine reports every required field resolved.
 */
export class LeverBot {
  static async apply(page: Page, profile: MasterProfile, opts: BotApplyOptions = {}): Promise<SpecializedBotResult> {
    return applyWithAdapter(page, profile, leverAdapter, opts);
  }
}

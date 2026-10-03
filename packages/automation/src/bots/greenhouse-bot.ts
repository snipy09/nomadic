import type { Page } from 'playwright';
import type { MasterProfile } from '../../../form-engine/src/profile.js';
import { applyWithAdapter, greenhouseAdapter, type BotApplyOptions, type SpecializedBotResult } from './portal-adapter.js';

/**
 * Thin adapter: bring the Greenhouse form on screen (greenhouseAdapter.prepare; embedded
 * iframes are read by FormEngine directly), then fill it.
 * Submits only when `opts.submit` is true and the engine reports every required field resolved.
 */
export class GreenhouseBot {
  static async apply(page: Page, profile: MasterProfile, opts: BotApplyOptions = {}): Promise<SpecializedBotResult> {
    return applyWithAdapter(page, profile, greenhouseAdapter, opts);
  }
}

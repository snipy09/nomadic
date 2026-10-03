import type { Page } from 'playwright';
import type { MasterProfile } from '../auto-apply-engine.js';
import { applyWithAdapter, formEngineMode, greenhouseAdapter, type BotApplyOptions, type SpecializedBotResult } from './portal-adapter.js';
import { OmniFormSolver } from '../omni-form-solver.js';

export class GreenhouseBot {
  /**
   * Thin adapter: bring the form on screen, then let FormEngine fill it.
   * Does not submit unless `opts.submit` is true (and the engine reports the form complete).
   * NOMADIC_FORM_ENGINE=old runs the legacy solver chain instead.
   */
  static async apply(page: Page, profile: MasterProfile, opts: BotApplyOptions = {}): Promise<SpecializedBotResult> {
    if (formEngineMode() === 'old') return GreenhouseBot.applyLegacy(page, profile);
    return applyWithAdapter(page, profile, greenhouseAdapter, opts);
  }

  /** @deprecated legacy solver chain, kept behind NOMADIC_FORM_ENGINE=old until Step 1.7. */
  static async applyLegacy(page: Page, profile: MasterProfile): Promise<SpecializedBotResult> {
    try {
      // 1. Scroll to or click Apply button
      const applyBtn = await page.$('#apply_button, a#apply_button, a[href*="#app"], button:has-text("Apply for this job"), a:has-text("Apply for this job")');
      if (applyBtn) {
        const isVis = typeof applyBtn.isVisible === 'function' ? await applyBtn.isVisible().catch(() => false) : true;
        if (isVis) {
          await applyBtn.click().catch(() => {});
          await page.waitForTimeout(600);
        }
      }

      // 2. Solve Greenhouse Form top-to-bottom and submit
      const solveResult = await OmniFormSolver.solveEntireForm(
        page,
        profile,
        profile.desiredTitle || 'Software Engineer',
        'Engineering Team',
        true
      );

      return {
        success: solveResult.isSubmitted || solveResult.totalInteractions > 0,
        fieldsFilled: solveResult.totalInteractions,
        submitted: Boolean(solveResult.isSubmitted),
        confirmed: Boolean(solveResult.isConfirmed),
      };
    } catch (err: any) {
      return { success: false, fieldsFilled: 0, submitted: false, confirmed: false, error: err.message };
    }
  }
}

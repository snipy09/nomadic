/**
 * The legacy (current) engine, as wired in AutoApplyEngine.submitApplication:
 * per pass -> specialized portal bot -> AI pilot -> FormFiller -> OmniFormSolver
 * (auto-submit) -> FormSubmitter -> stepper advance. Up to 3 passes.
 *
 * Differences from production, needed to run offline against fixtures:
 *  - the bot is chosen from the fixture's ATS (fixture URLs are localhost);
 *  - login walls are detected but not waited on (production waits 60s for the user);
 *  - network calls (Gemini/Groq) fail fast because the runner disables fetch.
 */
import type { Page } from 'playwright';
import type { BenchEngine, EngineRunInfo } from './types.ts';
import { AutoApplyEngine } from '../../../automation/src/auto-apply-engine.ts';
import { AshbyBot } from '../../../automation/src/bots/ashby-bot.ts';
import { GreenhouseBot } from '../../../automation/src/bots/greenhouse-bot.ts';
import { LeverBot } from '../../../automation/src/bots/lever-bot.ts';
import { InternshalaBot } from '../../../automation/src/bots/internshala-bot.ts';
import { FormFiller } from '../../../automation/src/form-filler.ts';
import { OmniFormSolver } from '../../../automation/src/omni-form-solver.ts';
import { FormSubmitter } from '../../../automation/src/submitter.ts';
import { getATSConfig } from '../../../automation/src/ats-portals.ts';
import { extractSemanticDOM } from '../../../automation/src/semantic-dom-extractor.ts';
import { generateAIPilotPlan } from '../../../automation/src/ai-pilot-engine.ts';

const SOURCE_HOST: Record<string, string> = {
  ashby: 'https://jobs.ashbyhq.com/x/1/application',
  greenhouse: 'https://boards.greenhouse.io/x/jobs/1',
  lever: 'https://jobs.lever.co/x/1/apply',
  internshala: 'https://internshala.com/internship/detail/x',
  workday: 'https://x.wd5.myworkdayjobs.com/x/job/1',
  other: 'https://careers.example.com/apply/1',
};

export const oldEngine: BenchEngine = {
  name: 'old',
  async run(page: Page, profile, key): Promise<EngineRunInfo> {
    const notes: string[] = [];
    const walls: string[] = [];
    const atsConfig = getATSConfig(SOURCE_HOST[key.ats]);
    let total = 0;

    for (let pass = 1; pass <= 3; pass++) {
      const login = await AutoApplyEngine.detectLoginRequired(page);
      if (login.requiresLogin) { walls.push('login'); notes.push(`pass ${pass}: login wall`); break; }

      let bot: { fieldsFilled: number; submitted: boolean; confirmed: boolean } | null = null;
      if (key.ats === 'ashby') bot = await AshbyBot.apply(page, profile);
      else if (key.ats === 'greenhouse') bot = await GreenhouseBot.apply(page, profile);
      else if (key.ats === 'lever') bot = await LeverBot.apply(page, profile);
      else if (key.ats === 'internshala') bot = await InternshalaBot.apply(page, profile);
      if (bot) {
        total += bot.fieldsFilled;
        if (bot.submitted && bot.confirmed) break;
      }

      const snapshot = await extractSemanticDOM(page).catch(() => null);
      if (snapshot) await generateAIPilotPlan(profile, snapshot, { geminiKey: profile.geminiApiKey, groqKey: profile.groqApiKey }).catch(() => null);

      const fill = await new FormFiller(page, atsConfig, profile as any).fillFormDeterministic();
      total += fill.fieldsFilled;

      const omni = await OmniFormSolver.solveEntireForm(page, profile, profile.desiredTitle, atsConfig.name, true);
      total += omni.totalInteractions;
      if (omni.isSubmitted && omni.isConfirmed) break;

      if (total > 0) {
        const sub = await new FormSubmitter(page, atsConfig).submitAndVerify();
        if (sub.submitted && sub.confirmed) break;
      }
      const advanced = await AutoApplyEngine.advanceApplicationStepper(page);
      if (advanced) { notes.push(`pass ${pass}: advanced stepper`); continue; }
      if (total > 0) break;
    }
    notes.push(`legacy interactions reported: ${total}`);
    return { walls, notes };
  },
};

import {
  AutoApplyEngine,
  type MasterProfile,
  type ApplyResult,
} from './auto-apply-engine.ts';
import {
  answerCustomQuestion,
  answerCustomQuestionWithGroq,
  callGeminiFlash,
  callGeminiVision,
  generateAIVisionActionPlan,
  generateStructuredAIContent,
  extractJsonFromAiResponse,
  matchResumeWithJob,
  generateCoverLetter,
  BUILTIN_GEMINI_KEYS,
  type SemanticElement,
  type AIFormActionPlan,
} from './groq-ai.ts';
import {
  injectStealthScripts,
  humanType,
  humanClick,
  handleCloudflareTurnstile,
} from './stealth-evasion.ts';
import { enableFastRouteInterception } from './fast-route-interceptor.ts';
import { runFastLocalNavMatcher } from './fast-nav-matcher.ts';
import { ATS_FIELD_ALIASES } from './alias-dictionary.ts';
import { ATS_PORTALS, getATSConfig, type ATSPortal } from './ats-portals.ts';
import { ApplicationNavigator, type NavigationResult } from './navigator.ts';
import { FormSubmitter, type SubmitResult } from './submitter.ts';
import { openPortalApplication } from './portals.ts';
import { runNewFormEngine, toFormProfile } from './form-engine-bridge.ts';
import {
  findChromeExecutable,
  ensureChromeForTesting,
  launchExternalStealthBrowser,
  type BrowserLaunchOptions,
  type BrowserSession,
} from './chrome-manager.ts';

export {
  AutoApplyEngine,
  ATS_PORTALS,
  getATSConfig,
  type ATSPortal,
  ApplicationNavigator,
  type NavigationResult,
  FormSubmitter,
  type SubmitResult,
  openPortalApplication,
  runNewFormEngine,
  toFormProfile,
  answerCustomQuestion,
  answerCustomQuestionWithGroq,
  callGeminiFlash,
  callGeminiVision,
  generateAIVisionActionPlan,
  generateStructuredAIContent,
  extractJsonFromAiResponse,
  matchResumeWithJob,
  generateCoverLetter,
  BUILTIN_GEMINI_KEYS,
  ATS_FIELD_ALIASES,
  findChromeExecutable,
  ensureChromeForTesting,
  launchExternalStealthBrowser,
  injectStealthScripts,
  humanType,
  humanClick,
  handleCloudflareTurnstile,
  enableFastRouteInterception,
  runFastLocalNavMatcher,
};

export type {
  MasterProfile,
  ApplyResult,
  BrowserLaunchOptions,
  BrowserSession,
  SemanticElement,
  AIFormActionPlan,
};

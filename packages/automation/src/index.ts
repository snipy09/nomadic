import {
  AutoApplyEngine,
  type MasterProfile,
  type ApplyResult,
  type ResumeItem,
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
  resolveTargetElementWithTextAI,
  type SemanticElement,
  type AIFormActionPlan,
} from './groq-ai.ts';
import { ATS_PORTALS, getATSConfig, type ATSPortal } from './ats-portals.ts';
import { ApplicationNavigator, type NavigationResult } from './navigator.ts';
import { FormSubmitter, type SubmitResult } from './submitter.ts';
import {
  capturePageVisionAndDOM,
  executeNomadicFill,
  executeNomadicSelect,
  executeNomadicClick,
} from './ai-vision-inspector.ts';
import {
  injectStealthScripts,
  humanType,
  humanClick,
  handleCloudflareTurnstile,
} from './stealth-evasion.ts';
import { enableFastRouteInterception } from './fast-route-interceptor.ts';
import { runFastLocalNavMatcher } from './fast-nav-matcher.ts';
import { ATS_FIELD_ALIASES } from './alias-dictionary.ts';
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
  capturePageVisionAndDOM,
  executeNomadicFill,
  executeNomadicSelect,
  executeNomadicClick,
  injectStealthScripts,
  humanType,
  humanClick,
  handleCloudflareTurnstile,
  enableFastRouteInterception,
  runFastLocalNavMatcher,
  resolveTargetElementWithTextAI,
};

export type {
  MasterProfile,
  ApplyResult,
  ResumeItem,
  BrowserLaunchOptions,
  BrowserSession,
  SemanticElement,
  AIFormActionPlan,
};

// ── Form engine (Phase 1) ──────────────────────────────────────────────────
export type {
  AutoApplyStatusEvent,
  AutoApplyFormEvent,
  ProgressCallback,
  SubmitApplicationOptions,
  ReviewHandle,
} from './auto-apply-engine.ts';
export { outcomeKey, writeReviewedValues } from './apply-flow.ts';
export {
  adapterFor,
  adapterById,
  runPortalAdapter,
  applyWithAdapter,
  PORTAL_ADAPTERS,
  type PortalAdapter,
  type BotApplyOptions,
  type SpecializedBotResult,
} from './bots/portal-adapter.ts';
export {
  FormEngine,
  MasterProfileSchema,
  validateProfile,
  parseProfile,
  DEFAULT_POLICY,
  type FillReport,
  type FieldOutcome,
  type FormEngineEvent,
  type FormField,
  type FormPolicy,
  type AnswerLlm,
  type FormAnswerClient,
  type FormAnswerRequest,
} from '../../form-engine/src/index.ts';

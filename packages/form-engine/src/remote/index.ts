/**
 * Browser-safe entry for the Android app: the agent channel, the remote driver, the
 * apply-with-review flow and the agent script to inject. Imports nothing from Node or
 * Playwright (checked by remote.test.ts).
 */
export { AgentChannel, FrameGoneError, type AgentFrame, type BridgeTransport } from './channel.js';
export { RemoteDriver, type RemoteDriverOptions } from './driver.js';
export { fillApplication, openForm, submitReviewed, type RemoteApplyOptions, type RemoteApplyResult, type RemoteApplyStatus, type RemoteReviewHandle, type ReviewedSubmitResult } from './apply.js';
export { AGENT_SCRIPT, AGENT_SCRIPT_SHA } from '../agent/bundle.generated.js';
export { AGENT_VERSION, type AgentFile, type AgentMessage, type AgentRequest, type BridgeObject } from '../agent/protocol.js';
export { outcomeKey, recomputeReport, type FormDriver } from '../core.js';
export { questionFingerprint, MemoryAnswerCache, type AnswerCache, type ResumeResolver } from '../answerer.js';
export { isFormAnswerClient, type AnswerLlm, type FormAnswerClient, type FormAnswerRequest } from '../llm.js';
export { adapterSpecFor, adapterSpecById, type PortalId } from '../adapters.js';
export type { AnswerContext, FieldOutcome, FillReport, FormEngineEvent, FormEngineListener, FormField } from '../contracts.js';
export type { MasterProfile } from '../profile.js';

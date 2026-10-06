/**
 * Messages between the host (the app's engine) and the in-page agent (one per frame).
 *
 * Transport: on Android the WebView exposes `window.nomadicBridge` in every frame
 * (androidx.webkit WebMessageListener); the agent posts JSON strings to it and receives
 * requests on `nomadicBridge.onmessage`. Tests use the same object, backed by Playwright.
 *
 * The page's own scripts can see the bridge, so the host never sends more than one field's
 * answer (or the resume file for an upload field) to the frame that owns that field.
 */
import type { Answer, FormField, VerifyIssue, WriteResult } from '../contracts.js';
import type { RawField } from './scan.js';

export const AGENT_VERSION = 1;

export type Answered = Extract<Answer, { status: 'answered' }>;

/** A file to attach, sent with a `write` for a file field. */
export interface AgentFile {
  name: string;
  mimeType: string;
  base64: string;
}

export interface VerifyItem {
  field: FormField;
  status: 'filled' | 'needs_user' | 'skipped' | 'failed';
  /** What the field should hold (write read-back or answer value). */
  expected: string;
  /** File fields: the attached file's name. */
  fileName?: string;
}

export interface AgentCommands {
  ping: { args: Record<string, never>; result: { url: string; readyState: DocumentReadyState; top: boolean; version: number } };
  scan: { args: { includeHidden?: boolean }; result: RawField[] };
  read: { args: { field: FormField }; result: string };
  write: { args: { field: FormField; answer: Answered; file?: AgentFile }; result: WriteResult };
  verify: { args: { items: VerifyItem[] }; result: VerifyIssue[] };
  pageErrors: { args: Record<string, never>; result: string[] };
  walls: { args: Record<string, never>; result: string[] };
  clickButton: { args: { src: string; preferSubmit: boolean }; result: boolean };
  isConfirmation: { args: Record<string, never>; result: boolean };
  anyVisible: { args: { selectors: string[] }; result: boolean };
  clickFirstVisible: { args: { selectors: string[] }; result: boolean };
}

export type AgentCommand = keyof AgentCommands;

export interface AgentRequest<C extends AgentCommand = AgentCommand> {
  t: 'req';
  id: number;
  cmd: C;
  args: AgentCommands[C]['args'];
}

export type AgentMessage =
  | { t: 'hello'; frameId: string; url: string; top: boolean; readyState: DocumentReadyState; version: number }
  | { t: 'state'; frameId: string; url: string; readyState: DocumentReadyState }
  | { t: 'bye'; frameId: string }
  | { t: 'res'; frameId: string; id: number; ok: true; result: unknown }
  | { t: 'res'; frameId: string; id: number; ok: false; error: string };

/** Shape of the bridge object in each frame (androidx.webkit JavaScript object). */
export interface BridgeObject {
  postMessage(data: string): void;
  onmessage: ((event: { data: string }) => void) | null;
}

import type { PluginListenerHandle } from '@capacitor/core';

export interface SupportResult {
  /** The installed Android System WebView supports document-start scripts and web message listeners. */
  supported: boolean;
  /** Why not (e.g. "Update Android System WebView from the Play Store"). */
  reason?: string;
  /** Installed WebView package version, for diagnostics. */
  webViewVersion?: string;
}

export interface OpenOptions {
  /** The job's application URL (http/https only). */
  url: string;
  /** The form agent bundle (AGENT_SCRIPT from @job-automator/form-engine remote). Injected at document start in every frame. */
  agentScript: string;
  /** Title in the bar above the page (default: the page title). */
  title?: string;
}

export type BlockedReason = 'google_sign_in' | 'external_link';

export interface ApplyBrowserPlugin {
  isSupported(): Promise<SupportResult>;
  /** Show the apply WebView over the app and load `url`. Replaces an open one. */
  open(options: OpenOptions): Promise<void>;
  /** Deliver one agent request to a frame (by the frameId from its hello). */
  postMessage(options: { frameId: string; data: string }): Promise<void>;
  /** Bring the WebView back on screen (fill, sign-in, CAPTCHA, submit). */
  show(): Promise<void>;
  /** Put it behind the app (review screen). The page stays loaded. */
  hide(): Promise<void>;
  /** Destroy the WebView. Cookies (portal sign-ins) are kept. */
  close(): Promise<void>;

  /** Agent messages (JSON strings, see AgentMessage) from every frame. */
  addListener(eventName: 'message', listener: (event: { data: string }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'navigation', listener: (event: { url: string; loading: boolean }) => void): Promise<PluginListenerHandle>;
  /**
   * A navigation was stopped: Google sign-in (Google refuses OAuth inside embedded WebViews) or a
   * non-web link (mailto:, tel:, intent:). The app explains it and may offer to open the URL outside.
   */
  addListener(eventName: 'blocked', listener: (event: { reason: BlockedReason; url: string }) => void): Promise<PluginListenerHandle>;
  /** The candidate left the WebView ("Back to Nomadic" or the back button on the first page). */
  addListener(eventName: 'hidden', listener: () => void): Promise<PluginListenerHandle>;
  /** The WebView is gone: closed by the app, or its renderer crashed (the app survives; fill again). */
  addListener(eventName: 'closed', listener: (event: { reason: 'app' | 'crashed' }) => void): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

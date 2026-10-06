import { WebPlugin } from '@capacitor/core';
import type { ApplyBrowserPlugin, SupportResult } from './definitions.js';

/** Browser preview: there is no embeddable WebView, so apply is unavailable (the app says so). */
export class ApplyBrowserWeb extends WebPlugin implements Partial<ApplyBrowserPlugin> {
  async isSupported(): Promise<SupportResult> {
    return { supported: false, reason: 'Apply with review needs the Android app.' };
  }
  async open(): Promise<void> {
    throw this.unavailable('Apply with review needs the Android app.');
  }
  async postMessage(): Promise<void> {
    throw this.unavailable('Apply with review needs the Android app.');
  }
  async show(): Promise<void> {}
  async hide(): Promise<void> {}
  async close(): Promise<void> {}
}

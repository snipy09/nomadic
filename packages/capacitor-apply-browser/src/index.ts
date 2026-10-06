/**
 * Apply with review on Android.
 *
 *   const session = await openApplyBrowser(ApplyBrowser, job.url);   // WebView over the app, agent in every frame
 *   const result = await fillApplication(session.channel, { profile, llm, resolveResume, loadFile, ctx });
 *   await ApplyBrowser.hide();                                        // review screen: every field, source, edits
 *   await ApplyBrowser.show();                                        // the candidate sees the submission
 *   await submitReviewed(result.handle!, overrides, { reviewed: true });
 *   await session.close();
 */
import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import type { ApplyBrowserPlugin } from './definitions.js';
import { AGENT_SCRIPT, AgentChannel, type BridgeTransport } from '../../form-engine/src/remote/index.js';

export * from './definitions.js';

export const ApplyBrowser = registerPlugin<ApplyBrowserPlugin>('ApplyBrowser', {
  web: () => import('./web.js').then((m) => new m.ApplyBrowserWeb()),
});

/** BridgeTransport over the plugin: requests go out with postMessage, agent messages come in as 'message' events. */
export function pluginTransport(plugin: Pick<ApplyBrowserPlugin, 'postMessage' | 'addListener'>): BridgeTransport & { ready: Promise<void> } {
  const listeners = new Set<(data: string) => void>();
  let handle: PluginListenerHandle | null = null;
  const ready = plugin.addListener('message', (e) => { for (const l of listeners) l(e.data); }).then((h) => { handle = h; });
  return {
    ready,
    send: (frameId, data) => plugin.postMessage({ frameId, data }),
    onMessage(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
        if (!listeners.size) void ready.then(() => handle?.remove());
      };
    },
  };
}

export interface ApplySession {
  channel: AgentChannel;
  close(): Promise<void>;
}

/**
 * Open a job's application page in the apply WebView with the agent injected. The channel is
 * listening before the page starts loading, so no frame's hello is missed.
 */
export async function openApplyBrowser(plugin: ApplyBrowserPlugin, url: string, opts: { title?: string; agentScript?: string } = {}): Promise<ApplySession> {
  if (!/^https?:\/\//i.test(url)) throw new Error('Only http(s) application links can be opened.');
  const support = await plugin.isSupported();
  if (!support.supported) throw new Error(support.reason || 'This phone\'s WebView cannot run apply. Update "Android System WebView" from the Play Store.');
  const transport = pluginTransport(plugin);
  await transport.ready;
  const channel = new AgentChannel(transport);
  try {
    await plugin.open({ url, agentScript: opts.agentScript ?? AGENT_SCRIPT, title: opts.title });
  } catch (err) {
    channel.close();
    throw err;
  }
  return {
    channel,
    async close() {
      channel.close();
      await plugin.close();
    },
  };
}

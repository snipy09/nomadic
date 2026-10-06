/**
 * The Android path: the in-page agent (injected at document start into every frame) driven
 * by the remote engine over the `nomadicBridge` message bridge, in a phone-sized touch
 * context, with pages served under a strict CSP (no eval, no inline script). Uses no
 * Playwright input at all: every click, keystroke and upload comes from the agent.
 */
import fs from 'fs';
import path from 'path';
import { devices, type BrowserContext } from 'playwright';
import type { BenchEngine, EngineRunInfo } from './types.ts';
import { MockLlm } from './new.ts';
import { AgentChannel } from '../../../form-engine/src/remote/channel.ts';
import { fillApplication } from '../../../form-engine/src/remote/apply.ts';
import { attachPlaywrightBridge } from '../../../form-engine/src/remote/playwright-bridge.ts';
import type { PortalId } from '../../../form-engine/src/adapters.ts';

const ADAPTER_FOR_ATS: Record<string, PortalId> = { ashby: 'ashby', greenhouse: 'greenhouse', lever: 'lever', internshala: 'internshala', workday: 'workday', other: 'generic' };

const MIME: Record<string, string> = { '.pdf': 'application/pdf', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };

export function createAgentEngine(opts: { llm: 'mock' | 'none' }): BenchEngine {
  let channel: AgentChannel | null = null;
  return {
    name: 'agent',
    contextOptions: { ...devices['Pixel 7'] },
    // No 'unsafe-eval' (page code cannot eval); inline handlers stay allowed because the fixtures' submit buttons use them.
    csp: "script-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'",
    async setupContext(context: BrowserContext) {
      channel?.close();
      channel = new AgentChannel(await attachPlaywrightBridge(context));
    },
    async run(_page, profile, key): Promise<EngineRunInfo> {
      if (!channel) throw new Error('setupContext was not called');
      const llm = opts.llm === 'mock' ? new MockLlm() : null;
      const res = await fillApplication(channel, {
        profile,
        portal: ADAPTER_FOR_ATS[key.ats] || 'generic',
        llm,
        resolveResume: (p) => p.resumeFilePath || null,
        loadFile: async (ref) => {
          if (!fs.existsSync(ref)) return null;
          return { name: path.basename(ref), mimeType: MIME[path.extname(ref).toLowerCase()] || 'application/octet-stream', base64: fs.readFileSync(ref).toString('base64') };
        },
      });
      const report = res.report;
      if (res.status === 'error') throw new Error(res.error);
      return {
        fields: report?.fields.map((o) => ({
          frameIndex: o.field.frameIndex,
          selector: o.field.selector,
          shadowHostPath: o.field.shadowHostPath,
          optionSelectors: (o.field.options || []).map((x) => x.selector).filter((s): s is string => !!s),
        })) || [],
        needsUser: report?.needsUser,
        walls: report?.walls,
        llmCalls: report?.llmCalls,
        notes: [`status ${res.status}`, ...(report?.fields.filter((o) => o.status === 'failed').map((o) => `failed: ${o.field.label}: ${o.reason}`) || [])],
      };
    },
  };
}

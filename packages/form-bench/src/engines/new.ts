/**
 * The new FormEngine, driven exactly as the app drives it: ATS adapter
 * (prepare) -> FormEngine.fill / fillSteps. Submit is never called.
 */
import type { BenchEngine, EngineRunInfo } from './types.ts';
import { adapterById, runPortalAdapter } from '../../../automation/src/bots/portal-adapter.ts';
import type { LlmClient } from '../../../form-engine/src/llm.ts';

/**
 * Deterministic stand-in for the single batched Groq call. It only answers the
 * open-ended questions it is sent (the engine never sends profile facts or
 * legal/EEO questions to the model).
 */
export class MockLlm implements LlmClient {
  calls = 0;
  async completeJson(_system: string, user: string): Promise<unknown> {
    this.calls++;
    const payload = JSON.parse(user) as { CANDIDATE: { summary?: string }; QUESTIONS: Array<{ id: string; question: string }> };
    const answers: Record<string, string> = {};
    for (const q of payload.QUESTIONS) answers[q.id] = `${payload.CANDIDATE.summary || 'Experienced engineer.'} (answer to: ${q.question})`;
    return { answers };
  }
}

const ADAPTER_FOR_ATS: Record<string, string> = { ashby: 'ashby', greenhouse: 'greenhouse', lever: 'lever', internshala: 'internshala', workday: 'workday', other: 'generic' };

export function createNewEngine(opts: { llm: 'mock' | 'none' }): BenchEngine {
  return {
    name: 'new',
    async run(page, profile, key): Promise<EngineRunInfo> {
      const llm = opts.llm === 'mock' ? new MockLlm() : null;
      const adapter = adapterById(ADAPTER_FOR_ATS[key.ats] || 'generic');
      const { report } = await runPortalAdapter(page, profile, adapter, { engineOptions: { llm } });
      return {
        fields: report.fields.map((o) => ({
          frameIndex: o.field.frameIndex,
          selector: o.field.selector,
          shadowHostPath: o.field.shadowHostPath,
          optionSelectors: (o.field.options || []).map((x) => x.selector).filter((s): s is string => !!s),
        })),
        needsUser: report.needsUser,
        walls: report.walls,
        llmCalls: report.llmCalls,
        notes: report.fields.filter((o) => o.status === 'failed').map((o) => `failed: ${o.field.label}: ${o.reason}`),
      };
    },
  };
}

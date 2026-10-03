import type { AssistantReply, AssistantRequest } from '../../shared/ipc.js';
import { log } from './app-context.js';

// ── Nomadic Assistant (hidden behind a feature flag, decision 4) ────────────
// The app reaches an LLM only through the server-side ai-proxy, whose task
// allow-list is form answers, practice feedback and roadmap explanation. A
// general chat assistant is not one of them, so this answers honestly that it
// is unavailable instead of inventing a reply.
export async function askNomadicAssistant(data: AssistantRequest): Promise<AssistantReply> {
  log(`[Nomadic Assistant] Unavailable (not an ai-proxy task); query of ${data.message.length} chars ignored.`);
  return {
    success: false,
    reply: 'The AI assistant is not available in this version of Nomadic.',
    action: { type: 'NONE' },
  };
}
